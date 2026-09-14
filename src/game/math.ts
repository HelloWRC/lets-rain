/** 通用数学工具：钳制、插值、平滑逼近。全部为纯函数，便于单测。 */

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1)
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t
}

/**
 * 帧率无关的指数平滑逼近：lambda 为 1/滞后秒数。
 * dt 越大越接近目标，但永远不会越过目标。
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  if (dt <= 0) return current
  return current + (target - current) * (1 - Math.exp(-lambda * dt))
}

/** 把 [0,1) 的进度映射到数组下标（用于阶段内进度→任意分档）。 */
export function progressIndex(progress: number, buckets: number): number {
  return clamp(Math.floor(clamp01(progress) * buckets), 0, Math.max(0, buckets - 1))
}

/** 稳定的伪随机：同一 seed 永远给出同一结果（用于可复现的特效排布）。 */
export function hashRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}
