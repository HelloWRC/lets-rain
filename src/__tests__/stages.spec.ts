import { describe, expect, it } from 'vitest'
import { STAGES, comboMultiplier, stageAt } from '../game/stages'

const EXPECTED_NAMES = ['晴天', '多云', '阴天', '雨', '暴雨', '强对流']
const EXPECTED_KEYS = ['sunny', 'cloudy', 'overcast', 'rain', 'storm', 'severe']

describe('阶段数据表', () => {
  it('阶段顺序与需求完全一致', () => {
    expect(STAGES.map((stage) => stage.name)).toEqual(EXPECTED_NAMES)
    expect(STAGES.map((stage) => stage.key)).toEqual(EXPECTED_KEYS)
  })

  it('index 连续且从 0 开始', () => {
    STAGES.forEach((stage, i) => expect(stage.index).toBe(i))
  })

  it('难度随阶段单调上升：增益递减、衰减递增、风力递增、躲避强度不降', () => {
    for (let i = 1; i < STAGES.length; i += 1) {
      const prev = STAGES[i - 1]!
      const cur = STAGES[i]!
      expect(cur.advanceGain).toBeLessThan(prev.advanceGain)
      expect(cur.decayPerSec).toBeGreaterThan(prev.decayPerSec)
      expect(cur.wind.amp).toBeGreaterThan(prev.wind.amp)
      expect(cur.wind.dodge).toBeGreaterThanOrEqual(prev.wind.dodge)
      expect(cur.effects.lightningPerSecond).toBeGreaterThanOrEqual(prev.effects.lightningPerSecond)
    }
  })

  it('最后一个阶段是唯一会躲指针到底的阶段', () => {
    expect(STAGES[0]!.wind.dodge).toBe(0)
    expect(STAGES[STAGES.length - 1]!.wind.dodge).toBe(1)
  })

  it('每个阶段都定义了配色、音效、特效与祈祷词', () => {
    for (const stage of STAGES) {
      expect(stage.audio.click).toBeTruthy()
      expect(stage.prayers.length).toBeGreaterThanOrEqual(3)
      expect(Object.keys(stage.effects).length).toBeGreaterThan(15)
      expect(stage.graceMs).toBeGreaterThan(0)
      expect(stage.tagline.length).toBeGreaterThan(0)
      expect(stage.hint.length).toBeGreaterThan(0)
    }
  })

  it('配色全部是合法的十六进制颜色', () => {
    for (const stage of STAGES) {
      for (const [key, value] of Object.entries(stage.palette)) {
        if (key === 'vignetteStrength') {
          expect(typeof value).toBe('number')
          continue
        }
        expect(String(value)).toMatch(/^#[0-9a-f]{6}$/i)
      }
    }
  })

  it('阴天是"有闪无雷"，暴雨与强对流才有雷声', () => {
    expect(stageAt(2).effects.lightningPerSecond).toBeGreaterThan(0)
    expect(stageAt(2).audio.thunderAudible).toBe(false)
    expect(stageAt(4).audio.thunderAudible).toBe(true)
    expect(stageAt(5).audio.thunderAudible).toBe(true)
    expect(stageAt(5).audio.siren).toBe(true)
  })

  it('stageAt 越界时被钳制到两端', () => {
    expect(stageAt(-5).name).toBe('晴天')
    expect(stageAt(0.7).name).toBe('晴天')
    expect(stageAt(99).name).toBe('强对流')
  })
})

describe('连击倍率', () => {
  it('按 8 / 16 / 28 分档，上限 1.75', () => {
    expect(comboMultiplier(0)).toBe(1)
    expect(comboMultiplier(7)).toBe(1)
    expect(comboMultiplier(8)).toBe(1.25)
    expect(comboMultiplier(15)).toBe(1.25)
    expect(comboMultiplier(16)).toBe(1.5)
    expect(comboMultiplier(27)).toBe(1.5)
    expect(comboMultiplier(28)).toBe(1.75)
    expect(comboMultiplier(9999)).toBe(1.75)
  })
})
