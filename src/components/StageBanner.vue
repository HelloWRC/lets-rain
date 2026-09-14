<script setup lang="ts">
/** 阶段升级横幅：进入新阶段或求雨圆满时短暂出现。 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { gameStore } from '../game/store'

interface Banner {
  id: number
  title: string
  subtitle: string
  severe: boolean
}

const store = gameStore
const banner = ref<Banner | null>(null)
let seq = 0
let timer: number | null = null
const offs: Array<() => void> = []

function show(title: string, subtitle: string, severe: boolean): void {
  seq += 1
  const id = seq
  banner.value = { id, title, subtitle, severe }
  if (timer !== null) window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    if (banner.value?.id === id) banner.value = null
  }, 2400)
}

onMounted(() => {
  offs.push(
    store.events.on('advance', (event) => {
      show(
        `阶段 ${event.to + 1} / 6 · ${event.stage.name}`,
        event.stage.tagline,
        event.stage.key === 'severe',
      )
    }),
  )
  offs.push(
    store.events.on('complete', () => {
      show('求雨圆满', '雷雨爆发 · 天地同应', true)
    }),
  )
})

onBeforeUnmount(() => {
  for (const off of offs) off()
  offs.length = 0
  if (timer !== null) window.clearTimeout(timer)
})
</script>

<template>
  <div class="banner-host" aria-live="polite">
    <div v-if="banner" :key="banner.id" class="banner" :class="{ 'is-severe': banner.severe }">
      <p class="banner__title">{{ banner.title }}</p>
      <p class="banner__subtitle">{{ banner.subtitle }}</p>
    </div>
  </div>
</template>

<style scoped>
.banner-host {
  position: absolute;
  top: calc(var(--pad) + 150px);
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-banner);
  pointer-events: none;
  width: min(560px, 88vw);
  display: grid;
  justify-items: center;
}

.banner {
  padding: 12px 22px;
  border-radius: var(--radius-lg);
  text-align: center;
  /* 横幅会飘在浅色天空之上，用不透明底保证六个阶段都是高对比 */
  background: color-mix(in srgb, var(--accent) 16%, var(--hud-surface-solid));
  border: 1px solid color-mix(in srgb, var(--accent) 65%, var(--hud-border));
  color: var(--hud-text);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 16px 44px rgba(2, 6, 12, 0.55), 0 0 40px color-mix(in srgb, var(--accent) 32%, transparent);
  animation: banner-in 2.4s var(--ease-out) both;
}

.banner.is-severe {
  border-color: color-mix(in srgb, var(--accent) 85%, #ffffff);
  box-shadow: 0 16px 44px rgba(2, 6, 12, 0.65), 0 0 70px color-mix(in srgb, var(--accent) 55%, transparent);
}

.banner__title {
  margin: 0;
  font-size: 19px;
  font-weight: 800;
  letter-spacing: 0.06em;
}

.banner__subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--hud-text-muted);
}
</style>
