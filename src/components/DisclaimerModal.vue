<script setup lang="ts">
/**
 * 首次访问提示：说明"仅供娱乐"、会播放声音、会有闪烁与震动。
 *
 * 可读性设计要点：
 *  - 固定深底亮字（--note-* 令牌），不随阶段天空变化，六个阶段对比度一致。
 *  - 正文 14~15px、行高 1.85、行宽限制在 60 字符左右，长句不挤在一起。
 *  - 关键限制条款用 <mark> 高亮（加粗 + 提亮 + 淡底），扫一眼就能看到。
 *  - 交互元素最小 44px 高，触屏也好点。
 *  - 打开时把焦点移进对话框，键盘与读屏用户能立刻读到声明内容。
 */
import { onMounted, ref } from 'vue'
import { gameStore } from '../game/store'

const store = gameStore
const muteByDefault = ref(false)
const dialogRef = ref<HTMLElement | null>(null)

onMounted(() => {
  dialogRef.value?.focus()
})

function accept(): void {
  if (muteByDefault.value) store.setPref('muted', true)
  store.setPref('hintSeen', true)
}
</script>

<template>
  <div class="modal-backdrop" role="presentation">
    <div
      ref="dialogRef"
      class="note-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="disclaimer-title"
      aria-describedby="disclaimer-lead"
      tabindex="-1"
    >
      <header class="note-modal__head">
        <span class="note-badge">仅供娱乐</span>
        <h2 id="disclaimer-title" class="note-modal__title">开始之前，先说三件事</h2>
      </header>

      <p id="disclaimer-lead" class="note-modal__lead">
        这不是天气预报，只是一个点击小游戏。下面三点说清楚，再开始点。
      </p>

      <ol class="note-list">
        <li>
          <span class="note-list__marker" aria-hidden="true">1</span>
          <div>
            <p class="note-list__title">页面里的"天气"都是代码画的</p>
            <p class="note-list__body">
              所有天空、云、雨、雷、冰雹都是根据你的点击数实时生成的特效与音效。
              <mark>不代表任何实际气象数据、预报或诉求</mark>，与任何气象机构无关。
              真实天气请以官方气象部门发布的信息为准。
            </p>
          </div>
        </li>
        <li>
          <span class="note-list__marker" aria-hidden="true">2</span>
          <div>
            <p class="note-list__title">会播放声音</p>
            <p class="note-list__body">
              雨声、雷声、风声、警报声全部由 Web Audio 实时合成（没有音频文件）。
              随时可以用底部的「音效」按钮静音，也可以拖动音量滑块调节。
            </p>
          </div>
        </li>
        <li>
          <span class="note-list__marker" aria-hidden="true">3</span>
          <div>
            <p class="note-list__title">会有闪烁与屏幕震动</p>
            <p class="note-list__body">
              后期阶段有闪电与频闪（主闪低于 3Hz）。如果觉得不适，请打开底部的「减弱特效」，
              或把系统设置为"减少动态效果"，两者都会关闭震动与频闪。
            </p>
          </div>
        </li>
      </ol>

      <label class="note-modal__check">
        <input v-model="muteByDefault" type="checkbox" />
        <span>先静音，我想安静地看看</span>
      </label>

      <button class="note-modal__accept" type="button" @click="accept()">知道了，开始求雨</button>

      <p class="note-modal__foot">
        完整说明可以随时从页脚的「查看完整声明」打开。
      </p>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: absolute;
  inset: 0;
  z-index: var(--z-modal);
  display: grid;
  place-items: center;
  padding: var(--pad);
  background: rgba(3, 7, 12, 0.76);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.note-modal {
  width: min(620px, 100%);
  max-height: min(88vh, 760px);
  overflow: auto;
  padding: 22px 24px 20px;
  border-radius: var(--radius-lg);
  background: var(--note-surface-solid);
  border: 1px solid var(--note-border);
  box-shadow: 0 24px 70px rgba(1, 4, 9, 0.6);
  color: var(--note-text);
  font-size: 14px;
  line-height: 1.85;
  animation: celebration-in 0.4s var(--ease-out) both;
}

.note-modal__head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.note-badge {
  padding: 2px 10px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--note-strong);
  background: var(--note-mark-bg);
  border: 1px solid color-mix(in srgb, var(--note-strong) 55%, transparent);
}

.note-modal__title {
  margin: 0;
  font-size: 21px;
  font-weight: 800;
  letter-spacing: 0.02em;
  line-height: 1.4;
}

.note-modal__lead {
  margin: 12px 0 0;
  max-width: 56ch;
  font-size: 15px;
  line-height: 1.8;
  color: var(--note-text-muted);
}

.note-list {
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 14px;
}

.note-list > li {
  display: grid;
  grid-template-columns: 24px 1fr;
  gap: 12px;
  align-items: start;
}

.note-list__marker {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 12.5px;
  font-weight: 800;
  color: var(--note-strong);
  background: var(--note-mark-bg);
  border: 1px solid color-mix(in srgb, var(--note-strong) 45%, transparent);
  line-height: 1;
}

.note-list__title {
  margin: 0;
  font-size: 14.5px;
  font-weight: 800;
  line-height: 1.6;
}

.note-list__body {
  margin: 3px 0 0;
  max-width: 58ch;
  font-size: 14px;
  line-height: 1.85;
  color: var(--note-text-muted);
}

.note-list__body mark {
  padding: 1px 4px;
  border-radius: 4px;
  color: var(--note-strong);
  background: var(--note-mark-bg);
  font-weight: 800;
}

.note-modal__check {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 18px 0 14px;
  min-height: 44px;
  font-size: 14px;
  cursor: pointer;
}

.note-modal__check input {
  width: 18px;
  height: 18px;
  accent-color: var(--note-strong);
}

.note-modal__accept {
  width: 100%;
  min-height: 46px;
  padding: 12px 18px;
  border-radius: var(--radius-md);
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: #0b131e;
  background: var(--note-accent);
  border: 1px solid color-mix(in srgb, var(--note-accent) 70%, #ffffff);
  transition: filter var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}

.note-modal__accept:hover {
  filter: brightness(1.08);
}

.note-modal__accept:active {
  transform: scale(0.985);
}

.note-modal__foot {
  margin: 10px 0 0;
  font-size: 12.5px;
  line-height: 1.7;
  color: color-mix(in srgb, var(--note-text-muted) 82%, transparent);
  text-align: center;
}
</style>
