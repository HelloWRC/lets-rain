/**
 * 游戏状态机（单例）。
 *
 * 核心不变量（由 store.spec.ts 守护）：
 *  1. stageIndex 单调不减 —— 不点击只会让"阶段内进度"缓慢回落到 0，绝不会退回上一阶段。
 *  2. stageProgress 恒在 [0, 1] 且不会低于 0。
 *  3. 阶段推进只由 stageProgress 溢出触发，余量结转有上限（不能一次点击跳整段）。
 *  4. 单帧步进被钳制在 MAX_TICK_MS，卡顿或切后台不会清空进度。
 */

import { computed, reactive, ref, type ComputedRef } from 'vue'
import { device } from './device'
import { Emitter } from './emitter'
import { MAX_TICK_MS, gameLoop } from './loop'
import { clamp } from './math'
import { DEFAULT_BEST, DEFAULT_PREFS, loadBest, loadPrefs, saveBest, savePrefs } from './prefs'
import { decayTransients, fadeRuntime, runtime } from './runtime'
import {
  CARRY_MAX,
  COMBO_WINDOW_MS,
  LAST_STAGE_INDEX,
  STAGES,
  comboMultiplier,
  comboNextTier,
  stageAt,
} from './stages'
import type {
  BestRecord,
  ClickOutcome,
  EffectsLevel,
  FeedItem,
  FeedKind,
  GameEvents,
  GameState,
  Prefs,
  StageDef,
} from './types'

/** 单次点击增益的随机浮动幅度（手感，不影响阶段判定逻辑） */
const GAIN_JITTER = 0.06
const FEED_LIMIT = 8
const COMBO_MILESTONE_BASE = [8, 16, 28]

export interface GameStoreOptions {
  /** 注入随机源，便于测试确定化 */
  random?: () => number
  /** 是否读写 localStorage（测试传 false） */
  persist?: boolean
}

function isComboMilestone(combo: number): boolean {
  return COMBO_MILESTONE_BASE.includes(combo) || combo % 50 === 0
}

