<script setup lang="ts">
/**
 * 背景世界：天空渐变、太阳、云层、地平线、地面、屏幕水珠。
 * 所有强度都通过 CSS 变量（由 App.vue 逐帧插值写入）驱动，因此阶段切换是连续渐变而不是跳变。
 */
import { computed, type CSSProperties } from 'vue'
import { device } from '../../game/device'
import { gameStore } from '../../game/store'
import { clamp01, hashRandom } from '../../game/math'

const store = gameStore

interface CloudLayer {
  id: number
  style: CSSProperties
}

const layers = computed<CloudLayer[]>(() => {
  const stage = store.stage.value
  const raw = Math.max(0, Math.round(stage.effects.cloudLayers))
  // 图层预算：云是这个页面里面积最大的一批合成层。
  // 极简档封顶 4 层，其他触屏设备封顶 5 层（手机上"内容变黑"多半是图层/显存吃紧）。
  const count = store.effectsMinimal.value
    ? Math.min(raw, 4)
    : device.isTouch
      ? Math.min(raw, 5)
      : raw
  const baseOpacity = clamp01(stage.effects.cloud * 0.9)

  return Array.from({ length: count }, (_, i) => {
    const seed = i * 9.37 + 1
    const depth = count <= 1 ? 0 : i / (count - 1) // 0 = 最远/最高
    const top = 2 + depth * 46 + hashRandom(seed) * 5
    const scale = 0.75 + hashRandom(seed + 1) * 0.8 + depth * 0.35
    const duration = Math.max(26, 74 - i * 5 + hashRandom(seed + 2) * 26)
    const delay = -hashRandom(seed + 3) * duration
    const mix = Math.round(38 + depth * 46)

    const blobs = Array.from({ length: 5 }, (_, j) => {
      const bx = 6 + hashRandom(seed + j * 3.1) * 88
      const by = 34 + hashRandom(seed + j * 5.7) * 46
      const radius = 16 + hashRandom(seed + j * 7.9) * 24
      return `radial-gradient(circle at ${bx.toFixed(1)}% ${by.toFixed(1)}%, var(--puff-color) 0 ${radius.toFixed(1)}%, transparent ${(radius + 1.5).toFixed(1)}%)`
    })

    return {
      id: i,
      style: {
        top: `${top.toFixed(1)}%`,
        '--puff-color': `color-mix(in srgb, var(--cloud) ${mix}%, var(--cloud-shade))`,
        '--cloud-opacity': (baseOpacity * (0.42 + 0.58 * depth) * (0.6 + 0.4 * hashRandom(seed + 4))).toFixed(3),
        '--cloud-scale': scale.toFixed(3),
        backgroundImage: blobs.join(', '),
        animationDuration: `${duration.toFixed(1)}s`,
        animationDelay: `${delay.toFixed(1)}s`,
      } as CSSProperties,
    }
  })
})
</script>

<template>
  <div class="backdrop" aria-hidden="true">
    <div class="sky" />

    <div class="sun">
      <div class="sun-rays" />
      <div class="sun-glow" />
      <div class="sun-core" />
    </div>

    <div class="heat" />

    <div class="clouds">
      <div v-for="layer in layers" :key="layer.id" class="cloud-layer" :style="layer.style" />
    </div>

    <div class="horizon" />
    <div class="ground" />
    <div class="raindrops" />
  </div>
</template>

<style scoped>
.backdrop {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.sky {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    var(--sky-top) 0%,
    var(--sky-mid) 52%,
    var(--sky-bottom) 100%
  );
  transition: background 0.4s linear;
}

/* 整体压暗（阴天之后越来越闷） */
.sky::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(4, 8, 14, 0.86), rgba(4, 8, 14, 0.5));
  opacity: calc(var(--contrast) * 0.9);
}

/* ---- 太阳 ---- */
.sun {
  position: absolute;
  top: 9%;
  left: 17%;
  width: min(34vw, 300px);
  aspect-ratio: 1;
  translate: -50% -50%;
  opacity: calc(var(--sun-strength) * 1.05);
}

