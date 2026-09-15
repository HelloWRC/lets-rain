/**
 * 风场与按钮漂移 —— 全部为纯函数 / 确定式状态，不使用 Math.random，
 * 因此"同样的时间+同样的指针位置"永远给出同样的位移，可被单测穷举验证。
 *
 * 两条硬约束（由 wind.spec.ts 守护）：
 *  1. 位移幅度不超过视口比例上限（椭圆形边界）。
 *  2. 按钮（含自身尺寸）始终留在视口安全区内，永远不会飘出屏幕。
 */

import { clamp01, damp } from './math'
import type { Size, Vec2, WindProfile } from './types'

/** 相对视口的最大风场位移比例（调大 = 按钮能飘得更远，更难命中）。
 *  纵向比例给得更大：竖屏手机上竖向空间远多于横向，横向会被安全区先钳住。 */
const MAX_DX_RATIO = 0.44
const MAX_DY_RATIO = 0.44
/** 按钮与视口边缘的最小安全间距（px） */
export const SAFE_PAD = 10

export interface Viewport {
  w: number
  h: number
}

/** 按钮可以活动的矩形区域（视口坐标）。用来避开顶部轨道与底部 HUD/控制栏，
 *  否则位移一大，按钮就会钻到界面元素下面 —— 那里既看不见也点不到。 */
export interface PlayBounds {
  left: number
  top: number
  right: number
  bottom: number
}

export function maxDisplacement(viewport: Viewport): Vec2 {
  return { x: viewport.w * MAX_DX_RATIO, y: viewport.h * MAX_DY_RATIO }
}

/** 由视口推出默认活动区域（整屏内缩一个安全边距） */
export function boundsFromViewport(viewport: Viewport, pad = SAFE_PAD): PlayBounds {
  return { left: pad, top: pad, right: viewport.w - pad, bottom: viewport.h - pad }
}

function boundsSize(bounds: PlayBounds): Viewport {
  return {
    w: Math.max(0, bounds.right - bounds.left),
    h: Math.max(0, bounds.bottom - bounds.top),
  }
}

/** 把按钮中心夹进活动区域（按钮整体始终留在区域内，区域过小时居中） */
export function clampCenterToBounds(center: Vec2, size: Size, bounds: PlayBounds): Vec2 {
  const minX = bounds.left + size.w / 2
  const maxX = bounds.right - size.w / 2
  const minY = bounds.top + size.h / 2
  const maxY = bounds.bottom - size.h / 2
  return {
    x: minX > maxX ? (bounds.left + bounds.right) / 2 : Math.min(Math.max(center.x, minX), maxX),
    y: minY > maxY ? (bounds.top + bounds.bottom) / 2 : Math.min(Math.max(center.y, minY), maxY),
  }
}

/** 椭圆形幅度钳制：|x/maxX|² + |y/maxY|² 不超过 1。 */
export function clampDisplacement(offset: Vec2, viewport: Viewport): Vec2 {
  const max = maxDisplacement(viewport)
  if (max.x <= 0 || max.y <= 0) return { x: 0, y: 0 }
  const k = Math.hypot(offset.x / max.x, offset.y / max.y)
  if (k <= 1) return { x: offset.x, y: offset.y }
  return { x: offset.x / k, y: offset.y / k }
}

/** 把按钮中心夹进视口安全区（按钮整体始终可见、可点）。 */
export function clampCenterToSafeArea(
  center: Vec2,
  size: Size,
  viewport: Viewport,
  pad = SAFE_PAD,
): Vec2 {
  return clampCenterToBounds(center, size, boundsFromViewport(viewport, pad))
}

/**
 * 风场位移：三个不同频率/相位的正弦叠加（近似平滑噪声）+ 高频湍流。
 * intensity 为阶段内进度，越接近满阶段风越猛。
 */
export function windOffset(time: number, profile: WindProfile, intensity = 0, ampScale = 1): Vec2 {
  const k = clamp01(intensity)
  const amp = profile.amp * (0.6 + 0.4 * k) * ampScale
  const f = profile.freq * (1 + 0.35 * k)
  const t = time
  const base =
    0.55 * Math.sin(f * t) + 0.3 * Math.sin(1.7 * f * t + 1.3) + 0.15 * Math.sin(2.9 * f * t + 2.1)
  const turb =
    profile.jitter * (0.22 * Math.sin(6.1 * f * t + 0.7) + 0.14 * Math.sin(9.7 * f * t + 2.9))
  // 纵向分量：竖屏手机上竖向可用空间远大于横向，加大它才真正提高"飘得远"的观感与难度
  const vertical =
    0.6 * (0.62 * Math.sin(0.77 * f * t + 2.4) + 0.38 * Math.sin(1.9 * f * t + 0.4)) * (0.75 + 0.5 * k)
  return { x: amp * (base + turb), y: amp * vertical }
}

