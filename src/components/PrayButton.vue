<script setup lang="ts">
/**
 * 求雨按钮 —— 全站唯一的核心交互。
 *
 *  - 阶段越高，按钮越会被"风"吹着飘（ButtonDrift），并主动躲开指针。
 *  - 所有逐帧位移直接写 style（不经 Vue 响应式），避免每帧重渲染。
 *  - 支持指针与键盘（Space/Enter，限速 160ms），键盘路径不受飘动影响，保证可玩性不被难度完全封死。
 *  - 指针瞄到按钮附近却没点中时会记一次"手滑"，作为趣味统计。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import ButtonAura from './ButtonAura.vue'
import { useGameTick } from '../composables/useGameTick'
import { device } from '../game/device'
import { clamp01 } from '../game/math'
import { pulseFlash, pulseShake, runtime } from '../game/runtime'
import { gameStore } from '../game/store'
import { ButtonDrift } from '../game/wind'

/** 触屏上把躲避强度降到 55%：手指没有 hover，追一颗逃跑的按钮只会让人放弃 */
const TOUCH_DODGE_SCALE = 0.55

interface Ripple {
  id: number
  x: number
  y: number
}

const store = gameStore
const slotRef = ref<HTMLDivElement | null>(null)
const drifterRef = ref<HTMLDivElement | null>(null)
const buttonRef = ref<HTMLButtonElement | null>(null)

const ripples = ref<Ripple[]>([])
const drift = new ButtonDrift()
const home = { x: 0, y: 0 }
const buttonSize = { w: 0, h: 0 }
const viewport = { w: 0, h: 0 }

let rippleSeq = 0
let lastKeyHitAt = 0
let offReset: (() => void) | null = null

function measure(): void {
  if (typeof window === 'undefined') return
  viewport.w = window.innerWidth
  viewport.h = window.innerHeight
  const slot = slotRef.value
  const button = buttonRef.value
  if (slot) {
    const rect = slot.getBoundingClientRect()
    // slot 自身不带 transform，因此它的中心就是按钮的"家"
    home.x = rect.left + rect.width / 2
    home.y = rect.top + rect.height / 2
  }
  if (button) {
    const rect = button.getBoundingClientRect()
    buttonSize.w = rect.width
    buttonSize.h = rect.height
  }
}

function addRipple(x: number, y: number): void {
  rippleSeq += 1
  const id = rippleSeq
  // 最多保留 8 个波纹，疯狂连点时不会堆积 DOM
  ripples.value.push({ id, x, y })
  if (ripples.value.length > 8) ripples.value.splice(0, ripples.value.length - 8)
  window.setTimeout(() => {
    ripples.value = ripples.value.filter((item) => item.id !== id)
  }, 640)
}

function hit(clientX: number, clientY: number): void {
  store.click(clientX, clientY)
  const button = buttonRef.value
  if (button) {
    const rect = button.getBoundingClientRect()
    addRipple(clientX - rect.left, clientY - rect.top)
  }
  // 弱点闪：减弱特效模式下不再每点一次闪一下（连点时它是主要的闪烁来源）
  if (!runtime.reduced) pulseFlash(0.04)
  const shake = store.stage.value.effects.shake
  if (shake > 0.2 && !runtime.reduced) pulseShake(shake * 0.09)
}

function onPointerDown(event: PointerEvent): void {
  event.preventDefault()
  runtime.pointer = { x: event.clientX, y: event.clientY }
  hit(event.clientX, event.clientY)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.repeat) return
  const now = performance.now()
  if (now - lastKeyHitAt < 160) return
  lastKeyHitAt = now
  const button = buttonRef.value
  if (!button) return
  const rect = button.getBoundingClientRect()
  hit(rect.left + rect.width / 2, rect.top + rect.height / 2)
}

function onPointerMove(event: PointerEvent): void {
  if (runtime.pointer) {
    runtime.pointer.x = event.clientX
    runtime.pointer.y = event.clientY
  } else {
    runtime.pointer = { x: event.clientX, y: event.clientY }
  }
}

function onPointerUp(event: PointerEvent): void {
  // 触屏抬手后指针就不存在了，否则按钮会一直躲着"最后一根手指"的位置而不可点
  if (event.pointerType !== 'mouse') runtime.pointer = null
}

function onWindowPointerDown(event: PointerEvent): void {
  const target = event.target as Element | null
  if (target && typeof target.closest === 'function' && target.closest('.pray-btn')) return
  const stage = store.stage.value
  if (stage.wind.dodge <= 0 || store.prefs.easyMode) return
  const button = buttonRef.value
  if (!button) return
  const rect = button.getBoundingClientRect()
  const pad = 46
  const near =
    event.clientX > rect.left - pad &&
    event.clientX < rect.right + pad &&
    event.clientY > rect.top - pad &&
    event.clientY < rect.bottom + pad
  if (near) store.reportMiss(event.clientX, event.clientY)
}

useGameTick((dtMs) => {
  const dt = Math.min(dtMs, 100) / 1000
  const stage = store.stage.value
  const offset = drift.update(
    dt,
    runtime.time,
    {
      home,
      buttonSize,
      viewport,
      profile: stage.wind,
      intensity: runtime.intensity,
      // 躲避只跟"轻松模式"绑定，不再跟"减弱特效"绑定：减弱特效是视觉偏好，不该改难度
      easyMode: store.prefs.easyMode,
      dodgeScale: store.prefs.easyMode ? 0 : device.isTouch ? TOUCH_DODGE_SCALE : 1,
    },
    runtime.pointer,
  )

  const drifter = drifterRef.value
  if (drifter) {
    drifter.style.transform = `translate3d(${offset.x.toFixed(2)}px, ${offset.y.toFixed(2)}px, 0)`
  }
  runtime.buttonOffset.x = offset.x
  runtime.buttonOffset.y = offset.y

  const button = buttonRef.value
  if (button) {
    button.style.setProperty('--progress', (clamp01(store.state.stageProgress) * 100).toFixed(2))
  }
})

