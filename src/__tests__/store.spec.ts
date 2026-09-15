import { describe, expect, it } from 'vitest'
import { createGameStore, type GameStore } from '../game/store'
import { CARRY_MAX, LAST_STAGE_INDEX, STAGES, stageAt } from '../game/stages'

/** 固定随机源 → 增益浮动恒为 ×1.0，测试完全确定。 */
function makeStore(): GameStore {
  return createGameStore({ persist: false, random: () => 0.5 })
}

function tickFor(store: GameStore, seconds: number, stepMs = 100): void {
  const steps = Math.round((seconds * 1000) / stepMs)
  for (let i = 0; i < steps; i += 1) store.tick(stepMs)
}

/** 一路点到指定阶段（把进度直接推满，避免测试依赖具体数值）。 */
function reachStage(store: GameStore, target: number): void {
  while (store.state.stageIndex < target) {
    store.state.stageProgress = 0.99
    store.click()
  }
}

describe('初始状态', () => {
  it('从晴天、零进度、零连击开始', () => {
    const store = makeStore()
    expect(store.state.stageIndex).toBe(0)
    expect(store.state.stageProgress).toBe(0)
    expect(store.state.combo).toBe(0)
    expect(store.state.completed).toBe(false)
    expect(store.stage.value.name).toBe('晴天')
  })

  it('每个阶段的自然衰减都是正数（"不点击会缓慢后退"）', () => {
    for (const stage of STAGES) {
      expect(stage.decayPerSec).toBeGreaterThan(0)
    }
  })
})

describe('点击推进进度', () => {
  it('单次点击按当前阶段增益累加，并累加诚心值与点击数', () => {
    const store = makeStore()
    const outcome = store.click()
    expect(outcome.multiplier).toBe(1)
    expect(outcome.gained).toBeCloseTo(STAGES[0]!.advanceGain, 6)
    expect(store.state.stageProgress).toBeCloseTo(STAGES[0]!.advanceGain, 6)
    expect(store.state.combo).toBe(1)
    expect(store.state.totalClicks).toBe(1)
    expect(store.state.totalPrayers).toBeCloseTo(STAGES[0]!.advanceGain, 6)
  })

  it('连击跨过阈值后倍率提升（快速连点更有效）', () => {
    const store = makeStore()
    for (let i = 0; i < 8; i += 1) store.click()
    expect(store.state.combo).toBe(8)
    expect(store.multiplier.value).toBe(1.25)

    const gain = store.stage.value.advanceGain
    const outcome = store.click()
    expect(outcome.multiplier).toBe(1.25)
    expect(outcome.gained).toBeCloseTo(gain * 1.25, 6)
  })
})

describe('阶段推进', () => {
  it('进度溢出时进入下一阶段，余量结转且不超过 CARRY_MAX', () => {
    const store = makeStore()
    const gain = STAGES[0]!.advanceGain
    // 数据表必须保证"首个阶段所需点击数 ≤ 8"，否则连击倍率会介入，本用例的算术不再成立
    const clicksNeeded = Math.ceil(1 / gain)
    expect(clicksNeeded).toBeLessThanOrEqual(8)

    for (let i = 1; i < clicksNeeded; i += 1) store.click()
    expect(store.state.stageIndex).toBe(0)
    expect(store.state.stageProgress).toBeCloseTo(gain * (clicksNeeded - 1), 6)

    store.click()
    expect(store.state.stageIndex).toBe(1)
    expect(store.stage.value.name).toBe('多云')
    expect(store.state.stageProgress).toBeCloseTo(gain * clicksNeeded - 1, 6)
    expect(store.state.stageProgress).toBeLessThanOrEqual(CARRY_MAX)
  })

  it('难度下限：单个阶段至少需要 5 次点击，全程至少 45 次，且任何一次点击都点不满一段', () => {
    for (const stage of STAGES) {
      expect(stage.advanceGain).toBeLessThanOrEqual(0.2)
      // 即使满连击倍率（×1.75）也不可能一次点满一个阶段
      expect(stage.advanceGain * 1.75).toBeLessThan(1)
    }
    const totalClicks = STAGES.reduce((sum, stage) => sum + Math.ceil(1 / stage.advanceGain), 0)
    expect(totalClicks).toBeGreaterThanOrEqual(45)
  })

  it('一次溢出不会跨过整个阶段（余量被钳制）', () => {
    const store = makeStore()
    // 直接注入一个"巨大增益"制造极端溢出，避免用例依赖数据表里的具体数值
    const stage0 = STAGES[0] as { advanceGain: number }
    const original = stage0.advanceGain
    try {
      stage0.advanceGain = 2
      store.state.stageProgress = 0.9
      const outcome = store.click()
      expect(outcome.gained).toBeGreaterThan(1)
      expect(store.state.stageIndex).toBe(1)
      expect(store.state.stageProgress).toBeCloseTo(CARRY_MAX, 9)
    } finally {
      stage0.advanceGain = original
    }
  })

  it('阶段只能按 晴天→多云→阴天→雨→暴雨→强对流 逐级推进', () => {
    const store = makeStore()
    const visited: string[] = [store.stage.value.name]
    store.events.on('advance', (event) => {
      visited.push(event.stage.name)
    })
    store.state.stageProgress = 0.99
    for (let i = 0; i < 400; i += 1) store.click()
    expect(visited).toEqual(['晴天', '多云', '阴天', '雨', '暴雨', '强对流'])
    expect(store.state.stageIndex).toBe(LAST_STAGE_INDEX)
  })
})

