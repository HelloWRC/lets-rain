/**
 * 音频引擎 —— 全部由 Web Audio API 实时合成，不加载任何音频文件。
 *
 * 设计要点：
 *  - AudioContext 只在首次用户手势时创建/恢复（浏览器自动播放策略）。
 *  - 分层总线：master → compressor → destination，下挂 sfx / ambient 两条支线，
 *    雷声时可以单独 duck 环境音。
 *  - 环境音（雨/风/drone）用一条循环噪声源驱动多个滤波链路，增益逐帧平滑插值，
 *    因此阶段切换不会有爆音。
 *  - 一次性音效有并发上限与冷却时间：疯狂连点时不会削波、不会卡顿。
 *  - 没有 AudioContext 的环境（如 jsdom / 单测）整体退化为 no-op。
 */

import { clamp, clamp01 } from './math'
import type { AudioProfile, ClickVoice } from './types'

const MAX_VOICES = 12
const THUNDER_COOLDOWN = 0.35
const SIREN_COOLDOWN = 6

export interface AudioEngine {
  /** 首次用户手势时调用；返回是否成功出声 */
  unlock(): Promise<boolean>
  readonly ready: boolean
  setMuted(muted: boolean): void
  setVolume(volume: number): void
  /** 每帧（或每几十毫秒）调用，插值环境音 */
  setAmbient(profile: AudioProfile, intensity: number, timeSec: number): void
  /** 驱动冰雹等周期性音效的调度 */
  tick(dtSec: number, profile: AudioProfile): void
  playClick(voice: ClickVoice, combo: number): void
  playThunder(intensity: number, delaySec?: number): void
  playFanfare(stageIndex: number): void
  playSiren(): void
  playGong(): void
  dispose(): void
}

type ContextCtor = new (options?: AudioContextOptions) => AudioContext

interface AmbientGraph {
  noise: AudioBufferSourceNode
  rainGain: GainNode
  rainWallGain: GainNode
  windGain: GainNode
  windBand: BiquadFilterNode
  droneGain: GainNode
  drone: OscillatorNode[]
}

function getContextCtor(): ContextCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as Window & { webkitAudioContext?: ContextCtor }
  return globalThis.AudioContext ?? w.webkitAudioContext ?? null
}

/** 白噪声：2 秒立体声，循环播放作为雨/风/冰雹的底噪。 */
function createNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * 2)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1
  }
  return buffer
}

/** 棕噪声（积分白噪声）：雷声的低频轰鸣层。 */
function createBrownBuffer(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * 3)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel)
    let last = 0
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1
      last = (last + 0.02 * white) / 1.02
      data[i] = last * 3.5
    }
  }
  return buffer
}

function createDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const samples = 1024
  const curve = new Float32Array(samples)
  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / samples - 1
    curve[i] = Math.tanh(x * amount)
  }
  return curve
}

