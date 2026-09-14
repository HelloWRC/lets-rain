/**
 * 全局单一 requestAnimationFrame 循环。
 * 所有逐帧动画（衰减、风场、粒子、音频参数）都挂在这里，避免多个 rAF 互相打架。
 */

import { clamp } from './math'

export type TickHandler = (dtMs: number, timeSec: number) => void

/** 单帧最大步进：切标签页/系统卡顿后回来，最多只推进 100ms，进度不会被瞬间清空。 */
export const MAX_TICK_MS = 100

export class GameLoop {
  private handlers = new Set<TickHandler>()
  private rafId: number | null = null
  private lastTs = 0
  private timeSec = 0
  private visibilityBound = false

  get running(): boolean {
    return this.rafId !== null
  }

  subscribe(handler: TickHandler): () => void {
    this.handlers.add(handler)
    this.bindVisibility()
    this.ensureRunning()
    return () => {
      this.handlers.delete(handler)
      if (this.handlers.size === 0) this.stop()
    }
  }

  start(): void {
    this.ensureRunning()
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.lastTs = 0
  }

  private ensureRunning(): void {
    if (this.rafId !== null) return
    if (typeof requestAnimationFrame === 'undefined') return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    this.rafId = requestAnimationFrame(this.frame)
  }

  private bindVisibility(): void {
    if (this.visibilityBound || typeof document === 'undefined') return
    this.visibilityBound = true
    // rAF 在后台标签页本来就会暂停；这里额外显式停表，避免 CPU 空转。
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        if (this.rafId !== null) {
          cancelAnimationFrame(this.rafId)
          this.rafId = null
        }
        this.lastTs = 0
      } else {
        this.ensureRunning()
      }
    })
  }

  private readonly frame = (ts: number): void => {
    this.rafId = requestAnimationFrame(this.frame)
    if (this.lastTs === 0) this.lastTs = ts
    const raw = ts - this.lastTs
    this.lastTs = ts
    const dtMs = clamp(raw, 0, MAX_TICK_MS)
    this.timeSec += dtMs / 1000
    for (const handler of this.handlers) handler(dtMs, this.timeSec)
  }
}

export const gameLoop = new GameLoop()
