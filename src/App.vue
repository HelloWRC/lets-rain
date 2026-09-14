<script setup lang="ts">
/**
 * 顶层编排：
 *  - 挂载全局 rAF 循环（状态机衰减 / 风场 / 粒子 / 音频都在这里面跑）。
 *  - 把非响应式的 runtime 热状态逐帧写成 CSS 变量、震动 transform、闪光透明度。
 *  - 订阅状态机事件，驱动音频与环境音。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AboutPanel from './components/AboutPanel.vue'
import CelebrationOverlay from './components/CelebrationOverlay.vue'
import ControlBar from './components/ControlBar.vue'
import DisclaimerBar from './components/DisclaimerBar.vue'
import DisclaimerModal from './components/DisclaimerModal.vue'
import EventFeed from './components/EventFeed.vue'
import FloatingText from './components/FloatingText.vue'
import HudPanel from './components/HudPanel.vue'
import PrayButton from './components/PrayButton.vue'
import StageBanner from './components/StageBanner.vue'
import StageTrack from './components/StageTrack.vue'
import LightningLayer from './components/scene/LightningLayer.vue'
import ParticleCanvas from './components/scene/ParticleCanvas.vue'
import SceneBackdrop from './components/scene/SceneBackdrop.vue'
import VortexLayer from './components/scene/VortexLayer.vue'
import WindStreaks from './components/scene/WindStreaks.vue'
import { useGameTick } from './composables/useGameTick'
import { audioEngine } from './game/audio'
import { withAlpha } from './game/color'
import { initDeviceTracking, device } from './game/device'
import { clamp01 } from './game/math'
import { runtime } from './game/runtime'
import { gameStore } from './game/store'

const store = gameStore

const rootRef = ref<HTMLElement | null>(null)
const worldRef = ref<HTMLElement | null>(null)
const flashRef = ref<HTMLElement | null>(null)
const audioReady = ref(false)
const showAbout = ref(false)

const showDisclaimer = computed(() => !store.prefs.hintSeen)

let cssClock = 0
let audioClock = 0
let detachLoop: (() => void) | null = null
const offs: Array<() => void> = []

/** 把 runtime 的插值结果写成 CSS 变量（20Hz 节流：肉眼看不到台阶，但省掉大量样式重算）。 */
function writeCssVariables(): void {
  const root = rootRef.value
  if (!root) return
  const palette = runtime.palette
  const fx = runtime.effects
  const style = root.style
  const reduced = runtime.reduced

  style.setProperty('--sky-top', palette.skyTop)
  style.setProperty('--sky-mid', palette.skyMid)
  style.setProperty('--sky-bottom', palette.skyBottom)
  style.setProperty('--sun', palette.sun)
  style.setProperty('--cloud', palette.cloud)
  style.setProperty('--cloud-shade', palette.cloudShade)
  style.setProperty('--ground', palette.ground)
  style.setProperty('--accent', palette.accent)
  // 注意：不再输出 --text。它随阶段在深色/浅色之间翻转，任何"深色面板 + 继承 --text"
  // 的组合都会有一半阶段读不出来；界面统一改用固定的 --hud-* / --note-* 令牌。
  style.setProperty('--vignette', withAlpha(palette.vignette, palette.vignetteStrength))

  style.setProperty('--intensity', clamp01(runtime.intensity).toFixed(3))
  style.setProperty('--sun-strength', (reduced ? fx.sun * 0.6 : fx.sun).toFixed(3))
  style.setProperty('--cloud-strength', (fx.cloud * 0.95).toFixed(3))
  style.setProperty('--contrast', fx.contrast.toFixed(3))
  style.setProperty('--heat', fx.heat.toFixed(3))
  style.setProperty('--vortex', fx.vortex.toFixed(3))
  style.setProperty('--streak', fx.streaks.toFixed(3))
  style.setProperty('--rain', fx.rain.toFixed(3))
  style.setProperty('--hail', fx.hail.toFixed(3))
  style.setProperty('--water-drops', fx.waterDrops.toFixed(3))
  style.setProperty('--strobe', (reduced ? 0 : fx.strobe).toFixed(3))
  style.setProperty('--golden', runtime.golden.toFixed(3))
}

