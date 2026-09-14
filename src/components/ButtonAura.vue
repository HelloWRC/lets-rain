<script setup lang="ts">
/**
 * 按钮周围的阶段特效层（全部由 CSS 变量驱动，随阶段平滑过渡）：
 * 晴天日芒 → 多云云团 → 阴天暗晕浮尘 → 雨水花环 → 暴雨电弧 → 强对流涡环与冰雹。
 *
 * 极简档（移动端自动）只保留一圈静止的光环：旋转、脉冲、电弧、冰雹弹跳全部不渲染，
 * 这些正是手机上"一直在闪"的来源。
 */
import { computed } from 'vue'
import { gameStore } from '../game/store'

const store = gameStore
const minimal = computed(() => store.effectsMinimal.value)
</script>

<template>
  <div class="aura" aria-hidden="true">
    <template v-if="!minimal">
      <div class="layer sun-rays" />
      <div class="layer sun-glow" />
      <div class="layer cloud-puffs" />
      <div class="layer haze" />
      <div class="layer dust-ring" />
      <div class="layer splash-ring" />
      <div class="layer arcs">
        <span class="arc arc-a" />
        <span class="arc arc-b" />
        <span class="arc arc-c" />
      </div>
      <div class="layer vortex-ring" />
      <div class="layer vortex-ring reverse" />
      <div class="layer hail-bounce" />
    </template>
    <div class="layer halo" />
  </div>
</template>

<style scoped>
.aura {
  position: absolute;
  inset: -70%;
  pointer-events: none;
}

.layer {
  position: absolute;
  inset: 0;
  border-radius: 50%;
}

/* ---- 晴天：旋转日芒 + 呼吸光晕 ---- */
.sun-rays {
  background: repeating-conic-gradient(
    from 0deg,
    color-mix(in srgb, var(--sun) 70%, transparent) 0deg 1.4deg,
    transparent 1.4deg 7deg
  );
  -webkit-mask-image: radial-gradient(circle, transparent 26%, #000 40%, transparent 62%);
  mask-image: radial-gradient(circle, transparent 26%, #000 40%, transparent 62%);
  animation: aura-spin 26s linear infinite;
  opacity: calc(var(--sun-strength) * 0.9);
}

.sun-glow {
  background: radial-gradient(circle, color-mix(in srgb, var(--sun) 60%, transparent) 0 32%, transparent 62%);
  animation: aura-pulse 4.4s ease-in-out infinite;
  opacity: calc(var(--sun-strength) * 0.85);
}

/* ---- 多云：环绕的云团 ---- */
.cloud-puffs {
  background:
    radial-gradient(circle at 22% 34%, color-mix(in srgb, var(--cloud) 85%, transparent) 0 16%, transparent 17%),
    radial-gradient(circle at 74% 28%, color-mix(in srgb, var(--cloud) 78%, transparent) 0 14%, transparent 15%),
    radial-gradient(circle at 36% 74%, color-mix(in srgb, var(--cloud-shade) 80%, transparent) 0 18%, transparent 19%),
    radial-gradient(circle at 68% 70%, color-mix(in srgb, var(--cloud) 70%, transparent) 0 12%, transparent 13%);
  filter: blur(6px);
  animation: aura-spin 42s linear infinite reverse;
  opacity: var(--cloud-strength);
}

/* ---- 阴天：暗晕与浮尘 ---- */
.haze {
  background: radial-gradient(circle, transparent 34%, color-mix(in srgb, var(--vignette) 70%, transparent) 62%, transparent 78%);
  animation: aura-pulse 6.5s ease-in-out infinite;
  opacity: calc(var(--contrast) * 0.9);
}

.dust-ring {
  background: radial-gradient(circle, transparent 42%, rgba(255, 255, 255, 0.16) 46%, transparent 52%);
  animation: aura-spin 18s linear infinite;
  opacity: calc(var(--contrast) * 0.8);
}

/* ---- 雨：水花环 ---- */
.splash-ring {
  background: radial-gradient(circle, transparent 40%, color-mix(in srgb, var(--accent) 42%, transparent) 44%, transparent 50%);
  animation: aura-pulse 1.5s ease-in-out infinite;
  opacity: calc(var(--rain) * 0.85);
}

/* ---- 暴雨：电弧 ---- */
.arcs {
  filter: blur(0.6px);
  opacity: calc(var(--contrast) * var(--rain) * 1.6);
}

.arc {
  position: absolute;
  top: 22%;
  left: 50%;
  width: 2px;
  height: 26%;
  background: linear-gradient(180deg, transparent, #eaf6ff 35%, transparent);
  transform-origin: 50% 0;
  animation: arc-flicker 1.6s steps(6, end) infinite;
  box-shadow: 0 0 12px 3px rgba(160, 220, 255, 0.75);
}

.arc-a {
  rotate: -28deg;
}
.arc-b {
  rotate: 34deg;
  animation-delay: 0.35s;
  height: 20%;
  top: 30%;
}
.arc-c {
  rotate: 6deg;
  animation-delay: 0.7s;
  height: 16%;
  top: 40%;
}

/* ---- 强对流：涡环 ---- */
.vortex-ring {
  border: 2px dashed color-mix(in srgb, var(--accent) 60%, transparent);
  inset: 12%;
  animation: aura-spin 3.6s linear infinite;
  opacity: var(--vortex);
}

.vortex-ring.reverse {
  inset: 2%;
  border-style: dotted;
  animation-duration: 6.2s;
  animation-direction: reverse;
  opacity: calc(var(--vortex) * 0.7);
}

.hail-bounce {
  background:
    radial-gradient(circle at 50% 8%, rgba(255, 255, 255, 0.9) 0 2px, transparent 3px),
    radial-gradient(circle at 88% 46%, rgba(255, 255, 255, 0.85) 0 2.4px, transparent 3.4px),
    radial-gradient(circle at 12% 56%, rgba(255, 255, 255, 0.8) 0 2px, transparent 3px),
    radial-gradient(circle at 62% 92%, rgba(255, 255, 255, 0.85) 0 2.2px, transparent 3.2px);
  animation: aura-spin 2.4s linear infinite;
  opacity: var(--hail);
}

/* ---- 通用外光环（颜色随阶段 accent 变化，圆满时变成金色） ---- */
.halo {
  inset: 24%;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--accent) 32%, transparent) 0 46%,
    transparent 70%
  );
  filter: blur(10px);
  animation: aura-pulse 3.2s ease-in-out infinite;
  opacity: calc(0.4 + var(--intensity) * 0.6 + var(--golden) * 0.5);
}
</style>
