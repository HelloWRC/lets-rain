<script setup lang="ts">
/** 求雨圆满：虹弧 + 结算卡片（卡片不遮挡中央按钮，仍可继续点着玩）。 */
import { gameStore } from '../game/store'

const store = gameStore
</script>

<template>
  <div v-if="store.state.completed" class="celebration" role="status">
    <div class="celebration__rainbow" aria-hidden="true">
      <span v-for="i in 7" :key="i" class="band" :style="{ '--i': i }" />
    </div>

    <div class="celebration__card panel">
      <p class="celebration__title">雷雨爆发 · 求雨圆满</p>
      <p class="celebration__text">
        你把天从万里无云点到了强对流。<br />
        诚心值 <strong>{{ store.state.totalPrayers.toFixed(1) }}</strong> ·
        点击 <strong>{{ store.state.totalClicks }}</strong> 次 ·
        最高连击 <strong>×{{ store.state.maxCombo }}</strong>
      </p>
      <button class="ghost-button celebration__again" type="button" @click="store.reset()">
        再求一次
      </button>
    </div>
  </div>
</template>

<style scoped>
.celebration {
  position: absolute;
  inset: auto 0 0 0;
  z-index: var(--z-overlay);
  display: grid;
  justify-items: center;
  pointer-events: none;
  padding-bottom: calc(var(--pad) + 56px);
}

.celebration__rainbow {
  position: absolute;
  bottom: -18vh;
  left: 50%;
  width: 92vmin;
  height: 92vmin;
  translate: -50% 0;
  border-radius: 50%;
  overflow: hidden;
  animation: rainbow-in 1.1s var(--ease-out) both;
  pointer-events: none;
  opacity: 0.8;
}

.band {
  position: absolute;
  inset: calc((var(--i) - 1) * 2.4vmin);
  border-radius: 50%;
  border: 2.4vmin solid hsl(calc(210 - var(--i) * 32) 90% 62%);
  opacity: 0.55;
  mask-image: linear-gradient(180deg, transparent 42%, #000 58%);
  -webkit-mask-image: linear-gradient(180deg, transparent 42%, #000 58%);
}

.celebration__card {
  position: relative;
  width: min(420px, 88vw);
  padding: 14px 18px;
  text-align: center;
  pointer-events: auto;
  animation: celebration-in 0.6s var(--ease-out) both;
  border-color: color-mix(in srgb, var(--accent) 60%, transparent);
}

.celebration__title {
  margin: 0;
  font-size: 17px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: color-mix(in srgb, var(--accent) 74%, #ffffff);
}

.celebration__text {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--hud-text-muted);
}

.celebration__text strong {
  color: var(--hud-text);
}

.celebration__again {
  margin-top: 12px;
  padding-inline: 22px;
}

@media (max-width: 620px) {
  .celebration {
    padding-bottom: calc(var(--pad) + 96px);
  }
  .celebration__rainbow {
    display: none;
  }
}
</style>