function onResize(): void {
  measure()
}

onMounted(() => {
  measure()
  window.addEventListener('resize', onResize)
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('pointerup', onPointerUp, { passive: true })
  window.addEventListener('pointercancel', onPointerUp, { passive: true })
  window.addEventListener('pointerdown', onWindowPointerDown)
  // 重新开始时把按钮拉回原位
  offReset = store.events.on('reset', () => {
    drift.reset()
    if (drifterRef.value) drifterRef.value.style.transform = 'translate3d(0, 0, 0)'
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  window.removeEventListener('pointerdown', onWindowPointerDown)
  offReset?.()
  offReset = null
})
</script>

<template>
  <div ref="slotRef" class="pray-slot">
    <div ref="drifterRef" class="pray-drifter">
      <ButtonAura />
      <button
        ref="buttonRef"
        class="pray-btn"
        type="button"
        :aria-label="`求雨按钮：当前阶段${store.stage.value.name}，点击推进降雨进度`"
        @pointerdown="onPointerDown"
        @keydown.space.prevent="onKeydown"
        @keydown.enter.prevent="onKeydown"
      >
        <span class="pray-btn__ring" />
        <span class="pray-btn__face">
          <span class="pray-btn__title">求 雨</span>
          <span class="pray-btn__stage">{{ store.stage.value.name }}</span>
          <span class="pray-btn__hint">{{ store.stage.value.hint }}</span>
        </span>
        <span
          v-for="ripple in ripples"
          :key="ripple.id"
          class="pray-ripple"
          :style="{ left: `${ripple.x}px`, top: `${ripple.y}px` }"
        />
      </button>
    </div>
  </div>
</template>

<style scoped>
.pray-slot {
  position: relative;
  width: calc(var(--button-size) * 1.9);
  height: calc(var(--button-size) * 1.9);
  display: grid;
  place-items: center;
  pointer-events: none;
}

.pray-drifter {
  position: relative;
  width: var(--button-size);
  height: var(--button-size);
  pointer-events: auto;
  will-change: transform;
  transform: translate3d(0, 0, 0);
}

.pray-btn {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  display: grid;
  place-items: center;
  padding: 0;
  isolation: isolate;
  box-shadow:
    0 18px 44px rgba(2, 8, 16, 0.45),
    inset 0 -8px 22px rgba(0, 0, 0, 0.28),
    0 0 0 1px rgba(8, 16, 26, 0.3);
  background:
    radial-gradient(circle at 34% 26%, rgba(255, 255, 255, 0.42), transparent 58%),
    linear-gradient(160deg, color-mix(in srgb, var(--accent) 78%, #ffffff), var(--accent));
  transition: box-shadow 0.3s var(--ease-out), filter 0.3s var(--ease-out);
  animation: halo-breathe 3.6s ease-in-out infinite;
}

.pray-btn:active {
  animation: btn-press 0.24s var(--ease-out);
}

.pray-btn:hover {
  filter: brightness(1.06);
}

/* 按钮底色永远是浅色 accent，所以焦点环用白 + 深色投影，任何天空下都看得见 */
.pray-btn:focus-visible {
  outline: 3px solid #ffffff;
  outline-offset: 4px;
  filter: drop-shadow(0 0 4px rgba(6, 12, 20, 0.95));
}

/* 阶段内进度环：外侧加投影，避免浅色弧线落在浅色天空上糊掉 */
.pray-btn__ring {
  position: absolute;
  inset: -10px;
  border-radius: 50%;
  background: conic-gradient(
    color-mix(in srgb, var(--accent) 95%, #fff) calc(var(--progress, 0) * 1%),
    rgba(8, 16, 26, 0.32) 0
  );
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 9px), #000 calc(100% - 8px));
  mask: radial-gradient(farthest-side, transparent calc(100% - 9px), #000 calc(100% - 8px));
  filter: drop-shadow(0 1px 2px rgba(6, 12, 20, 0.7));
  pointer-events: none;
}

/* 浅色按钮底 + 深色文字：六个阶段实测对比度都 ≥7:1（--text 在后期阶段是近白色，会读不出来） */
.pray-btn__face {
  position: relative;
  display: grid;
  gap: 2px;
  justify-items: center;
  text-align: center;
  color: var(--hud-on-accent);
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.45);
  pointer-events: none;
}

.pray-btn__title {
  font-size: calc(var(--button-size) * 0.24);
  font-weight: 800;
  letter-spacing: 0.08em;
  line-height: 1.1;
}

.pray-btn__stage {
  font-size: calc(var(--button-size) * 0.105);
  font-weight: 800;
  letter-spacing: 0.28em;
  opacity: 0.88;
}

.pray-btn__hint {
  margin-top: 3px;
  font-size: calc(var(--button-size) * 0.082);
  font-weight: 700;
  opacity: 0.82;
}

.pray-ripple {
  position: absolute;
  width: 34px;
  height: 34px;
  margin: -17px 0 0 -17px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.85);
  animation: ripple-out 0.62s var(--ease-out) forwards;
  pointer-events: none;
}

@media (max-width: 720px) {
  .pray-slot {
    width: calc(var(--button-size) * 2.1);
    height: calc(var(--button-size) * 2.1);
  }
}
</style>
