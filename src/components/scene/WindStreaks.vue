<script setup lang="ts">
/**
 * 风向流线：用 DOM 元素表现"风在吹"。
 * 阶段越高线条越多越快；行进的时长还叠加上阶段内进度（--intensity），越接近满阶段越急。
 */
import { computed, type CSSProperties } from 'vue'
import { gameStore } from '../../game/store'
import { clamp01, hashRandom } from '../../game/math'

const store = gameStore

interface Streak {
  id: number
  style: CSSProperties
}

const streaks = computed<Streak[]>(() => {
  const stage = store.stage.value
  const profile = stage.effects
  const count = Math.round(clamp01(profile.streaks) * 26)
  const baseDuration = 2.4 - clamp01(profile.streaks) * 1.5

  return Array.from({ length: count }, (_, i) => {
    const seed = i * 4.71 + 0.5
    const top = hashRandom(seed) * 92
    const duration = Math.max(0.5, baseDuration * (0.7 + hashRandom(seed + 1) * 0.8))
    return {
      id: i,
      style: {
        top: `${top.toFixed(1)}%`,
        width: `${(12 + hashRandom(seed + 2) * 30).toFixed(1)}%`,
        height: `${(1 + hashRandom(seed + 3) * 2.4).toFixed(2)}px`,
        opacity: (0.18 + hashRandom(seed + 4) * 0.5).toFixed(3),
        animationDuration: `${duration.toFixed(2)}s`,
        animationDelay: `${(-hashRandom(seed + 5) * duration).toFixed(2)}s`,
      } as CSSProperties,
    }
  })
})
</script>

<template>
  <div class="streaks" aria-hidden="true">
    <span v-for="streak in streaks" :key="streak.id" class="streak" :style="streak.style" />
  </div>
</template>

<style scoped>
.streaks {
  position: absolute;
  inset: 0;
  overflow: hidden;
  opacity: calc(0.25 + var(--streak) * 0.95);
  pointer-events: none;
}

.streak {
  position: absolute;
  left: 0;
  border-radius: var(--radius-pill);
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--sky-bottom) 70%, #ffffff) 60%,
    transparent
  );
  animation-name: streak-fly;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  will-change: transform;
}
</style>
