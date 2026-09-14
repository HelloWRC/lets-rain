/**
 * 设备特征探测（响应式）。
 *
 * 用途：
 *  - 移动端自动减弱特效（缓解闪烁、降低 GPU 压力）；
 *  - 触屏设备上把"按钮躲避"的强度调低（手指没有 hover，追一颗逃跑的按钮很挫败）；
 *  - 布局断点（窄屏 / 横屏矮屏）。
 *
 * 设计成可变的 reactive 对象：测试里可以直接改字段来验证"自动减弱"的判定逻辑。
 */

import { reactive } from 'vue'

/** 窄屏断点：与此值一致的还有 900px（HUD 折叠）等 CSS 媒体查询 */
export const MOBILE_MAX_WIDTH = 720

export interface DeviceProfile {
  /** 触屏设备（手机 / 平板 / 触屏笔记本） */
  isTouch: boolean
  /** 窄屏（CSS 断点一致） */
  isNarrow: boolean
  /** 移动端 = 触屏 或 窄屏 */
  isMobile: boolean
  /** 系统级「减少动态效果」偏好 */
  prefersReducedMotion: boolean
  /** 性能受限（低内存 / 少核心），用于进一步压低粒子数量 */
  lowPower: boolean
}

function matches(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia(query).matches
  } catch {
    return false
  }
}

/**
 * 是否"以触屏为主要输入设备"（手机 / 平板）。
 *
 * 判据是媒体特性而不是 navigator.maxTouchPoints：
 *  - `(pointer: coarse)` —— 主指针是粗的（手指 / 笔）；
 *  - `(hover: none)` —— 主指针无法悬停。
 * 两者同时成立才是触屏优先设备。只看 maxTouchPoints 会把"带触摸屏的笔记本"
 * 以及某些不报告真实指针设备的环境（无头浏览器里实测 maxTouchPoints = 10）误判成手机，
 * 于是桌面端被莫名其妙地自动降级特效。
 */
function hasTouch(): boolean {
  if (typeof window === 'undefined') return false
  if (typeof window.matchMedia === 'function') {
    return matches('(pointer: coarse)') && matches('(hover: none)')
  }
  // 极老的浏览器没有 hover 媒体特性，退回到触点数
  return ((navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints ?? 0) > 0
}

function isLowPower(): boolean {
  if (typeof navigator === 'undefined') return false
  const nav = navigator as Navigator & { deviceMemory?: number; hardwareConcurrency?: number }
  const memory = nav.deviceMemory ?? 8
  const cores = nav.hardwareConcurrency ?? 8
  return memory <= 4 || cores <= 4
}

export const device = reactive<DeviceProfile>({
  isTouch: hasTouch(),
  isNarrow: matches(`(max-width: ${MOBILE_MAX_WIDTH}px)`),
  isMobile: false,
  prefersReducedMotion: matches('(prefers-reduced-motion: reduce)'),
  lowPower: isLowPower(),
})

device.isMobile = device.isTouch || device.isNarrow

let bound = false

/** 监听视口 / 方向 / 系统偏好变化（幂等，App 挂载时调用一次即可）。 */
export function initDeviceTracking(): void {
  if (bound || typeof window === 'undefined') return
  bound = true

  const refresh = (): void => {
    device.isTouch = hasTouch()
    device.isNarrow = matches(`(max-width: ${MOBILE_MAX_WIDTH}px)`)
    device.isMobile = device.isTouch || device.isNarrow
    device.lowPower = isLowPower()
  }

  window.addEventListener('resize', refresh, { passive: true })
  window.addEventListener('orientationchange', refresh, { passive: true })

  if (typeof window.matchMedia !== 'function') return
  try {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    device.prefersReducedMotion = motion.matches
    motion.addEventListener('change', (event) => {
      device.prefersReducedMotion = event.matches
    })
    const coarse = window.matchMedia('(pointer: coarse)')
    coarse.addEventListener?.('change', refresh)
  } catch {
    /* 老浏览器：保持初始值 */
  }
}