describe('自然回落（核心不变量）', () => {
  it('长时间不点击时阶段索引绝不回退，进度只回落到 0', () => {
    const store = makeStore()
    store.click()
    store.click()
    const stageBefore = store.state.stageIndex
    expect(store.state.stageProgress).toBeGreaterThan(0)

    tickFor(store, 300)

    expect(store.state.stageIndex).toBe(stageBefore)
    expect(store.state.stageProgress).toBe(0)
  })

  it('已经抵达暴雨后，闲置 5 分钟也不会退回阴天', () => {
    const store = makeStore()
    reachStage(store, 4)
    expect(store.state.stageIndex).toBe(4)

    tickFor(store, 300)

    expect(store.state.stageIndex).toBe(4)
    expect(store.stage.value.name).toBe('暴雨')
    expect(store.state.stageProgress).toBe(0)
  })

  it('进度衰减恒不为负', () => {
    const store = makeStore()
    tickFor(store, 60)
    expect(store.state.stageProgress).toBe(0)
  })

  it('点击后有一段衰减豁免窗口，窗口内进度不回落', () => {
    const store = makeStore()
    store.click()
    const afterClick = store.state.stageProgress

    store.tick(100)
    store.tick(100)
    expect(store.state.stageProgress).toBeCloseTo(afterClick, 9)

    store.tick(100) // 累计 300ms > graceMs(250)
    expect(store.state.stageProgress).toBeLessThan(afterClick)
  })

  it('单帧步进被钳制：极端卡顿（60 秒）只推进 100ms', () => {
    const store = makeStore()
    store.state.stageProgress = 0.9
    store.state.graceUntil = 0
    const clockBefore = store.state.clockMs

    store.tick(60_000)

    expect(store.state.clockMs - clockBefore).toBe(100)
    expect(store.state.stageProgress).toBeCloseTo(0.9 - stageAt(0).decayPerSec * 0.1, 6)
  })
})

describe('连击', () => {
  it('超过连击窗口后连击归零，但历史最高连击保留', () => {
    const store = makeStore()
    store.click()
    store.click()
    expect(store.state.combo).toBe(2)

    tickFor(store, 1)

    expect(store.state.combo).toBe(0)
    expect(store.state.maxCombo).toBe(2)
  })

  it('连击计时器在窗口内线性下降', () => {
    const store = makeStore()
    store.click()
    expect(store.comboTimer.value).toBeCloseTo(1, 6)
    store.tick(100)
    expect(store.comboTimer.value).toBeLessThan(1)
    expect(store.comboTimer.value).toBeGreaterThan(0)
  })
})

describe('求雨圆满', () => {
  it('在强对流推满进度后进入庆祝态，不再越界也不再回落', () => {
    const store = makeStore()
    store.state.stageIndex = LAST_STAGE_INDEX
    store.state.stageProgress = 0.99

    const outcome = store.click()
    expect(outcome.completed).toBe(true)
    expect(store.state.completed).toBe(true)
    expect(store.state.stageProgress).toBe(1)
    expect(store.state.stageIndex).toBe(LAST_STAGE_INDEX)

    store.click()
    expect(store.state.stageIndex).toBe(LAST_STAGE_INDEX)
    expect(store.state.stageProgress).toBe(1)

    tickFor(store, 120)
    expect(store.state.stageProgress).toBe(1)
    expect(store.state.stageIndex).toBe(LAST_STAGE_INDEX)
  })
})

describe('重置与事件', () => {
  it('reset() 回到初始态并保留历史记录', () => {
    const store = makeStore()
    reachStage(store, 2)
    tickFor(store, 2)
    const bestStage = store.best.bestStage

    store.reset()

    expect(store.state.stageIndex).toBe(0)
    expect(store.state.stageProgress).toBe(0)
    expect(store.state.totalClicks).toBe(0)
    expect(store.state.maxCombo).toBe(0)
    expect(store.state.completed).toBe(false)
    expect(store.best.bestStage).toBe(bestStage)
  })

  it('点击与升级都会发出事件，升级同时写入播报', () => {
    const store = makeStore()
    const clickStages: number[] = []
    const advanced: number[] = []
    store.events.on('click', (event) => clickStages.push(event.stageIndex))
    store.events.on('advance', (event) => advanced.push(event.to))

    // 点满第一个阶段（点击数由数据表决定，不写死）
    const clicksNeeded = Math.ceil(1 / STAGES[0]!.advanceGain) + 2
    for (let i = 0; i < clicksNeeded; i += 1) store.click(10, 20)

    expect(clickStages).toHaveLength(clicksNeeded)
    expect(advanced).toEqual([1])
    expect(store.feed.value.some((item) => item.kind === 'stage')).toBe(true)
    expect(store.feed.value.at(-1)?.text).toContain('多云')
  })

  it('手滑统计会累计并发出事件', () => {
    const store = makeStore()
    let last = 0
    store.events.on('miss', (event) => {
      last = event.misses
    })
    store.reportMiss(1, 2)
    store.reportMiss(3, 4)
    expect(last).toBe(2)
    expect(store.missCount.value).toBe(2)
  })
})