export interface DodgeInput {
  home: Vec2
  pointer: Vec2 | null
  buttonSize: Size
  viewport: Viewport
  profile: WindProfile
  easyMode?: boolean
  /** 躲避强度缩放（触屏设备默认调低：手指没有 hover，追一颗逃跑的按钮太挫败） */
  dodgeScale?: number
}

/**
 * 躲避位移：指针越靠近按钮中心，推力越强（1.4 次幂让"最后一段"逃得特别快）。
 * 指针正好落在中心时推力为 0 —— 保证按钮在数学上永远可被点中，
 * 不会出现"绝对打不到"的死局。
 */
export function dodgeOffset(input: DodgeInput): Vec2 {
  const { home, pointer, buttonSize, viewport, profile } = input
  if (input.easyMode || !pointer) return { x: 0, y: 0 }
  const strength = clamp01(profile.dodge) * clamp01(input.dodgeScale ?? 1)
  if (strength <= 0) return { x: 0, y: 0 }

  const dx = home.x - pointer.x
  const dy = home.y - pointer.y
  const dist = Math.hypot(dx, dy)
  const radius = Math.max(buttonSize.w, buttonSize.h) * profile.dodgeRadius
  if (radius <= 0 || dist > radius || dist < 1e-3) return { x: 0, y: 0 }

  const push = Math.pow(1 - dist / radius, 1.4)
  // 椭圆 reach：横竖各自按自己的可用范围取 62%。
  // 之前用 min(横向, 纵向) 会让竖屏手机（横向空间小）连纵向躲避也一起被压小，
  // 白白浪费了竖向那大片空间。
  const limit = maxDisplacement(viewport)
  const reachX = limit.x * 0.62
  const reachY = limit.y * 0.62
  const amount = strength * push
  return { x: (dx / dist) * reachX * amount, y: (dy / dist) * reachY * amount }
}

export interface DriftConfig {
  /** 按钮"家"位置（未位移时的中心，视口坐标） */
  home: Vec2
  buttonSize: Size
  viewport: Viewport
  profile: WindProfile
  /** 阶段内进度 0..1 */
  intensity: number
  easyMode: boolean
  /** 躲避强度缩放，默认 1（触屏用 0.85） */
  dodgeScale?: number
  /** 活动区域；不传则默认整屏内缩安全边距。传入"去掉顶部轨道与底部 HUD 之后"的区域，
   *  按钮就不会飘到界面元素下面去（那里既看不见也点不到）。 */
  bounds?: PlayBounds
}

/** 有状态的按钮漂移器：风场 + 带滞后平滑的躲避，输出已钳制的最终位移。 */
export class ButtonDrift {
  readonly offset: Vec2 = { x: 0, y: 0 }
  private readonly smoothedDodge: Vec2 = { x: 0, y: 0 }

  reset(): void {
    this.offset.x = 0
    this.offset.y = 0
    this.smoothedDodge.x = 0
    this.smoothedDodge.y = 0
  }

  /** 推进一帧，返回按钮相对 home 的位移（原地复用同一个对象）。 */
  update(dt: number, time: number, cfg: DriftConfig, pointer: Vec2 | null): Vec2 {
    const bounds = cfg.bounds ?? boundsFromViewport(cfg.viewport)
    const playSize = boundsSize(bounds)

    const wind = windOffset(time, cfg.profile, cfg.intensity, cfg.easyMode ? 0.5 : 1)
    const target = dodgeOffset({
      home: cfg.home,
      pointer,
      buttonSize: cfg.buttonSize,
      viewport: cfg.viewport,
      profile: cfg.profile,
      easyMode: cfg.easyMode,
      dodgeScale: cfg.dodgeScale,
    })
    const lag = Math.max(0.05, cfg.profile.dodgeLag)
    this.smoothedDodge.x = damp(this.smoothedDodge.x, target.x, 1 / lag, dt)
    this.smoothedDodge.y = damp(this.smoothedDodge.y, target.y, 1 / lag, dt)

    // 幅度上限按"活动区域"折算：区域小，允许的摆动也按比例小
    const bounded = clampDisplacement(
      { x: wind.x + this.smoothedDodge.x, y: wind.y + this.smoothedDodge.y },
      playSize,
    )
    const center = clampCenterToBounds(
      { x: cfg.home.x + bounded.x, y: cfg.home.y + bounded.y },
      cfg.buttonSize,
      bounds,
    )
    this.offset.x = center.x - cfg.home.x
    this.offset.y = center.y - cfg.home.y
    return this.offset
  }
}
