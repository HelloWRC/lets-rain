<script setup lang="ts">
/** 底部控制栏：音效开关/音量、减弱特效、重新开始、关于。 */
import { computed } from 'vue'
import { gameStore } from '../game/store'

defineProps<{ audioReady: boolean }>()
defineEmits<{ (event: 'open-about'): void }>()

const store = gameStore

const volumePercent = computed(() => Math.round(store.prefs.volume * 100))
const muted = computed(() => store.prefs.muted)
const reduceFx = computed(() => store.prefs.reduceFx)

function onVolume(event: Event): void {
  const input = event.target as HTMLInputElement
  const value = Number(input.value)
  if (!Number.isFinite(value)) return
  store.setPref('volume', Math.min(1, Math.max(0, value / 100)))
  if (value > 0 && store.prefs.muted) store.setPref('muted', false)
}
</script>

<template>
  <div class="controls">
    <span v-if="!audioReady" class="controls__hint chip">点一下页面任意处即可开启音效</span>

    <button
      class="ghost-button"
      type="button"
      :aria-pressed="!muted"
      :title="muted ? '当前静音' : '当前有声'"
      @click="store.setPref('muted', !muted)"
    >
      {{ muted ? '音效：关' : '音效：开' }}
    </button>

    <label class="controls__volume">
      <span class="sr-only">音量</span>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        :value="volumePercent"
        :disabled="muted"
        @input="onVolume"
      />
    </label>

    <button
      class="ghost-button"
      type="button"
      :aria-pressed="reduceFx"
      title="降低粒子数量、关闭震动与频闪"
      @click="store.setPref('reduceFx', !reduceFx)"
    >
      减弱特效：{{ reduceFx ? '开' : '关' }}
    </button>

    <button class="ghost-button" type="button" @click="store.reset()">重新开始</button>
    <button class="ghost-button" type="button" @click="$emit('open-about')">关于 / 免责声明</button>
  </div>
</template>

<style scoped>
.controls {
  position: absolute;
  right: var(--pad);
  bottom: var(--pad);
  z-index: var(--z-hud);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
  max-width: min(680px, calc(100% - 2 * var(--pad)));
}

.controls__hint {
  animation: chip-glow 2.4s ease-in-out infinite;
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
}

.controls__volume {
  display: inline-flex;
  align-items: center;
  padding: 0 8px;
  height: 34px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--hud-border);
  background: rgba(255, 255, 255, 0.08);
}

.controls__volume input {
  width: 78px;
  accent-color: var(--accent);
}

@media (max-width: 900px) {
  .controls {
    left: var(--pad);
    justify-content: center;
  }
  .controls__volume {
    display: none;
  }
  .controls :deep(.ghost-button) {
    font-size: 12px;
    padding: 6px 9px;
  }
}
</style>