function applyShake(): void {
  const world = worldRef.value
  if (!world) return
  const shake = runtime.reduced ? 0 : runtime.shake
  if (shake <= 0.002) {
    if (world.style.transform !== 'translate3d(0, 0, 0)') {
      world.style.transform = 'translate3d(0, 0, 0)'
    }
    return
  }
  const amp = shake * 16
  const dx = (Math.random() - 0.5) * amp
  const dy = (Math.random() - 0.5) * amp
  const rot = (Math.random() - 0.5) * shake * 0.6
  world.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0) rotate(${rot.toFixed(3)}deg)`
}

function applyFlash(): void {
  const flash = flashRef.value
  if (!flash) return
  const value = runtime.reduced ? runtime.flash * 0.35 : runtime.flash
  flash.style.opacity = clamp01(value).toFixed(3)
}

function onEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape' && showAbout.value) showAbout.value = false
}

onMounted(() => {
  initDeviceTracking()
  detachLoop = store.attachLoop()

  // ---- 音频事件接线 ----
  offs.push(
    store.events.on('click', (event) => {
      audioEngine.playClick(store.stage.value.audio.click, event.combo)
    }),
  )
  offs.push(
    store.events.on('advance', (event) => {
      audioEngine.playFanfare(event.to)
      if (event.stage.audio.siren) audioEngine.playSiren()
    }),
  )
  offs.push(
    store.events.on('complete', () => {
      audioEngine.playGong()
      audioEngine.playSiren()
    }),
  )
  offs.push(
    store.events.on('lightning', (event) => {
      const audio = store.stage.value.audio
      // 阴天只有远景无声闪电；其余阶段雷声按"距离"延迟到达
      if (!audio.thunderAudible || audio.thunderPerMinute <= 0) return
      audioEngine.playThunder(event.intensity, 0.12 + event.distance * 1.7)
    }),
  )

  // ---- 首次用户手势解锁音频（浏览器自动播放策略） ----
  // 用捕获阶段监听：保证在按钮的 pointerdown 处理器之前就开始解锁，
  // 这样"第一次点击"的声音也能被排进队列，而不是白点一下。
  // 解锁失败时保留监听，下一次手势再试（带节流，见 audio.ts）。
  const unlock = (): void => {
    if (audioReady.value) return
    void audioEngine.unlock().then((ok) => {
      if (!ok) return
      audioReady.value = true
      audioEngine.setMuted(store.prefs.muted)
      audioEngine.setVolume(store.prefs.volume)
      removeUnlockListeners()
    })
  }
  const removeUnlockListeners = (): void => {
    window.removeEventListener('pointerdown', unlock, { capture: true })
    window.removeEventListener('keydown', unlock, { capture: true })
  }
  window.addEventListener('pointerdown', unlock, { capture: true })
  window.addEventListener('keydown', unlock, { capture: true })
  window.addEventListener('keydown', onEscape)
  offs.push(removeUnlockListeners)
  offs.push(() => window.removeEventListener('keydown', onEscape))
})

watch(
  () => store.prefs.muted,
  (value) => audioEngine.setMuted(value),
  { immediate: true },
)

watch(
  () => store.prefs.volume,
  (value) => audioEngine.setVolume(value),
  { immediate: true },
)

watch(
  () => store.effectsReduced.value,
  (reduced) => {
    // 移动端会自动进入减弱档；同时通过 .is-reduced-fx 让 CSS 也一起收力
    runtime.reduced = reduced
  },
  { immediate: true },
)

watch(
  () => store.state.stageIndex,
  () => {
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', store.stage.value.palette.skyTop)
  },
)

useGameTick((dtMs) => {
  const dt = Math.min(dtMs, 100) / 1000
  applyShake()
  applyFlash()

  cssClock += dtMs
  if (cssClock >= 50) {
    cssClock = 0
    writeCssVariables()
  }

  const audio = store.stage.value.audio
  audioEngine.tick(dt, audio)
  audioClock += dtMs
  if (audioClock >= 70) {
    audioClock = 0
    audioEngine.setAmbient(audio, runtime.intensity, runtime.time)
  }
})

onBeforeUnmount(() => {
  for (const off of offs) off()
  offs.length = 0
  detachLoop?.()
  detachLoop = null
  audioEngine.dispose()
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onEscape)
})
</script>

<template>
  <div
    ref="rootRef"
    class="app"
    :class="{ 'is-reduced-fx': store.effectsReduced.value, 'is-mobile': device.isMobile }"
  >
    <!-- 舞台区：除了免责声明条，所有浮动元素都在这里，因此永远不会被页脚压住 -->
    <div class="stage-area">
      <div ref="worldRef" class="world">
        <SceneBackdrop />
        <ParticleCanvas />
        <VortexLayer />
        <WindStreaks />
        <LightningLayer />
      </div>

      <div class="vignette" aria-hidden="true" />

      <header class="topbar">
        <StageTrack />
      </header>

      <HudPanel />

      <main class="playfield">
        <PrayButton />
        <!-- 音频需要用户手势才能启动：提示挂在按钮下方，不占控制栏空间 -->
        <p v-if="!audioReady" class="audio-hint chip" role="status">点一下即可开启音效</p>
      </main>
      <FloatingText />

      <StageBanner />
      <EventFeed />
      <CelebrationOverlay />

      <div ref="flashRef" class="flash" aria-hidden="true" />

      <ControlBar
        :fx-reduced="store.effectsReduced.value"
        :fx-auto="store.effectsAuto.value"
        @toggle-fx="store.toggleEffectsReduced()"
        @open-about="showAbout = true"
      />
    </div>

    <DisclaimerBar @open-about="showAbout = true" />

    <DisclaimerModal v-if="showDisclaimer" />
    <AboutPanel v-if="showAbout" @close="showAbout = false" />
  </div>
</template>

<style scoped>
/* 用 grid 把页面切成"舞台 + 页脚"两行：
   页脚是真实布局行而不是覆盖层，底部控制栏等元素只需相对舞台区定位，
   声明文字再长、字体再大、屏幕再窄也不会被压住。 */
.app {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
}

.stage-area {
  position: relative;
  min-height: 0;
  overflow: hidden;
}

.topbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: var(--z-hud);
  /* 顶部让开刘海/状态栏 */
  padding: calc(var(--pad) + var(--safe-top)) calc(var(--pad) + var(--safe-right)) 0
    calc(var(--pad) + var(--safe-left));
  pointer-events: none;
}

.topbar > * {
  pointer-events: auto;
}

.playfield {
  position: absolute;
  inset: 0;
  z-index: var(--z-playfield);
  display: grid;
  place-items: center;
  pointer-events: none;
}

.playfield > * {
  pointer-events: auto;
}

.audio-hint {
  position: absolute;
  left: 50%;
  bottom: 22%;
  translate: -50% 0;
  pointer-events: none;
  animation: chip-glow 2.4s ease-in-out infinite;
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  white-space: nowrap;
}
</style>
