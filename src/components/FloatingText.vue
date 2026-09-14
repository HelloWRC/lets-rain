<script setup lang="ts">
/**
 * 点击浮字：每次点击在指针处冒出祈祷词与增益数值。
 * 由 store 的 click 事件驱动，最多同时 22 条，可回收。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { gameStore } from '../game/store'

interface FloatItem {
  id: number
  x: number
  y: number
  prayer: string
  gain: string
  combo: number
  tilt: number
}

const MAX_ITEMS = 22
const store = gameStore
const items = ref<FloatItem[]>([])
let seq = 0
let off: (() => void) | null = null

onMounted(() => {
  off = store.events.on('click', (event) => {
    seq += 1
    const id = seq
    items.value.push({
      id,
      x: event.x,
      y: event.y,
      prayer: event.prayer,
      gain: `+${(event.gained * 100).toFixed(1)}`,
      combo: event.combo,
      tilt: (Math.random() - 0.5) * 14,
    })
    if (items.value.length > MAX_ITEMS) items.value.splice(0, items.value.length - MAX_ITEMS)
    window.setTimeout(() => {
      items.value = items.value.filter((item) => item.id !== id)
    }, 1000)
  })
})

onBeforeUnmount(() => {
  off?.()
  off = null
  items.value = []
})
</script>

<template>
  <div class="floats" aria-hidden="true">
    <div
      v-for="item in items"
      :key="item.id"
      class="float"
      :style="{ left: `${item.x}px`, top: `${item.y}px`, '--tilt': `${item.tilt}deg` }"
    >
      <span class="float__prayer">{{ item.prayer }}</span>
      <span class="float__gain">
        诚心 {{ item.gain }}
        <em v-if="item.combo > 4">×{{ item.combo }}</em>
      </span>
    </div>
  </div>
</template>

<style scoped>
.floats {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: var(--z-playfield);
  overflow: hidden;
}

.float {
  position: absolute;
  display: grid;
  gap: 1px;
  justify-items: center;
  text-align: center;
  white-space: nowrap;
  rotate: var(--tilt, 0deg);
  padding: 3px 11px 4px;
  border-radius: var(--radius-pill);
  /* 浮字会飘在任意天空（含晴天强光）之上：给它一块不透明底，
     纯靠 text-shadow 在浅色天空上实测只有 1.02:1，等于读不出来。 */
  background: color-mix(in srgb, var(--accent) 14%, var(--hud-surface-solid));
  border: 1px solid var(--hud-border);
  box-shadow: 0 8px 22px rgba(2, 6, 12, 0.5);
  /* 基础位移：即使动画被停掉（渲染安全模式 / prefers-reduced-motion）也能居中 */
  transform: translate3d(-50%, 0, 0);
  animation: float-up 1s var(--ease-out) forwards;
  will-change: transform, opacity;
}

.float__prayer {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: color-mix(in srgb, var(--accent) 40%, #ffffff);
}

.float__gain {
  font-size: 11.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--hud-text);
}

.float__gain em {
  font-style: normal;
  margin-left: 4px;
  padding: 0 5px;
  border-radius: var(--radius-pill);
  color: var(--hud-on-accent);
  background: color-mix(in srgb, var(--accent) 92%, #ffffff);
}
</style>
