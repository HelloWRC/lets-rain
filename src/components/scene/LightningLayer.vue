<script setup lang="ts">
/**
 * 闪电调度层：按阶段频率随机打雷闪，并触发全屏闪光、屏幕震动与音效事件。
 * 阴天阶段的雷"有闪无雷"（音频侧 thunderAudible=false 会忽略雷声）。
 * 强对流额外叠加频闪，但主闪频率被限制在安全范围（<=3Hz），避免光敏风险。
 */
import { computed } from 'vue'
import { useGameTick } from '../../composables/useGameTick'
import { clamp01 } from '../../game/math'
import { pulseFlash, pulseShake, runtime } from '../../game/runtime'
import { gameStore } from '../../game/store'

const store = gameStore
let accumulator = 0

const strobeActive = computed(
  () => store.stage.value.effects.strobe > 0.05 && !store.prefs.reduceFx,
)

const strobeLevel = computed(() => (0.5 + store.stage.value.effects.strobe * 0.5).toFixed(2))

function strike(): void {
  if (typeof window === 'undefined') return
  const w = window.innerWidth
  const h = window.innerHeight
  const x = w * (0.12 + Math.random() * 0.76)
  const y = h * (0.52 + Math.random() * 0.34)
  const intensity = 0.35 + Math.random() * 0.65
  // 越靠画面边缘的雷越"远"：闪得越弱、雷声到得越晚
  const distance = clamp01(Math.abs(x / w - 0.5) * 1.9)

  pulseFlash(0.16 + 0.5 * intensity)
  pulseShake(runtime.effects.shake * (0.35 + intensity) * 0.55)
  store.events.emit('lightning', { x, y, intensity, distance })
}

useGameTick((dtMs) => {
  const dt = Math.min(dtMs, 100) / 1000
  const rate = runtime.effects.lightningPerSecond * (runtime.reduced ? 0.45 : 1)
  if (rate <= 0) {
    accumulator = 0
    return
  }
  accumulator += rate * dt
  if (accumulator < 1) return
  accumulator = 0
  strike()
})

defineExpose({ strike })
</script>

<template>
  <div class="lightning" aria-hidden="true">
    <div v-if="strobeActive" class="strobe" :style="{ '--strobe-level': strobeLevel }" />
    <div class="edge-glow" />
  </div>
</template>

<style scoped>
.lightning {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

/* 强对流频闪：主闪之外的低强度明暗呼吸（约 2.4Hz，低于 3Hz 安全阈值） */
.strobe {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(200, 160, 255, 0.5), rgba(255, 255, 255, 0.12) 60%, transparent);
  animation: strobe 0.42s steps(2, end) infinite;
  mix-blend-mode: screen;
}

/* 雷暴时画面四角的压迫感 */
.edge-glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 40%, transparent 55%, rgba(0, 0, 0, 0.5) 100%);
  opacity: calc(var(--contrast) * 0.85);
}
</style>
