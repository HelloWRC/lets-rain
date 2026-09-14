<script setup lang="ts">
/**
 * 单 Canvas 粒子层：浮尘 / 落叶花瓣 / 雨丝 / 冰雹 / 旋涡碎屑 / 地面涟漪 / 闪电折线。
 *
 * 性能策略：
 *  - 只用一个 rAF（挂到全局循环），帧内不做任何 DOM 操作。
 *  - 粒子对象池复用，帧内不 new 对象。
 *  - 同类型粒子合并成一条路径一次性描绘；数量按视口面积与"减弱特效"缩放。
 *  - 尺寸变化由 ResizeObserver 驱动，不在帧内读取布局（避免强制重排）。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useGameTick } from '../../composables/useGameTick'
import { withAlpha } from '../../game/color'
import { device } from '../../game/device'
import { clamp, clamp01, hashRandom } from '../../game/math'
import { runtime } from '../../game/runtime'
import { gameStore } from '../../game/store'
import { windOffset } from '../../game/wind'
import type { Vec2 } from '../../game/types'

const DUST = 0
const LEAF = 1
const RAIN = 2
const HAIL = 3
const DEBRIS = 4
const RIPPLE = 5
const KIND_COUNT = 6

const MAX_PARTICLES = 900
const MAX_PARTICLES_REDUCED = 360
const SPAWN_BUDGET = 90
const TRIM_PER_FRAME = 6

interface Particle {
  kind: number
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  rot: number
  vr: number
  alpha: number
  seed: number
}

interface Bolt {
  points: Vec2[]
  branches: Vec2[][]
  life: number
  maxLife: number
}

const canvasRef = ref<HTMLCanvasElement | null>(null)
const particles: Particle[] = []
const pool: Particle[] = []
const bolts: Bolt[] = []
const counts = new Int32Array(KIND_COUNT)
const size = { w: 0, h: 0, dpr: 0, groundY: 0 }
let ctx2d: CanvasRenderingContext2D | null = null
let rippleAccumulator = 0
let observer: ResizeObserver | null = null
let offLightning: (() => void) | null = null

function take(kind: number): Particle {
  const reused = pool.pop()
  if (reused) {
    reused.kind = kind
    reused.life = 0
    reused.rot = 0
    reused.vr = 0
    reused.alpha = 1
    return reused
  }
  return {
    kind,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 1,
    size: 1,
    rot: 0,
    vr: 0,
    alpha: 1,
    seed: Math.random() * 1000,
  }
}

function recycle(index: number): void {
  const particle = particles[index]
  if (!particle) return
  particles.splice(index, 1)
  pool.push(particle)
}

function resetParticle(p: Particle, initial = false): void {
  const { w, h, groundY } = size
  switch (p.kind) {
    case DUST:
      p.x = Math.random() * w
      p.y = h * (0.25 + Math.random() * 0.7)
      p.vx = (Math.random() - 0.5) * 12
      p.vy = (Math.random() - 0.5) * 8
      p.size = 1 + Math.random() * 2.4
      p.maxLife = 6 + Math.random() * 8
      break
    case LEAF:
      p.x = initial ? Math.random() * w * 1.2 - w * 0.1 : -w * 0.08
      p.y = Math.random() * h * 0.9
      p.vx = 20 + Math.random() * 40
      p.vy = 18 + Math.random() * 34
      p.size = 4 + Math.random() * 5
      p.maxLife = 9 + Math.random() * 8
      p.rot = Math.random() * Math.PI * 2
      p.vr = (Math.random() - 0.5) * 5
      break
    case RAIN:
      p.x = Math.random() * (w * 1.2) - w * 0.1
      p.y = initial ? Math.random() * groundY : -30 - Math.random() * 140
      p.size = 8 + Math.random() * 16
      p.maxLife = 30
      break
    case HAIL:
      p.x = Math.random() * (w * 1.1) - w * 0.05
      p.y = initial ? Math.random() * groundY : -20 - Math.random() * 80
      p.size = 1.6 + Math.random() * 3.6
      p.vy = 120 + Math.random() * 220
      p.vr = (Math.random() - 0.5) * 8
      p.maxLife = 20
      break
    case DEBRIS: {
      const radius = Math.min(w, h) * (0.3 + Math.random() * 0.24)
      const angle = Math.random() * Math.PI * 2
      p.x = w / 2 + Math.cos(angle) * radius
      p.y = groundY * 0.52 + Math.sin(angle) * radius * 0.4
      p.size = 3 + Math.random() * 7
      p.rot = Math.random() * Math.PI * 2
      p.vr = (Math.random() - 0.5) * 12
      p.maxLife = 30
      break
    }
    default:
      break
  }
  p.life = 0
}

function spawnRipple(x: number, y: number, minSize: number, spread: number): void {
  const p = take(RIPPLE)
  p.x = x
  p.y = y
  p.size = minSize + Math.random() * spread
  p.maxLife = 0.55 + Math.random() * 0.4
  p.alpha = 0.5
  p.life = 0
  p.seed = Math.random() * 1000
  particles.push(p)
}

function spawn(dt: number): void {
  const { w, h, groundY } = size
  if (w <= 0 || h <= 0) return
  const fx = runtime.effects
  const areaScale = clamp((w * h) / (1440 * 900), 0.45, 1.4)
  // 极简档（移动端自动）把粒子压到 28%，减弱档 42%
  const reduce = runtime.minimal ? 0.28 : runtime.reduced ? 0.42 : 1
  const cap = runtime.reduced ? MAX_PARTICLES_REDUCED : MAX_PARTICLES

  counts.fill(0)
  for (const particle of particles) counts[particle.kind] = (counts[particle.kind] ?? 0) + 1

  const targets = [
    fx.dust * 70 * areaScale * reduce,
    fx.leaves * 34 * areaScale * reduce,
    fx.rain * 430 * areaScale * reduce,
    fx.hail * 80 * areaScale * reduce,
    fx.debris * 55 * areaScale * reduce,
  ]

  let budget = SPAWN_BUDGET
  for (let kind = DUST; kind <= DEBRIS; kind += 1) {
    const target = Math.floor(targets[kind] ?? 0)
    const current = counts[kind] ?? 0

    if (current > target) {
      // 阶段回落时也要把多余粒子收回去，避免"雨停了但雨还在下"
      let excess = Math.min(TRIM_PER_FRAME * 3, current - target)
      for (let i = particles.length - 1; i >= 0 && excess > 0; i -= 1) {
        const particle = particles[i] as Particle
        if (particle.kind !== kind) continue
        recycle(i)
        excess -= 1
      }
      continue
    }

    let missing = target - current
    while (missing > 0 && budget > 0 && particles.length < cap) {
      missing -= 1
      budget -= 1
      const p = take(kind)
      resetParticle(p, true)
      particles.push(p)
    }
  }

  // 地面涟漪按速率生成
  rippleAccumulator += fx.ripples * 15 * areaScale * reduce * dt
  let rippleBudget = TRIM_PER_FRAME
  while (rippleAccumulator >= 1 && particles.length < cap && rippleBudget > 0) {
    rippleAccumulator -= 1
    rippleBudget -= 1
    spawnRipple(Math.random() * w, groundY + Math.random() * h * 0.05, 5, 13)
  }
  if (rippleAccumulator > 3) rippleAccumulator = 3
}

function update(dt: number): void {
  const { w, h, groundY } = size
  const stage = gameStore.stage.value
  const wind = windOffset(runtime.time, stage.wind, runtime.intensity, runtime.reduced ? 0.5 : 1)
  runtime.wind.x = wind.x
  runtime.wind.y = wind.y

  const rainSpeed = 640 + stage.effects.rainLength * 420
  const rainSlant = wind.x * 2.6

  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i] as Particle
    p.life += dt

    switch (p.kind) {
      case DUST:
        p.x += (p.vx + wind.x * 0.35) * dt
        p.y += (p.vy + Math.sin(p.seed + p.life * 1.2) * 6) * dt
        break
      case LEAF:
        p.x += (wind.x * 1.15 + Math.sin(p.seed + p.life * 2.2) * 34) * dt
        p.y += (p.vy + Math.cos(p.seed * 2 + p.life * 1.7) * 20) * dt
        p.rot += p.vr * dt
        break
      case RAIN:
        p.x += rainSlant * dt
        p.y += rainSpeed * dt
        if (p.y >= groundY) {
          if (runtime.effects.ripples > 0.05 && Math.random() < 0.05) {
            spawnRipple(p.x, groundY + Math.random() * h * 0.05, 5, 11)
          }
          resetParticle(p)
        }
        break
      case HAIL:
        p.vy += 900 * dt
        p.x += wind.x * 1.5 * dt
        p.y += p.vy * dt
        p.rot += p.vr * dt
        if (p.y >= groundY) {
          p.y = groundY
          p.vy = -Math.abs(p.vy) * 0.34
          if (Math.abs(p.vy) < 45) resetParticle(p)
        }
        break
      case DEBRIS: {
        const cx = w / 2
        const cy = groundY * 0.52
        const dx = p.x - cx
        const dy = (p.y - cy) / 0.4
        const radius = Math.max(8, Math.hypot(dx, dy))
        const angle = Math.atan2(dy, dx) + (2.1 / Math.max(0.35, radius / 220)) * dt
        const nextRadius = radius - 26 * dt
        p.x = cx + Math.cos(angle) * nextRadius
        p.y = cy + Math.sin(angle) * nextRadius * 0.4
        p.rot += p.vr * dt
        if (nextRadius < 14) resetParticle(p)
        break
      }
      case RIPPLE:
        p.size += 34 * dt
        break
      default:
        break
    }

    const outOfBounds =
      p.x < -w * 0.25 || p.x > w * 1.25 || p.y > h * 1.2 || (p.y < -h * 0.4 && p.kind !== RAIN)
    if (p.life > p.maxLife || outOfBounds) recycle(i)
  }

  for (let i = bolts.length - 1; i >= 0; i -= 1) {
    const bolt = bolts[i] as Bolt
    bolt.life += dt
    if (bolt.life >= bolt.maxLife) bolts.splice(i, 1)
  }
}

function strokeBolt(ctx: CanvasRenderingContext2D, bolt: Bolt): void {
  ctx.beginPath()
  bolt.points.forEach((point, i) => {
    if (i === 0) ctx.moveTo(point.x, point.y)
    else ctx.lineTo(point.x, point.y)
  })
  ctx.stroke()
  for (const branch of bolt.branches) {
    ctx.beginPath()
    branch.forEach((point, i) => {
      if (i === 0) ctx.moveTo(point.x, point.y)
      else ctx.lineTo(point.x, point.y)
    })
    ctx.stroke()
  }
}

function draw(): void {
  const ctx = ctx2d
  if (!ctx) return
  const { w, h, groundY } = size
  const palette = runtime.palette
  const fx = runtime.effects
  const golden = runtime.golden

  ctx.clearRect(0, 0, w, h)

  const rainColor = withAlpha(golden > 0.02 ? '#ffd76a' : palette.accent, 0.5)
  const rippleColor = withAlpha(golden > 0.02 ? '#ffe9a8' : '#dff2ff', 0.45)
  const dustColor = withAlpha('#ffffff', 0.3)
  const hailColor = withAlpha('#eef7ff', 0.92)
  const debrisColor = withAlpha(palette.cloudShade, 0.8)

  // ---- 地面涟漪 ----
  ctx.globalAlpha = 0.8
  ctx.lineWidth = 1.6
  ctx.strokeStyle = rippleColor
  ctx.beginPath()
  for (const p of particles) {
    if (p.kind !== RIPPLE) continue
    const fade = clamp01(1 - p.life / p.maxLife)
    if (fade <= 0.05) continue
    ctx.moveTo(p.x + p.size * fade, p.y)
    ctx.ellipse(p.x, p.y, p.size * fade, p.size * 0.34 * fade, 0, 0, Math.PI * 2)
  }
  ctx.stroke()

  // ---- 雨丝 ----
  ctx.globalAlpha = 1
  ctx.lineWidth = 1.35
  ctx.strokeStyle = rainColor
  ctx.beginPath()
  for (const p of particles) {
    if (p.kind !== RAIN) continue
    const length = p.size * (0.9 + fx.rainLength * 0.55)
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(p.x - runtime.wind.x * 0.028 * length, p.y - length)
  }
  ctx.stroke()

  // ---- 浮尘 ----
  ctx.globalAlpha = 0.9
  ctx.fillStyle = dustColor
  ctx.beginPath()
  for (const p of particles) {
    if (p.kind !== DUST) continue
    ctx.moveTo(p.x + p.size, p.y)
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
  }
  ctx.fill()

  // ---- 冰雹 ----
  ctx.fillStyle = hailColor
  ctx.beginPath()
  for (const p of particles) {
    if (p.kind !== HAIL) continue
    ctx.moveTo(p.x + p.size, p.y)
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
  }
  ctx.fill()

  ctx.globalAlpha = 1
  ctx.fillStyle = debrisColor

  // ---- 落叶 / 花瓣 与 旋涡碎屑（需要逐粒旋转） ----
  for (const p of particles) {
    if (p.kind === LEAF) {
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      const shade = hashRandom(p.seed)
      ctx.fillStyle = withAlpha(
        shade > 0.62 ? '#ffd166' : shade > 0.32 ? '#a5d66f' : '#ff9f9f',
        0.78,
      )
      ctx.beginPath()
      ctx.ellipse(0, 0, p.size, p.size * 0.52, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    } else if (p.kind === DEBRIS) {
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = debrisColor
      ctx.fillRect(-p.size * 0.5, -p.size * 0.22, p.size, p.size * 0.44)
      ctx.restore()
    }
  }

  // ---- 闪电 ----
  // 极简档：不用叠加发光、亮度减半，只留一条暗折线暗示"远处有雷"，不做闪屏
  if (bolts.length > 0) {
    const minimal = runtime.minimal
    ctx.save()
    if (!minimal) ctx.globalCompositeOperation = 'lighter'
    for (const bolt of bolts) {
      const fade = clamp01(1 - bolt.life / bolt.maxLife)
      if (!minimal) {
        ctx.strokeStyle = withAlpha('#cfe6ff', 0.22 * fade)
        ctx.lineWidth = 8 + 10 * fade
        strokeBolt(ctx, bolt)
      }
      ctx.strokeStyle = withAlpha(minimal ? '#8ea7c4' : '#ffffff', (minimal ? 0.3 : 0.95) * fade)
      ctx.lineWidth = minimal ? 1.4 : 2.2
      strokeBolt(ctx, bolt)
    }
    ctx.restore()
  }

  // ---- 积水反光 ----
  if (fx.contrast > 0.2) {
    const sheen = ctx.createLinearGradient(0, groundY - 14, 0, h)
    sheen.addColorStop(0, withAlpha(palette.accent, 0.05 + 0.12 * clamp01(fx.contrast)))
    sheen.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = sheen
    ctx.fillRect(0, groundY - 14, w, h - groundY + 14)
  }
}

function spawnBolt(x: number, y: number, intensity: number): void {
  const points: Vec2[] = []
  const segments = 13
  let cx = x
  points.push({ x: cx, y: -30 })
  for (let i = 1; i <= segments; i += 1) {
    const progress = i / segments
    cx += (Math.random() - 0.5) * (50 + 110 * intensity)
    points.push({ x: cx, y: -30 + (y + 30) * progress })
  }
  points.push({ x, y })

  const branches: Vec2[][] = []
  const branchCount = 2 + Math.floor(intensity * 3)
  for (let b = 0; b < branchCount; b += 1) {
    const start = points[3 + Math.floor(Math.random() * Math.max(1, segments - 6))] as Vec2
    const branch: Vec2[] = [{ x: start.x, y: start.y }]
    let bx = start.x
    let by = start.y
    const steps = 3 + Math.floor(Math.random() * 4)
    for (let s = 0; s < steps; s += 1) {
      bx += (Math.random() - 0.5) * 70
      by += 30 + Math.random() * 45
      branch.push({ x: bx, y: by })
    }
    branches.push(branch)
  }

  bolts.push({ points, branches, life: 0, maxLife: 0.22 + intensity * 0.12 })
  if (bolts.length > 6) bolts.shift()
}

function resize(): void {
  const canvas = canvasRef.value
  if (!canvas || typeof window === 'undefined') return
  // 触屏设备压低画布分辨率：手机上 DPR 3 的全屏画布会吃掉大量显存，
  // 而"内容变黑"的根因通常就是显存/合成压力。
  const dprCap = runtime.minimal ? 1.25 : device.isTouch ? 1.5 : 2
  const dpr = Math.min(window.devicePixelRatio || 1, dprCap)
  const w = canvas.clientWidth || window.innerWidth
  const h = canvas.clientHeight || window.innerHeight
  if (w === size.w && h === size.h && dpr === size.dpr) return
  size.w = w
  size.h = h
  size.dpr = dpr
  size.groundY = h * 0.88
  canvas.width = Math.max(1, Math.floor(w * dpr))
  canvas.height = Math.max(1, Math.floor(h * dpr))
  ctx2d?.setTransform(dpr, 0, 0, dpr, 0, 0)
}

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas) return
  ctx2d = canvas.getContext('2d')
  resize()
  window.addEventListener('resize', resize)
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => resize())
    observer.observe(canvas)
  }
  offLightning = gameStore.events.on('lightning', (event) => {
    spawnBolt(event.x, event.y, event.intensity)
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  observer?.disconnect()
  observer = null
  offLightning?.()
  offLightning = null
  particles.length = 0
  pool.length = 0
  bolts.length = 0
})

useGameTick((dtMs) => {
  const dt = Math.min(dtMs, 100) / 1000
  if (dt <= 0) return
  spawn(dt)
  update(dt)
  draw()
})
</script>

<template>
  <canvas ref="canvasRef" class="particles" aria-hidden="true" />
</template>

<style scoped>
.particles {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
