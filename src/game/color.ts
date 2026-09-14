/**
 * 极简颜色工具：只在 sRGB 空间做线性插值。
 * 天空/云层配色需要随阶段连续过渡，避免切换瞬间生硬跳色。
 */

import { clamp01 } from './math'

export interface Rgb {
  r: number
  g: number
  b: number
}

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

export function parseHex(hex: string): Rgb {
  const match = HEX_RE.exec(hex.trim())
  if (!match) return { r: 0, g: 0, b: 0 }
  let body = match[1] as string
  if (body.length === 3) {
    body = body[0]! + body[0]! + body[1]! + body[1]! + body[2]! + body[2]!
  }
  const value = Number.parseInt(body, 16)
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  }
}

function channelToHex(channel: number): string {
  return Math.round(clamp01(channel / 255) * 255)
    .toString(16)
    .padStart(2, '0')
}

export function toHex(rgb: Rgb): string {
  return `#${channelToHex(rgb.r)}${channelToHex(rgb.g)}${channelToHex(rgb.b)}`
}

/** 在两个十六进制颜色之间插值，返回十六进制颜色。 */
export function mixHex(from: string, to: string, t: number): string {
  const k = clamp01(t)
  if (k <= 0) return from
  if (k >= 1) return to
  const a = parseHex(from)
  const b = parseHex(to)
  return toHex({
    r: a.r + (b.r - a.r) * k,
    g: a.g + (b.g - a.g) * k,
    b: a.b + (b.b - a.b) * k,
  })
}

/** 把十六进制颜色转成带透明度的 rgba() 字符串。 */
export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = parseHex(hex)
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${clamp01(alpha).toFixed(3)})`
}
