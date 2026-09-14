<script setup lang="ts">
/**
 * 强对流专属：旋转涡流。
 * 只在 --vortex > 0 时可见，用 conic-gradient 漏斗 + 环状碎屑表现"天在旋涡里"。
 */
import { computed } from 'vue'
import { gameStore } from '../../game/store'

// 注意：可见性必须来自响应式 store（runtime 是非响应式的热状态，不能用于 v-if）
const visible = computed(() => gameStore.stage.value.effects.vortex > 0.02)
</script>

<template>
  <div v-if="visible" class="vortex" aria-hidden="true">
    <div class="funnel" />
    <div class="funnel inner" />
    <div class="ring" />
    <div class="ring slow" />
    <div class="eye" />
  </div>
</template>

<style scoped>
.vortex {
  position: absolute;
  inset: 0;
  opacity: var(--vortex);
  pointer-events: none;
  mix-blend-mode: screen;
  transition: opacity 0.6s var(--ease-out);
}

.funnel {
  position: absolute;
  left: 50%;
  top: 6%;
  width: 62vmin;
  height: 62vmin;
  translate: -50% 0;
  background: conic-gradient(
    from 0deg,
    transparent 0deg 18deg,
    color-mix(in srgb, var(--accent) 42%, transparent) 40deg 66deg,
    transparent 96deg 150deg,
    color-mix(in srgb, var(--accent) 30%, transparent) 176deg 210deg,
    transparent 240deg 300deg,
    color-mix(in srgb, var(--accent) 26%, transparent) 322deg 348deg,
    transparent 360deg
  );
  border-radius: 46% 54% 50% 50%;
  filter: blur(9px);
  animation: vortex-spin 6.5s linear infinite;
  opacity: 0.75;
}

.funnel.inner {
  width: 40vmin;
  height: 40vmin;
  top: 20%;
  border-radius: 50% 50% 44% 56%;
  filter: blur(6px);
  animation-duration: 4.1s;
  animation-direction: reverse;
  opacity: 0.6;
}

.ring {
  position: absolute;
  left: 50%;
  top: 46%;
  width: 78vmin;
  height: 20vmin;
  translate: -50% 0;
  border: 2px dashed color-mix(in srgb, var(--accent) 55%, transparent);
  border-radius: 50%;
  animation: vortex-spin 9s linear infinite;
  opacity: 0.5;
}

.ring.slow {
  width: 96vmin;
  height: 26vmin;
  animation-duration: 15s;
  animation-direction: reverse;
  opacity: 0.32;
}

.eye {
  position: absolute;
  left: 50%;
  top: 40%;
  width: 16vmin;
  height: 16vmin;
  translate: -50% 0;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.16) 0 30%, transparent 70%);
  filter: blur(6px);
  animation: aura-pulse 3.4s ease-in-out infinite;
}
</style>