.sun-rays {
  position: absolute;
  inset: -55%;
  background: repeating-conic-gradient(
    from 0deg,
    color-mix(in srgb, var(--sun) 62%, transparent) 0deg 1.6deg,
    transparent 1.6deg 8deg
  );
  -webkit-mask-image: radial-gradient(circle, #000 0 34%, transparent 72%);
  mask-image: radial-gradient(circle, #000 0 34%, transparent 72%);
  animation: sun-spin 64s linear infinite;
  opacity: 0.75;
}

.sun-glow {
  position: absolute;
  inset: -20%;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--sun) 85%, transparent) 0 18%, transparent 62%);
  animation: sun-breathe 6.5s ease-in-out infinite;
  filter: blur(4px);
}

.sun-core {
  position: absolute;
  inset: 34%;
  border-radius: 50%;
  background: color-mix(in srgb, var(--sun) 92%, #fff);
  box-shadow: 0 0 90px 30px color-mix(in srgb, var(--sun) 55%, transparent);
}

/* ---- 热浪 ---- */
.heat {
  position: absolute;
  left: -10%;
  right: -10%;
  bottom: 8%;
  height: 40%;
  background: repeating-linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.055) 0 2px,
    transparent 2px 7px
  );
  filter: blur(3px);
  animation: heat-warp 3.6s ease-in-out infinite;
  opacity: calc(var(--heat) * 0.9);
  mix-blend-mode: overlay;
}

/* ---- 云层 ---- */
.clouds {
  position: absolute;
  inset: 0;
}

.cloud-layer {
  position: absolute;
  left: 0;
  width: 74%;
  height: 22%;
  background-repeat: no-repeat;
  background-size: 100% 100%;
  opacity: var(--cloud-opacity);
  filter: blur(7px) saturate(0.96);
  transform-origin: 50% 50%;
  animation-name: cloud-drift;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  will-change: transform;
}

/* 云层自身缓慢翻涌，避免看起来像贴图在平移 */
.cloud-layer::after {
  content: '';
  position: absolute;
  inset: -12%;
  background: inherit;
  background-size: 100% 100%;
  opacity: 0.55;
  transform: scale(var(--cloud-scale));
  animation: cloud-billow 8.5s ease-in-out infinite;
}

/* ---- 地平线与地面 ---- */
.horizon {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 13.5%;
  height: 3px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 55%, transparent), transparent);
  filter: blur(2px);
  opacity: calc(0.35 + var(--contrast) * 0.5);
}

.ground {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 14%;
  background: linear-gradient(180deg, color-mix(in srgb, var(--ground) 68%, #05080c), var(--ground));
}

/* ---- 屏幕水珠（雨/暴雨） ---- */
.raindrops {
  position: absolute;
  inset: 0;
  opacity: calc(var(--water-drops) * 0.55);
  filter: blur(0.6px);
  background-image:
    radial-gradient(circle at 11% 18%, rgba(233, 246, 255, 0.5) 0 3px, transparent 4px),
    radial-gradient(circle at 27% 62%, rgba(233, 246, 255, 0.42) 0 4px, transparent 5px),
    radial-gradient(circle at 44% 31%, rgba(233, 246, 255, 0.38) 0 2px, transparent 3px),
    radial-gradient(circle at 63% 74%, rgba(233, 246, 255, 0.46) 0 5px, transparent 6px),
    radial-gradient(circle at 79% 22%, rgba(233, 246, 255, 0.4) 0 3px, transparent 4px),
    radial-gradient(circle at 88% 57%, rgba(233, 246, 255, 0.34) 0 4px, transparent 5px),
    radial-gradient(circle at 7% 82%, rgba(233, 246, 255, 0.3) 0 2px, transparent 3px),
    radial-gradient(circle at 52% 9%, rgba(233, 246, 255, 0.36) 0 3px, transparent 4px);
  animation: cloud-billow 12s ease-in-out infinite;
  pointer-events: none;
}
</style>
