/**
 * 非响应式的"热"运行时状态。
 * 逐帧变化的值（按钮位移、抖动、调色板插值）放在这里，直接写 DOM style / canvas，
 * 绝不进入 Vue 响应式系统，避免每帧触发组件重渲染。
 */

import { mixHex } from './color'
import { lerp } from './math'
import { STAGES } from './stages'
import type { EffectProfile, EffectsLevel, StagePalette, Vec2 } from './types'

/** 配色/特效强度跟随阶段切换的平滑速度（1/秒） */
const RUNTIME_LAG = 1.15

export interface RuntimeState {
  /** 累积游戏时间（秒），由钳制后的 dt 累加，切标签页不会跳变 */
  time: number
  /** 当前阶段内进度 0..1 */
  intensity: number
  /** 全局进度 0..1 */
  overall: number
  stageIndex: number
  /** 是否处于点击豁免窗口（不衰减） */
  decayPaused: boolean
  palette: StagePalette
  effects: EffectProfile
  /** 当前风矢量（px） */
  wind: Vec2
  /** 按钮实际位移（风 + 躲避，已钳制） */
  buttonOffset: Vec2
  /** 指针位置（视口坐标），无指针时为 null */
  pointer: Vec2 | null
  /** 屏幕震动强度 */
  shake: number
  /** 全屏闪光强度 0..1 */
  flash: number
  /** 是否减弱特效（系统偏好或用户开关或移动端自动） */
  reduced: boolean
  /** 是否处于「极简」档：彻底不闪 */
  minimal: boolean
  /** 当前档位 */
  level: EffectsLevel
  /** 圆满庆祝强度 0..1 */
  golden: number
}

type PaletteColorKey = Exclude<keyof StagePalette, 'vignetteStrength'>

const PALETTE_COLOR_KEYS = (Object.keys(STAGES[0]?.palette ?? {}) as (keyof StagePalette)[]).filter(
  (key): key is PaletteColorKey => key !== 'vignetteStrength',
)

const EFFECT_KEYS = Object.keys(STAGES[0]?.effects ?? {}) as (keyof EffectProfile)[]

function initialPalette(): StagePalette {
  return { ...(STAGES[0] as (typeof STAGES)[number]).palette }
}

function initialEffects(): EffectProfile {
  return { ...(STAGES[0] as (typeof STAGES)[number]).effects }
}

export const runtime: RuntimeState = {
  time: 0,
  intensity: 0,
  overall: 0,
  stageIndex: 0,
  decayPaused: false,
  palette: initialPalette(),
  effects: initialEffects(),
  wind: { x: 0, y: 0 },
  buttonOffset: { x: 0, y: 0 },
  pointer: null,
  shake: 0,
  flash: 0,
  reduced: false,
  minimal: false,
  level: 'full',
  golden: 0,
}

/** 把配色与特效强度朝当前阶段的目标值平滑推进（原地修改，无分配压力之外的 GC 抖动）。 */
export function fadeRuntime(dt: number): void {
  const target = STAGES[runtime.stageIndex]
  if (!target) return
  const k = dt <= 0 ? 0 : 1 - Math.exp(-RUNTIME_LAG * dt)
  if (k <= 0) return
  for (const key of PALETTE_COLOR_KEYS) {
    runtime.palette[key] = mixHex(runtime.palette[key], target.palette[key], k)
  }
  runtime.palette.vignetteStrength = lerp(
    runtime.palette.vignetteStrength,
    target.palette.vignetteStrength,
    k,
  )
  for (const key of EFFECT_KEYS) {
    runtime.effects[key] = lerp(runtime.effects[key], target.effects[key], k)
  }
}

/** 震动/闪光/庆祝强度自然衰减。goldenTarget=1 时庆祝强度平滑升满（求雨圆满）。 */
export function decayTransients(dt: number, goldenTarget = 0): void {
  const shakeSpeed = 2.6 + runtime.effects.shake * 3.4
  runtime.shake = Math.max(0, runtime.shake - dt * shakeSpeed)
  runtime.flash = Math.max(0, runtime.flash - dt * 5.5)
  runtime.golden = lerp(runtime.golden, goldenTarget, 1 - Math.exp(-1.4 * dt))
}

/** 触发一次全屏闪光（闪电、阶段升级、点击爆点都会用到）。
 *  闪烁是最容易引起不适的部分，按档位分级处理：
 *   - full   正常
 *   - reduced 频率限制到 ~4 次/秒，强度 60%
 *   - minimal 直接不闪（全屏白闪是手机上最刺眼的东西） */
let lastFlashAt = -10

export function pulseFlash(strength: number): void {
  if (runtime.minimal) return
  const cooldown = runtime.reduced ? 0.26 : 0.04
  if (runtime.time - lastFlashAt < cooldown) return
  lastFlashAt = runtime.time
  const scale = runtime.reduced ? 0.6 : 1
  runtime.flash = Math.min(1.2, runtime.flash + strength * scale)
}

/** 触发一次屏幕震动。 */
export function pulseShake(strength: number): void {
  if (runtime.reduced) return
  runtime.shake = Math.min(1.6, runtime.shake + strength)
}
