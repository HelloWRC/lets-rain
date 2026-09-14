import { describe, expect, it } from 'vitest'
import { STAGES } from '../game/stages'
import type { Size, Vec2 } from '../game/types'
import {
  ButtonDrift,
  SAFE_PAD,
  clampCenterToSafeArea,
  clampDisplacement,
  dodgeOffset,
  maxDisplacement,
  windOffset,
} from '../game/wind'

const VIEWPORT = { w: 1280, h: 800 }
const BUTTON: Size = { w: 180, h: 180 }
const HOME: Vec2 = { x: VIEWPORT.w / 2, y: VIEWPORT.h / 2 }
const SEVERE = STAGES[STAGES.length - 1]!

/** 确定性伪随机（不用 Math.random，保证可复现） */
function lcg(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

describe('风场', () => {
  it('是连续函数：16ms 步进下的位移增量很小，不会瞬移', () => {
    for (const stage of STAGES) {
      let prev = windOffset(0, stage.wind, 0.5)
      for (let t = 1 / 60; t <= 8; t += 1 / 60) {
        const cur = windOffset(t, stage.wind, 0.5)
        const delta = Math.hypot(cur.x - prev.x, cur.y - prev.y)
        expect(delta).toBeLessThan(8)
        prev = cur
      }
    }
  })

  it('是纯函数：相同输入永远给出相同输出（无隐藏随机）', () => {
    const a = windOffset(12.345, SEVERE.wind, 0.8)
    const b = windOffset(12.345, SEVERE.wind, 0.8)
    expect(a).toEqual(b)
  })

  it('阶段内进度越高，风的整体幅值越大', () => {
    // 瞬时值会随相位变化，这里比较一段时间窗口内的峰值幅值。
    const peak = (intensity: number): number => {
      let max = 0
      for (let t = 0; t <= 40; t += 0.02) {
        max = Math.max(max, Math.abs(windOffset(t, SEVERE.wind, intensity).x))
      }
      return max
    }
    const calm = peak(0)
    const strong = peak(1)
    expect(strong).toBeGreaterThan(calm * 1.3)
  })

  it('轻松模式（ampScale 0.5）把风场幅值减半', () => {
    const full = windOffset(5.5, SEVERE.wind, 0.4, 1)
    const easy = windOffset(5.5, SEVERE.wind, 0.4, 0.5)
    expect(easy.x).toBeCloseTo(full.x * 0.5, 9)
    expect(easy.y).toBeCloseTo(full.y * 0.5, 9)
  })
})

describe('躲避指针', () => {
  it('指针在感应半径之外时，躲避分量为 0', () => {
    const radius = Math.max(BUTTON.w, BUTTON.h) * SEVERE.wind.dodgeRadius
    const pointer = { x: HOME.x + radius + 50, y: HOME.y }
    expect(
      dodgeOffset({
        home: HOME,
        pointer,
        buttonSize: BUTTON,
        viewport: VIEWPORT,
        profile: SEVERE.wind,
      }),
    ).toEqual({ x: 0, y: 0 })
  })

  it('指针正落在按钮中心时躲避为 0 —— 不存在绝对打不到的死局', () => {
    expect(
      dodgeOffset({
        home: HOME,
        pointer: { ...HOME },
        buttonSize: BUTTON,
        viewport: VIEWPORT,
        profile: SEVERE.wind,
      }),
    ).toEqual({ x: 0, y: 0 })
  })

  it('指针靠近时朝远离指针的方向逃，且推力随距离变大', () => {
    const near = dodgeOffset({
      home: HOME,
      pointer: { x: HOME.x - 100, y: HOME.y },
      buttonSize: BUTTON,
      viewport: VIEWPORT,
      profile: SEVERE.wind,
    })
    const far = dodgeOffset({
      home: HOME,
      pointer: { x: HOME.x - 380, y: HOME.y },
      buttonSize: BUTTON,
      viewport: VIEWPORT,
      profile: SEVERE.wind,
    })
    expect(near.x).toBeGreaterThan(0) // 指针在左侧 → 向右逃
    expect(near.y).toBeCloseTo(0, 6)
    expect(near.x).toBeGreaterThan(far.x)
  })

  it('晴天与多云完全不躲，轻松模式强制关闭躲避', () => {
    const input = {
      home: HOME,
      pointer: { x: HOME.x - 60, y: HOME.y },
      buttonSize: BUTTON,
      viewport: VIEWPORT,
    }
    expect(dodgeOffset({ ...input, profile: STAGES[0]!.wind })).toEqual({ x: 0, y: 0 })
    expect(dodgeOffset({ ...input, profile: STAGES[1]!.wind })).toEqual({ x: 0, y: 0 })
    expect(dodgeOffset({ ...input, profile: SEVERE.wind, easyMode: true })).toEqual({ x: 0, y: 0 })
  })

  it('触屏降级：dodgeScale 按比例削弱躲避推力', () => {
    const input = {
      home: HOME,
      pointer: { x: HOME.x - 60, y: HOME.y },
      buttonSize: BUTTON,
      viewport: VIEWPORT,
      profile: SEVERE.wind,
    }
    const full = dodgeOffset({ ...input, dodgeScale: 1 })
    const touch = dodgeOffset({ ...input, dodgeScale: 0.55 })
    expect(touch.x).toBeCloseTo(full.x * 0.55, 6)
    expect(dodgeOffset({ ...input, dodgeScale: 0 })).toEqual({ x: 0, y: 0 })
  })

  it('无指针（触屏未按下 / 鼠标未移动）时不躲', () => {
    expect(
      dodgeOffset({
        home: HOME,
        pointer: null,
        buttonSize: BUTTON,
        viewport: VIEWPORT,
        profile: SEVERE.wind,
      }),
    ).toEqual({ x: 0, y: 0 })
  })
})

describe('幅度与安全区约束', () => {
  it('椭圆形钳制把超界位移压回边界内', () => {
    const viewport = { w: 1000, h: 600 }
    const max = maxDisplacement(viewport)
    const clamped = clampDisplacement({ x: max.x * 5, y: max.y * 5 }, viewport)
    expect(Math.abs(clamped.x)).toBeLessThanOrEqual(max.x + 1e-6)
    expect(Math.abs(clamped.y)).toBeLessThanOrEqual(max.y + 1e-6)
    const inside = { x: max.x * 0.4, y: max.y * 0.3 }
    expect(clampDisplacement(inside, viewport)).toEqual(inside)
  })

  it('按钮中心被夹进安全区', () => {
    const size = { w: 160, h: 160 }
    const viewport = { w: 800, h: 600 }
    const clamped = clampCenterToSafeArea({ x: -500, y: 99999 }, size, viewport)
    expect(clamped.x).toBe(SAFE_PAD + size.w / 2)
    expect(clamped.y).toBe(viewport.h - SAFE_PAD - size.h / 2)
  })

  it('随机 1000 组视口/指针/阶段输入下，幅度不越界且按钮始终留在屏幕内', () => {
    const rand = lcg(20240607)
    const drift = new ButtonDrift()

    for (let i = 0; i < 1000; i += 1) {
      const viewport = { w: 320 + rand() * 1600, h: 480 + rand() * 900 }
      const buttonSize = { w: 80 + rand() * 100, h: 80 + rand() * 100 }
      const home = { x: viewport.w / 2, y: viewport.h / 2 }
      const stage = STAGES[Math.floor(rand() * STAGES.length)]!
      const pointer = { x: rand() * viewport.w, y: rand() * viewport.h }

      const offset = drift.update(
        1 / 60,
        rand() * 60,
        {
          home,
          buttonSize,
          viewport,
          profile: stage.wind,
          intensity: rand(),
          easyMode: rand() < 0.2,
        },
        pointer,
      )

      const max = maxDisplacement(viewport)
      expect(Math.abs(offset.x)).toBeLessThanOrEqual(max.x + 1e-6)
      expect(Math.abs(offset.y)).toBeLessThanOrEqual(max.y + 1e-6)

      const minX = SAFE_PAD + buttonSize.w / 2
      const maxX = viewport.w - SAFE_PAD - buttonSize.w / 2
      const minY = SAFE_PAD + buttonSize.h / 2
      const maxY = viewport.h - SAFE_PAD - buttonSize.h / 2
      const centerX = home.x + offset.x
      const centerY = home.y + offset.y
      if (minX <= maxX) {
        expect(centerX).toBeGreaterThanOrEqual(minX - 1e-6)
        expect(centerX).toBeLessThanOrEqual(maxX + 1e-6)
      }
      if (minY <= maxY) {
        expect(centerY).toBeGreaterThanOrEqual(minY - 1e-6)
        expect(centerY).toBeLessThanOrEqual(maxY + 1e-6)
      }
    }
  })
})

describe('按钮漂移器', () => {
  it('有指针逼近时，按钮相对"无指针"基准朝远离指针方向偏移', () => {
    const cfg = {
      home: HOME,
      buttonSize: BUTTON,
      viewport: VIEWPORT,
      profile: SEVERE.wind,
      intensity: 0.5,
      easyMode: false,
    }
    const pointer = { x: HOME.x - 150, y: HOME.y }
    const withPointer = new ButtonDrift()
    const baseline = new ButtonDrift()
    let a = { x: 0, y: 0 }
    let b = { x: 0, y: 0 }

    for (let i = 0; i < 240; i += 1) {
      const t = i / 60
      a = { ...withPointer.update(1 / 60, t, cfg, pointer) }
      b = { ...baseline.update(1 / 60, t, cfg, null) }
    }

    expect(a.x - b.x).toBeGreaterThan(30)
    expect(Math.abs(a.y - b.y)).toBeLessThan(20)
  })

  it('reset() 把位移归零', () => {
    const drift = new ButtonDrift()
    drift.update(1 / 60, 3, {
      home: HOME,
      buttonSize: BUTTON,
      viewport: VIEWPORT,
      profile: SEVERE.wind,
      intensity: 1,
      easyMode: false,
    }, { x: HOME.x - 50, y: HOME.y })
    drift.reset()
    expect(drift.offset).toEqual({ x: 0, y: 0 })
  })

  it('长时间推进后位移仍是有限的（不会累积发散）', () => {
    const drift = new ButtonDrift()
    const cfg = {
      home: HOME,
      buttonSize: BUTTON,
      viewport: VIEWPORT,
      profile: SEVERE.wind,
      intensity: 1,
      easyMode: false,
    }
    let maxSeen = 0
    for (let i = 0; i < 3000; i += 1) {
      const offset = drift.update(1 / 60, i / 60, cfg, { x: rand2(i), y: rand2(i + 7) })
      maxSeen = Math.max(maxSeen, Math.hypot(offset.x, offset.y))
    }
    const limit = maxDisplacement(VIEWPORT)
    expect(maxSeen).toBeLessThanOrEqual(Math.hypot(limit.x, limit.y) + 1e-6)
  })
})

/** 供上一条测试使用的确定性指针轨迹 */
function rand2(seed: number): number {
  return HOME.x + Math.sin(seed * 0.37) * 300
}