export function createGameStore(options: GameStoreOptions = {}) {
  const random = options.random ?? Math.random
  const persist = options.persist ?? true

  const state = reactive<GameState>({
    stageIndex: 0,
    stageProgress: 0,
    combo: 0,
    maxCombo: 0,
    totalClicks: 0,
    totalPrayers: 0,
    completed: false,
    clockMs: 0,
    lastClickAt: 0,
    graceUntil: 0,
    stageEnteredAt: 0,
    runStartedAt: 0,
  })

  const best = reactive<BestRecord>(persist ? loadBest() : { ...DEFAULT_BEST })
  const prefs = reactive<Prefs>(persist ? loadPrefs() : { ...DEFAULT_PREFS })
  const feed = ref<FeedItem[]>([])
  const missCount = ref(0)
  const events = new Emitter<GameEvents>()

  let feedSeq = 0
  let detachLoop: (() => void) | null = null

  const stage: ComputedRef<StageDef> = computed(() => stageAt(state.stageIndex))
  const nextStage: ComputedRef<StageDef | null> = computed(() =>
    state.stageIndex < LAST_STAGE_INDEX ? stageAt(state.stageIndex + 1) : null,
  )
  const percent = computed(() => state.stageProgress * 100)
  const overallPercent = computed(() => ((state.stageIndex + state.stageProgress) / STAGES.length) * 100)
  const multiplier = computed(() => comboMultiplier(state.combo))
  const comboTimer = computed(() => {
    if (state.combo <= 0) return 0
    return clamp((COMBO_WINDOW_MS - (state.clockMs - state.lastClickAt)) / COMBO_WINDOW_MS, 0, 1)
  })
  const nextTier = computed(() => comboNextTier(state.combo))
  const stageElapsedMs = computed(() => Math.max(0, state.clockMs - state.stageEnteredAt))
  const runElapsedMs = computed(() => Math.max(0, state.clockMs - state.runStartedAt))
  const decayPerSecond = computed(() => stageAt(state.stageIndex).decayPerSec * (prefs.easyMode ? 0.8 : 1))
  const atFinalStage = computed(() => state.stageIndex === LAST_STAGE_INDEX)

  /**
   * 特效档位：三个来源决定 ——
   *  1. 触屏设备：默认直接进入「极简」（缓解闪烁是第一优先，手机上尤其明显）；
   *     用户在移动端手动打开「减弱特效」也给极简（他明确要更少特效）；
   *     用户在移动端把自动关掉（mobileAutoReduce=false 且 reduceFx=false）才是完整特效。
   *  2. 用户在桌面手动打开「减弱特效」，或系统偏好 prefers-reduced-motion → 「减弱」。
   *  3. 其余 → 「完整」。
   * 注意这里用 isTouch 而不是 isMobile：桌面端把窗口拖窄不该被自动降级。
   */
  const effectsLevel = computed<EffectsLevel>(() => {
    if (device.isTouch && (prefs.mobileAutoReduce || prefs.reduceFx)) return 'minimal'
    if (prefs.reduceFx || device.prefersReducedMotion) return 'reduced'
    return 'full'
  })

  /** 是否至少进入"减弱"档（兼容旧调用点） */
  const effectsReduced = computed(() => effectsLevel.value !== 'full')

  /** 是否处于「极简」档（移动端自动） */
  const effectsMinimal = computed(() => effectsLevel.value === 'minimal')

  /** 渲染安全模式（?safe=1）：只保留纯色背景 + 按钮 + 面板 */
  const safeRender = computed(() => prefs.safeRender)

  /**
   * 处理 URL 上的 safe 开关：`?safe=1` 打开、`?safe=0` 关闭（会持久化）。
   * 用途：移动端出现"内容/整页变黑"这类合成器异常时的兜底与排查手段。
   */
  function applySafeRenderFromUrl(search: string): void {
    const match = /[?&]safe=(0|1)\b/.exec(search)
    if (!match) return
    const value = match[1] === '1'
    if (prefs.safeRender === value) return
    prefs.safeRender = value
    if (value) {
      // 安全模式下顺带把动效也压到最低
      prefs.reduceFx = true
      prefs.mobileAutoReduce = false
    }
    if (persist) savePrefs(prefs)
    pushFeed('info', value ? '已开启渲染安全模式' : '已关闭渲染安全模式')
  }

  /** 档位当前是否由移动端自动接管（用于控制栏文案） */
  const effectsAuto = computed(
    () => effectsLevel.value === 'minimal' && prefs.mobileAutoReduce && !prefs.reduceFx,
  )

  function persistBest(): void {
    if (persist) saveBest(best)
  }

  function pushFeed(kind: FeedKind, text: string): void {
    feedSeq += 1
    const items = feed.value
    items.push({ id: feedSeq, kind, text, at: state.clockMs })
    if (items.length > FEED_LIMIT) items.splice(0, items.length - FEED_LIMIT)
  }

  /** 推进一帧。dtMs 会被钳制；测试里可直接调用以获得确定性。 */
  function tick(dtMs: number): void {
    const step = clamp(dtMs, 0, MAX_TICK_MS)
    if (step <= 0) return
    const dt = step / 1000
    state.clockMs += step
    runtime.time += dt
    runtime.stageIndex = state.stageIndex

    const def = stageAt(state.stageIndex)
    if (!state.completed) {
      if (state.clockMs < state.graceUntil) {
        runtime.decayPaused = true
      } else {
        runtime.decayPaused = false
        // 关键：下限钳制到 0。衰减永远不可能把进度压成负数，
        // 因此阶段索引不会因为"没点击"而回退 —— 这就是"不会返回到上个阶段"。
        const decay = def.decayPerSec * (prefs.easyMode ? 0.8 : 1) * dt
        state.stageProgress = Math.max(0, state.stageProgress - decay)
      }
    }

    if (state.combo > 0 && state.clockMs - state.lastClickAt > COMBO_WINDOW_MS) {
      state.combo = 0
    }

    runtime.intensity = state.stageProgress
    runtime.overall = (state.stageIndex + state.stageProgress) / STAGES.length
    fadeRuntime(dt)
    decayTransients(dt, state.completed ? 1 : 0)
  }

  /** 一次"求雨"点击。x/y 为视口坐标，仅用于表现层（浮字、爆点）。 */
  function click(x = 0, y = 0): ClickOutcome {
    const def = stageAt(state.stageIndex)
    const mult = comboMultiplier(state.combo)
    const gained = def.advanceGain * mult * (1 + (random() * 2 - 1) * GAIN_JITTER)
    const wasCompleted = state.completed

    state.combo += 1
    state.maxCombo = Math.max(state.maxCombo, state.combo)
    best.bestCombo = Math.max(best.bestCombo, state.combo)
    state.totalClicks += 1
    state.totalPrayers += gained
    state.lastClickAt = state.clockMs
    state.graceUntil = state.clockMs + def.graceMs

    let advanced = false
    if (!wasCompleted) {
      let next = state.stageProgress + gained
      if (next >= 1) {
        if (state.stageIndex < LAST_STAGE_INDEX) {
          next = Math.min(next - 1, CARRY_MAX)
          const from = state.stageIndex
          state.stageIndex = from + 1
          state.stageEnteredAt = state.clockMs
          runtime.stageIndex = state.stageIndex
          advanced = true
          const entered = stageAt(state.stageIndex)
          if (state.stageIndex > best.bestStage) best.bestStage = state.stageIndex
          persistBest()
          pushFeed('stage', `阶段 ${state.stageIndex + 1}/${STAGES.length} · ${entered.name} —— ${entered.tagline}`)
          events.emit('advance', { from, to: state.stageIndex, stage: entered })
        } else {
          next = 1
          state.completed = true
          best.bestStage = LAST_STAGE_INDEX
          best.completions += 1
          persistBest()
          pushFeed('stage', '求雨圆满 · 雷雨爆发，天地同应！')
          events.emit('complete', { totalMs: state.clockMs - state.runStartedAt })
        }
      }
      state.stageProgress = next
    }

    if (isComboMilestone(state.combo)) {
      best.bestCombo = Math.max(best.bestCombo, state.combo)
      persistBest()
      pushFeed('combo', `连击 ×${state.combo}！${def.name}的天在应你`)
    }

    const prayer = def.prayers[Math.floor(random() * def.prayers.length)] ?? def.prayers[0] ?? '求雨'
    events.emit('click', {
      gained,
      multiplier: mult,
      combo: state.combo,
      x,
      y,
      stageIndex: state.stageIndex,
      prayer,
    })

    return {
      gained,
      multiplier: mult,
      combo: state.combo,
      advanced,
      completed: state.completed,
    }
  }

  /** 指针落在按钮附近但没有命中（按钮飘走了）。 */
  function reportMiss(x: number, y: number): void {
    missCount.value += 1
    if (missCount.value === 1 || missCount.value % 5 === 0) {
      pushFeed('warn', `手滑 ×${missCount.value}…… 是风太大了，还是手慢了？`)
    }
    events.emit('miss', { x, y, misses: missCount.value })
  }

  function reset(): void {
    state.stageIndex = 0
    state.stageProgress = 0
    state.combo = 0
    state.maxCombo = 0
    state.totalClicks = 0
    state.totalPrayers = 0
    state.completed = false
    state.lastClickAt = 0
    state.graceUntil = 0
    state.stageEnteredAt = state.clockMs
    state.runStartedAt = state.clockMs
    missCount.value = 0
    runtime.stageIndex = 0
    runtime.intensity = 0
    runtime.overall = 0
    runtime.shake = 0
    runtime.flash = 0
    runtime.golden = 0
    feed.value = []
    persistBest()
    pushFeed('info', '天色恢复如初，重新开始求雨吧')
    events.emit('reset', undefined)
  }

  function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
    prefs[key] = value
    if (persist) savePrefs(prefs)
  }

  /**
   * 切换「减弱特效」。移动端上这一步同时表示"我确认要自己决定"，
   * 于是关闭自动接管（这样手机用户也能选择看完整特效）。
   */
  function toggleEffectsReduced(): void {
    const next = !effectsReduced.value
    prefs.reduceFx = next
    if (device.isTouch) prefs.mobileAutoReduce = false
    if (persist) savePrefs(prefs)
  }

  /** 恢复"跟随设备自动决定"。 */
  function resetEffectsAuto(): void {
    prefs.reduceFx = false
    prefs.mobileAutoReduce = true
    if (persist) savePrefs(prefs)
  }

  /** 挂到全局 rAF 循环，返回解绑函数。 */
  function attachLoop(): () => void {
    if (detachLoop) return detachLoop
    const off = gameLoop.subscribe((dt) => tick(dt))
    const detach = (): void => {
      off()
      detachLoop = null
    }
    detachLoop = detach
    return detach
  }

  return {
    state,
    best,
    prefs,
    feed,
    missCount,
    events,
    stage,
    nextStage,
    percent,
    overallPercent,
    multiplier,
    comboTimer,
    nextTier,
    stageElapsedMs,
    runElapsedMs,
    decayPerSecond,
    atFinalStage,
    effectsReduced,
    effectsMinimal,
    effectsLevel,
    effectsAuto,
    safeRender,
    applySafeRenderFromUrl,
    pushFeed,
    tick,
    click,
    reportMiss,
    reset,
    setPref,
    toggleEffectsReduced,
    resetEffectsAuto,
    attachLoop,
  }
}

export type GameStore = ReturnType<typeof createGameStore>

/** 全站共享的单例（App.vue 使用；测试请用 createGameStore 拿干净实例）。 */
export const gameStore: GameStore = createGameStore()
