<script setup lang="ts">
/**
 * 底部控制栏：音效开关/音量、减弱特效、重新开始、关于。
 *
 * 「减弱特效」是一个三态展示、两态操作：
 *  - 移动端默认显示「自动（已减弱）」，用户点一下就表示"我要看完整特效"并交回手动控制；
 *  - 桌面端就是普通开关。
 */
import { computed } from 'vue'
import { device } from '../game/device'
import { gameStore } from '../game/store'

const props = defineProps<{ fxReduced: boolean; fxAuto: boolean }>()
defineEmits<{ (event: 'open-about'): void; (event: 'toggle-fx'): void }>()

const store = gameStore

const volumePercent = computed(() => Math.round(store.prefs.volume * 100))
const muted = computed(() => store.prefs.muted)
// 窄屏按钮要挤在一行里，文案用短的；aria-label/title 保留完整说法
const narrow = computed(() => device.isNarrow)
const fxLabel = computed(() => {
  if (props.fxAuto) return narrow.value ? '特效：自动' : '减弱特效：自动'
  const state = props.fxReduced ? '开' : '关'
  return narrow.value ? `特效：${state}` : `减弱特效：${state}`
})
const fxTitle = computed(() => {
  if (props.fxAuto) {
    return device.isTouch
      ? '移动端已自动进入极简特效：不做全屏闪光、无频闪、无震动、粒子大幅减少；点击可关闭自动并查看完整特效'
      : '当前跟随系统偏好自动减弱；点击可关闭'
  }
  return '降低粒子数量、关闭震动与频闪、限制闪光频率'
})

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
    <button
      class="ghost-button"
      type="button"
      :aria-pressed="!muted"
      :aria-label="muted ? '音效已关闭，点击开启' : '音效已开启，点击静音'"
      :title="muted ? '当前静音' : '当前有声'"
      @click="store.setPref('muted', !muted)"
    >
      {{ muted ? (narrow ? '音效关' : '音效：关') : narrow ? '音效开' : '音效：开' }}
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
      :aria-pressed="fxReduced"
      :aria-label="fxLabel"
      :title="fxTitle"
      @click="$emit('toggle-fx')"
    >
      {{ fxLabel }}
    </button>

    <button class="ghost-button controls__reset" type="button" aria-label="重新开始" @click="store.reset()">
      {{ narrow ? '重来' : '重新开始' }}
    </button>
    <button class="ghost-button" type="button" aria-label="关于与免责声明" @click="$emit('open-about')">
      {{ narrow ? '说明' : '关于' }}
    </button>
  </div>
</template>

<style scoped>
.controls {
  position: absolute;
  right: calc(var(--pad) + var(--safe-right));
  bottom: var(--pad);
  z-index: var(--z-hud);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
  max-width: min(680px, calc(100% - 2 * var(--pad)));
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

/* ---- 移动端：触控目标放大到 44px，按钮文案变短以排进一行（换行会压住上方数据条） ---- */
@media (max-width: 900px) {
  .controls {
    left: calc(var(--pad) + var(--safe-left));
    right: calc(var(--pad) + var(--safe-right));
    justify-content: center;
    gap: 6px;
    flex-wrap: nowrap;
  }
  .controls__volume {
    display: none;
  }
  /* 移动端少一个按钮：重新开始挪进「说明」面板，控制栏只留 3 个 */
  .controls__reset {
    display: none !important;
  }
  .controls :deep(.ghost-button) {
    min-height: 44px;
    padding: 10px 14px;
    font-size: 13px;
    white-space: nowrap;
  }
}

@media (max-width: 360px) {
  .controls :deep(.ghost-button) {
    padding: 10px 9px;
    font-size: 12px;
  }
}

@media (max-height: 480px) {
  .controls :deep(.ghost-button) {
    min-height: 38px;
    padding: 8px 11px;
    font-size: 12px;
  }
}
</style>