export function createAudioEngine(): AudioEngine {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let sfxBus: GainNode | null = null
  let ambientBus: GainNode | null = null
  let ambient: AmbientGraph | null = null
  let noiseBuffer: AudioBuffer | null = null
  let brownBuffer: AudioBuffer | null = null
  let distortion: Float32Array<ArrayBuffer> | null = null

  let volume = 0.7
  let muted = false
  let activeVoices = 0
  let hailAccumulator = 0
  let lastThunderAt = -99
  let lastSirenAt = -99
  /**
   * 浏览器拒绝启动音频时置位（例如还没有真实用户手势，或自动化环境里的合成事件）。
   * 置位期间不再创建/启动任何节点，避免刷屏的 autoplay 警告与无意义的 CPU 开销；
   * 下一次 unlock() 成功后会复位。
   */
  let blocked = false
  /** 已尝试解锁的次数：真实浏览器第一次手势就成功，这里只防止被拒环境反复重试刷警告 */
  let unlockAttempts = 0
  const MAX_UNLOCK_ATTEMPTS = 5

  /** 是否可以安全地发声 */
  function usable(): boolean {
    return ctx !== null && !blocked
  }

  const now = (): number => ctx?.currentTime ?? 0

  function targetMasterGain(): number {
    return muted ? 0 : volume
  }

  function buildGraph(context: AudioContext): void {
    const compressor = context.createDynamicsCompressor()
    compressor.threshold.value = -12
    compressor.knee.value = 20
    compressor.ratio.value = 6
    compressor.attack.value = 0.004
    compressor.release.value = 0.25

    master = context.createGain()
    master.gain.value = targetMasterGain()
    master.connect(compressor)
    compressor.connect(context.destination)

    sfxBus = context.createGain()
    sfxBus.gain.value = 0.9
    sfxBus.connect(master)

    ambientBus = context.createGain()
    ambientBus.gain.value = 0.85
    ambientBus.connect(master)

    noiseBuffer = createNoiseBuffer(context)
    brownBuffer = createBrownBuffer(context)
    distortion = createDistortionCurve(3.2)

    // ---- 环境音：一条循环噪声源 → 雨 / 雨墙 / 风 三条链路 ----
    const noise = context.createBufferSource()
    noise.buffer = noiseBuffer
    noise.loop = true

    const rainBand = context.createBiquadFilter()
    rainBand.type = 'bandpass'
    rainBand.frequency.value = 1400
    rainBand.Q.value = 0.7
    const rainGain = context.createGain()
    rainGain.gain.value = 0
    noise.connect(rainBand).connect(rainGain).connect(ambientBus)

    const rainWall = context.createBiquadFilter()
    rainWall.type = 'lowpass'
    rainWall.frequency.value = 320
    const rainWallGain = context.createGain()
    rainWallGain.gain.value = 0
    noise.connect(rainWall).connect(rainWallGain).connect(ambientBus)

    const windBand = context.createBiquadFilter()
    windBand.type = 'bandpass'
    windBand.frequency.value = 520
    windBand.Q.value = 0.9
    const windGain = context.createGain()
    windGain.gain.value = 0
    noise.connect(windBand).connect(windGain).connect(ambientBus)

    // ---- 低频 drone：阴天/暴雨的压迫感 ----
    const droneGain = context.createGain()
    droneGain.gain.value = 0
    const drone: OscillatorNode[] = [
      context.createOscillator(),
      context.createOscillator(),
    ]
    drone[0]!.type = 'sine'
    drone[0]!.frequency.value = 55
    drone[1]!.type = 'sine'
    drone[1]!.frequency.value = 82.4
    drone[0]!.connect(droneGain)
    drone[1]!.connect(droneGain)
    droneGain.connect(ambientBus)

    noise.start()
    for (const osc of drone) osc.start()

    ambient = { noise, rainGain, rainWallGain, windGain, windBand, droneGain, drone }
  }

  async function unlock(): Promise<boolean> {
    const Ctor = getContextCtor()
    if (!Ctor) {
      blocked = true
      return false
    }
    // 被拒绝时允许在下一次手势重试（某些策略下第一次手势不够），但只试有限次：
    // 这样既保住"补一次解锁"的能力，又不会在每次点击时都去 resume 一个被拒的上下文。
    if (blocked && unlockAttempts >= MAX_UNLOCK_ATTEMPTS) return false
    unlockAttempts += 1
    if (!ctx || !master) {
      ctx = new Ctor({ latencyHint: 'interactive' })
      buildGraph(ctx)
    }
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume()
      } catch {
        blocked = true
        return false
      }
    }
    const ok = ctx.state === 'running'
    blocked = !ok
    if (master) master.gain.setTargetAtTime(targetMasterGain(), now(), 0.05)
    return ok
  }

  /** 一次性音效的统一外壳：并发上限 + 到点自动回收。 */
  function withVoice(duration: number, build: (t0: number) => void): void {
    if (!usable() || activeVoices >= MAX_VOICES) return
    activeVoices += 1
    const t0 = now()
    try {
      build(t0)
    } catch {
      /* 单个音效失败不影响整体 */
    }
    const ms = Math.max(60, (duration + 0.12) * 1000)
    if (typeof window === 'undefined') {
      activeVoices -= 1
      return
    }
    window.setTimeout(() => {
      activeVoices = Math.max(0, activeVoices - 1)
    }, ms)
  }

  function noiseSource(): AudioBufferSourceNode | null {
    if (!ctx || !noiseBuffer) return null
    const src = ctx.createBufferSource()
    src.buffer = noiseBuffer
    src.loop = true
    return src
  }

  function playClick(voice: ClickVoice, combo: number): void {
    const context = ctx
    if (!context || !usable() || !sfxBus) return
    const bus = sfxBus
    const pitch = Math.pow(2, clamp(combo, 0, 24) / 24)
    const voiceGain = 0.16 + clamp01(combo / 40) * 0.1

    withVoice(0.4, (t0) => {
      const out = context.createGain()
      out.gain.value = voiceGain
      out.connect(bus)

      const tone = (
        type: OscillatorType,
        freq: number,
        decay: number,
        detune = 0,
      ): void => {
        const osc = context.createOscillator()
        osc.type = type
        osc.frequency.setValueAtTime(freq * pitch, t0)
        if (detune !== 0) osc.detune.value = detune
        const gain = context.createGain()
        gain.gain.setValueAtTime(0.0001, t0)
        gain.gain.exponentialRampToValueAtTime(1, t0 + 0.006)
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + decay)
        osc.connect(gain).connect(out)
        osc.start(t0)
        osc.stop(t0 + decay + 0.02)
        osc.onended = () => {
          osc.disconnect()
          gain.disconnect()
        }
      }

      const tick = (freq: number, q: number, decay: number, level = 0.5): void => {
        const src = noiseSource()
        if (!src) return
        const band = context.createBiquadFilter()
        band.type = 'bandpass'
        band.frequency.value = freq * pitch
        band.Q.value = q
        const gain = context.createGain()
        gain.gain.setValueAtTime(0.0001, t0)
        gain.gain.exponentialRampToValueAtTime(level, t0 + 0.004)
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + decay)
        src.connect(band).connect(gain).connect(out)
        src.start(t0)
        src.stop(t0 + decay + 0.02)
        src.onended = () => {
          src.disconnect()
          band.disconnect()
          gain.disconnect()
        }
      }

      switch (voice) {
        case 'chime':
          tone('sine', 1320, 0.3)
          tone('sine', 2650, 0.18, 6)
          tick(4200, 2, 0.05, 0.25)
          break
        case 'woodblock':
          tone('triangle', 680, 0.13)
          tick(1900, 7, 0.04, 0.6)
          break
        case 'thud':
          tone('sine', 190, 0.26)
          tick(320, 1.2, 0.1, 0.35)
          break
        case 'drop':
          tone('sine', 1500, 0.22)
          tone('sine', 720, 0.3, -4)
          tick(2800, 3, 0.06, 0.3)
          break
        case 'crack': {
          const src = noiseSource()
          if (src) {
            const high = context.createBiquadFilter()
            high.type = 'highpass'
            high.frequency.value = 900
            const gain = context.createGain()
            gain.gain.setValueAtTime(0.0001, t0)
            gain.gain.exponentialRampToValueAtTime(0.8, t0 + 0.003)
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16)
            src.connect(high).connect(gain).connect(out)
            src.start(t0)
            src.stop(t0 + 0.2)
            src.onended = () => {
              src.disconnect()
              high.disconnect()
              gain.disconnect()
            }
          }
          tone('sine', 92, 0.22)
          break
        }
        case 'zap': {
          if (distortion) {
            const shaper = context.createWaveShaper()
            shaper.curve = distortion
            shaper.oversample = '2x'
            const osc = context.createOscillator()
            osc.type = 'square'
            osc.frequency.setValueAtTime(260 * pitch, t0)
            osc.frequency.exponentialRampToValueAtTime(120 * pitch, t0 + 0.14)
            const gain = context.createGain()
            gain.gain.setValueAtTime(0.0001, t0)
            gain.gain.exponentialRampToValueAtTime(0.55, t0 + 0.005)
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18)
            osc.connect(shaper).connect(gain).connect(out)
            osc.start(t0)
            osc.stop(t0 + 0.2)
            osc.onended = () => {
              osc.disconnect()
              shaper.disconnect()
              gain.disconnect()
            }
          }
          tick(3400, 2.5, 0.07, 0.4)
          break
        }
      }

      window.setTimeout(
        () => {
          out.disconnect()
        },
        voice === 'chime' || voice === 'drop' ? 500 : 400,
      )
    })
  }

  function playThunder(intensity: number, delaySec = 0): void {
    const context = ctx
    if (!context || !usable() || !sfxBus || !brownBuffer) return
    const bus = sfxBus
    const t = now()
    if (t - lastThunderAt < THUNDER_COOLDOWN) return
    lastThunderAt = t + delaySec

    const level = clamp01(intensity)
    const duration = 1.4 + 2 * level
    const peak = 0.3 + 0.5 * level

    withVoice(duration + delaySec, (t0) => {
      const start = t0 + delaySec

      // 低频轰鸣（棕噪声 + 低通下扫）
      const src = context.createBufferSource()
      src.buffer = brownBuffer
      src.loop = true
      const lowpass = context.createBiquadFilter()
      lowpass.type = 'lowpass'
      lowpass.Q.value = 0.9
      lowpass.frequency.setValueAtTime(520, start)
      lowpass.frequency.exponentialRampToValueAtTime(70, start + duration)
      const rumble = context.createGain()
      rumble.gain.setValueAtTime(0.0001, start)
      rumble.gain.exponentialRampToValueAtTime(peak, start + 0.03)
      rumble.gain.exponentialRampToValueAtTime(0.0001, start + duration)
      const panner = context.createStereoPanner()
      panner.pan.value = level * 0.6 - 0.3
      src.connect(lowpass).connect(rumble).connect(panner).connect(bus)
      src.start(start)
      src.stop(start + duration + 0.1)

      // 高频撕裂层（雷"炸"的那一下）
      const crackSrc = noiseSource()
      if (crackSrc) {
        const high = context.createBiquadFilter()
        high.type = 'highpass'
        high.frequency.value = 1200
        const crack = context.createGain()
        crack.gain.setValueAtTime(0.0001, start)
        crack.gain.exponentialRampToValueAtTime(peak * 0.7, start + 0.008)
        crack.gain.exponentialRampToValueAtTime(0.0001, start + 0.35 + level * 0.5)
        crackSrc.connect(high).connect(crack).connect(bus)
        crackSrc.start(start)
        crackSrc.stop(start + 1)
        crackSrc.onended = () => {
          crackSrc.disconnect()
          high.disconnect()
          crack.disconnect()
        }
      }

      // 亚低频下沉，制造"地面在震"的体感
      const sub = context.createOscillator()
      sub.type = 'sine'
      sub.frequency.setValueAtTime(62, start)
      sub.frequency.exponentialRampToValueAtTime(26, start + duration * 0.8)
      const subGain = context.createGain()
      subGain.gain.setValueAtTime(0.0001, start)
      subGain.gain.exponentialRampToValueAtTime(peak * 0.8, start + 0.05)
      subGain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
      sub.connect(subGain).connect(bus)
      sub.start(start)
      sub.stop(start + duration + 0.05)

      src.onended = () => {
        src.disconnect()
        lowpass.disconnect()
        rumble.disconnect()
        panner.disconnect()
      }
      sub.onended = () => {
        sub.disconnect()
        subGain.disconnect()
      }
    })
  }

  function playFanfare(stageIndex: number): void {
    const context = ctx
    if (!context || !usable() || !sfxBus) return
    const bus = sfxBus
    // 阶段越高，和弦越低沉、音符越多：从"清脆"走向"不祥"
    const base = 880 * Math.pow(0.86, stageIndex)
    const ratios = stageIndex >= 4 ? [1, 1.19, 1.5, 1.78, 2] : [1, 1.25, 1.5, 2]

    withVoice(1.4, (t0) => {
      const out = context.createGain()
      out.gain.value = 0.13
      out.connect(bus)
      ratios.forEach((ratio, i) => {
        const osc = context.createOscillator()
        osc.type = i % 2 === 0 ? 'triangle' : 'sine'
        osc.frequency.value = base * ratio * (stageIndex >= 4 ? 0.5 : 1)
        const gain = context.createGain()
        const at = t0 + i * 0.075
        gain.gain.setValueAtTime(0.0001, at)
        gain.gain.exponentialRampToValueAtTime(1, at + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.9)
        osc.connect(gain).connect(out)
        osc.start(at)
        osc.stop(at + 1)
        osc.onended = () => {
          osc.disconnect()
          gain.disconnect()
        }
      })
      window.setTimeout(() => out.disconnect(), 1600)
    })
  }

  function playSiren(): void {
    const context = ctx
    if (!context || !usable() || !sfxBus) return
    const bus = sfxBus
    const t = now()
    if (t - lastSirenAt < SIREN_COOLDOWN) return
    lastSirenAt = t

    withVoice(3.6, (t0) => {
      const out = context.createGain()
      out.gain.value = 0.0001
      out.connect(bus)
      out.gain.setValueAtTime(0.0001, t0)
      out.gain.linearRampToValueAtTime(0.12, t0 + 0.4)

      for (let i = 0; i < 3; i += 1) {
        const at = t0 + i * 1.2
        const osc = context.createOscillator()
        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(420, at)
        osc.frequency.linearRampToValueAtTime(880, at + 0.6)
        osc.frequency.linearRampToValueAtTime(420, at + 1.15)
        const filter = context.createBiquadFilter()
        filter.type = 'lowpass'
        filter.frequency.value = 1800
        const gain = context.createGain()
        gain.gain.setValueAtTime(0.0001, at)
        gain.gain.linearRampToValueAtTime(0.5, at + 0.1)
        gain.gain.linearRampToValueAtTime(0.0001, at + 1.2)
        osc.connect(filter).connect(gain).connect(out)
        osc.start(at)
        osc.stop(at + 1.25)
        osc.onended = () => {
          osc.disconnect()
          filter.disconnect()
          gain.disconnect()
        }
      }

      out.gain.setValueAtTime(0.12, t0 + 3.2)
      out.gain.linearRampToValueAtTime(0.0001, t0 + 3.6)
      window.setTimeout(() => out.disconnect(), 3800)
    })
  }

  function playGong(): void {
    const context = ctx
    if (!context || !usable() || !sfxBus) return
    const bus = sfxBus
    const partials = [1, 2.02, 2.76, 5.4, 8.93]

    withVoice(4.5, (t0) => {
      const out = context.createGain()
      out.gain.value = 0.16
      out.connect(bus)
      partials.forEach((ratio, i) => {
        const osc = context.createOscillator()
        osc.type = 'sine'
        osc.frequency.value = 120 * ratio
        const gain = context.createGain()
        const decay = 3.6 / (1 + i * 0.5)
        gain.gain.setValueAtTime(0.0001, t0)
        gain.gain.exponentialRampToValueAtTime(1 / (1 + i), t0 + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + decay)
        osc.connect(gain).connect(out)
        osc.start(t0)
        osc.stop(t0 + decay + 0.05)
        osc.onended = () => {
          osc.disconnect()
          gain.disconnect()
        }
      })
      window.setTimeout(() => out.disconnect(), 4800)
    })
  }

  function setAmbient(profile: AudioProfile, intensity: number, timeSec: number): void {
    if (!usable() || !ambient) return
    const k = clamp01(intensity)
    const t = now()
    const smooth = 0.12

    // 阵风：用两个不同频率的正弦让风"一阵一阵"地吹
    const gust = 0.72 + 0.28 * Math.sin(timeSec * 0.55) * Math.sin(timeSec * 0.19 + 1.1)
    const rainLevel = profile.rainGain * (0.72 + 0.28 * k)
    const wallLevel = profile.ambient === 'downpour' || profile.ambient === 'tempest'
      ? rainLevel * 0.75
      : rainLevel * 0.25

    ambient.rainGain.gain.setTargetAtTime(rainLevel * 0.5, t, smooth)
    ambient.rainWallGain.gain.setTargetAtTime(wallLevel * 0.55, t, smooth)
    ambient.windGain.gain.setTargetAtTime(profile.windGain * gust * 0.6, t, smooth)
    ambient.windBand.frequency.setTargetAtTime(280 + 900 * (1 - k), t, smooth)
    ambient.droneGain.gain.setTargetAtTime(profile.droneGain * 0.28, t, smooth)
  }

  function tick(dtSec: number, profile: AudioProfile): void {
    if (!usable()) return
    if (profile.hailPerSecond <= 0) {
      hailAccumulator = 0
      return
    }
    hailAccumulator += profile.hailPerSecond * dtSec
    let budget = 4
    while (hailAccumulator >= 1 && budget > 0) {
      hailAccumulator -= 1
      budget -= 1
      if (!ctx || !sfxBus) return
      const context = ctx
      const bus = sfxBus
      const freq = 1600 + Math.random() * 2600
      withVoice(0.12, (t0) => {
        const src = noiseSource()
        if (!src) return
        const band = context.createBiquadFilter()
        band.type = 'bandpass'
        band.frequency.value = freq
        band.Q.value = 6
        const gain = context.createGain()
        gain.gain.setValueAtTime(0.0001, t0)
        gain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.003)
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07)
        src.connect(band).connect(gain).connect(bus)
        src.start(t0)
        src.stop(t0 + 0.1)
        src.onended = () => {
          src.disconnect()
          band.disconnect()
          gain.disconnect()
        }
      })
    }
  }

  function dispose(): void {
    try {
      if (ambient) {
        ambient.noise.stop()
        for (const osc of ambient.drone) osc.stop()
      }
      void ctx?.close()
    } catch {
      /* 忽略 */
    }
    ambient = null
    ctx = null
    master = null
    sfxBus = null
    ambientBus = null
    activeVoices = 0
  }

  return {
    async unlock() {
      return unlock()
    },
    get ready() {
      return ctx !== null && ctx.state === 'running'
    },
    setMuted(next: boolean) {
      muted = next
      if (master && ctx) master.gain.setTargetAtTime(targetMasterGain(), now(), 0.08)
    },
    setVolume(next: number) {
      volume = clamp(next, 0, 1)
      if (master && ctx) master.gain.setTargetAtTime(targetMasterGain(), now(), 0.08)
    },
    setAmbient,
    tick,
    playClick,
    playThunder,
    playFanfare,
    playSiren,
    playGong,
    dispose,
  }
}

/** 单例：整个页面共用一个 AudioContext（浏览器对上下文数量有限制）。 */
export const audioEngine: AudioEngine = createAudioEngine()
