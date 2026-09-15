<script setup lang="ts">
/**
 * 关于面板：完整免责声明 + 玩法说明 + 技术说明 + 清除本地记录。
 *
 * 可读性设计要点：与首次提示共用同一套固定高对比令牌（--note-*），
 * 正文 14px / 行高 1.85、行宽限制、小节标题独立色阶、关键条款高亮。
 * 打开时把焦点移到「关闭」按钮，键盘用户不用先 Tab 一圈。
 */
import { onMounted, ref } from 'vue'
import { gameStore } from '../game/store'
import { clearStorage } from '../game/prefs'
import { REPO_LABEL, REPO_TEXT, REPO_URL } from '../game/site'

const store = gameStore
const emit = defineEmits<{ (event: 'close'): void }>()
const closeRef = ref<HTMLButtonElement | null>(null)

onMounted(() => {
  closeRef.value?.focus()
})

function clearLocal(): void {
  clearStorage()
  store.setPref('muted', false)
  store.setPref('volume', 0.7)
  store.setPref('easyMode', false)
  store.setPref('reduceFx', false)
  store.best.bestStage = 0
  store.best.bestCombo = 0
  store.best.completions = 0
}

/** 移动端把「重新开始」收到这里，控制栏少一个按钮 */
function restart(): void {
  store.reset()
  emit('close')
}
</script>

<template>
  <div class="modal-backdrop" role="presentation" @click.self="emit('close')">
    <div class="note-modal" role="dialog" aria-modal="true" aria-labelledby="about-title">
      <header class="note-modal__head">
        <h2 id="about-title" class="note-modal__title">关于这个页面</h2>
        <button ref="closeRef" class="note-close" type="button" @click="emit('close')">关闭</button>
      </header>

      <section class="note-section">
        <h3 class="note-section__title">
          <span class="note-badge">仅供娱乐</span>
          免责声明
        </h3>
        <p class="note-body">
          本页面<strong>只是一个点击小游戏</strong>：所谓"阶段推进""降雨"完全是程序按你的点击次数计算并渲染的动画。
          <mark>所有特效与音效均由代码实时生成，不代表任何实际气象数据、气象预报、观测结果或任何形式的诉求</mark>，
          与任何气象机构无关，也不构成任何建议。真实天气信息请以官方气象部门发布的信息为准。
        </p>
      </section>

      <section class="note-section">
        <h3 class="note-section__title">怎么玩</h3>
        <ul class="note-list">
          <li>连续点击中间的按钮推进求雨进度：晴天 → 多云 → 阴天 → 雨 → 暴雨 → 强对流。</li>
          <li>连点越快，连击倍率越高（8 / 16 / 28 连击时升档，最高 ×1.75）。</li>
          <li>停手之后进度会缓慢回落，但<strong>不会退回到上一个阶段</strong>——已经求到的天，跑不掉。</li>
          <li>阶段越高风越大，按钮会随风飘动并躲开指针；点不中也没关系，键盘 <kbd>Space</kbd> / <kbd>Enter</kbd> 同样有效（限速）。</li>
          <li>觉得太难，就在左侧面板打开「轻松模式」：风力减半、取消躲避、回落减速。</li>
        </ul>
      </section>

      <section class="note-section">
        <h3 class="note-section__title">技术说明</h3>
        <p class="note-body">
          Vue 3 + Vite + TypeScript。画面由 CSS 渐变/关键帧与单个 Canvas 粒子层绘制；
          音效由 Web Audio API 合成（雨、风、雷、冰雹、警报、钟声都是滤波器 + 振荡器 + 噪声），
          没有任何图片或音频资源文件，也不加载任何外部资源。阶段数值集中在
          <code>src/game/stages.ts</code>，想调节难度改那张表即可。
        </p>
        <p class="note-body">
          源码仓库：<a
            class="note-link"
            :href="REPO_URL"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="REPO_LABEL"
            >{{ REPO_TEXT }}</a
          >
        </p>
      </section>

      <section class="note-section">
        <h3 class="note-section__title">身体感受优先</h3>
        <p class="note-body">
          后期阶段包含闪烁与屏幕震动。主闪频率被限制在 3Hz 以下；如果感到不适，
          请打开「减弱特效」或把系统设置为"减少动态效果"，两者都会关闭震动与频闪、并大幅减少粒子。
          在手机上默认就处于「极简」档：不做全屏闪光、无频闪、无震动。
        </p>
      </section>

      <section class="note-section">
        <h3 class="note-section__title">渲染兼容</h3>
        <p class="note-body">
          触屏设备会自动关闭毛玻璃、混合模式、大面积模糊与强制图层提升，以减少 GPU 合成压力
          （移动端"内容变黑、甚至整页变黑"通常就是合成器压力或 WebView 兼容问题导致的）。
          如果仍然出现，可在地址后加 <code>?safe=1</code> 打开「渲染安全模式」——连 Canvas、渐变、
          模糊与阴影都不渲染，只保留纯色背景与界面；用 <code>?safe=0</code> 关闭。
        </p>
      </section>

      <footer class="note-modal__foot">
        <button class="note-button" type="button" @click="clearLocal()">清除本地记录</button>
        <button class="note-button" type="button" @click="restart()">重新开始</button>
        <button class="note-button note-button--primary" type="button" @click="emit('close')">
          继续求雨
        </button>
      </footer>
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
  background: rgba(3, 7, 12, 0.78);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.note-modal {
  width: min(660px, 100%);
  max-height: min(88vh, 780px);
  overflow: auto;
  padding: 22px 24px 20px;
  border-radius: var(--radius-lg);
  background: var(--note-surface-solid);
  border: 1px solid var(--note-border);
  box-shadow: 0 24px 70px rgba(1, 4, 9, 0.6);
  color: var(--note-text);
  font-size: 14px;
  line-height: 1.85;
  animation: celebration-in 0.36s var(--ease-out) both;
}

.note-modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--note-border);
}

.note-modal__title {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.note-close {
  min-height: 34px;
  padding: 6px 14px;
  border-radius: var(--radius-pill);
  font-size: 13px;
  font-weight: 700;
  color: var(--note-text);
  background: var(--note-surface-raised);
  border: 1px solid var(--note-border);
}

.note-close:hover {
  border-color: var(--note-accent);
  color: var(--note-accent);
}

.note-section {
  margin-top: 20px;
}

.note-section__title {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.03em;
  color: var(--note-text);
}

.note-badge {
  padding: 2px 9px;
  border-radius: var(--radius-pill);
  font-size: 11.5px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--note-strong);
  background: var(--note-mark-bg);
  border: 1px solid color-mix(in srgb, var(--note-strong) 55%, transparent);
}

.note-body {
  margin: 0;
  max-width: 60ch;
  font-size: 14px;
  line-height: 1.9;
  color: var(--note-text-muted);
}

.note-body strong {
  color: var(--note-text);
  font-weight: 800;
}

.note-body mark {
  padding: 1px 4px;
  border-radius: 4px;
  color: var(--note-strong);
  background: var(--note-mark-bg);
  font-weight: 800;
}

.note-body code,
.note-body kbd {
  padding: 1px 6px;
  border-radius: 5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
  color: var(--note-text);
  background: var(--note-surface-raised);
  border: 1px solid var(--note-border);
}

/* 仓库链接：用已验证的 --note-accent（对深底约 10:1） */
.note-link {
  color: var(--note-accent);
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.note-link:hover {
  color: color-mix(in srgb, var(--note-accent) 70%, #ffffff);
}

.note-link:focus-visible {
  outline: 3px solid var(--note-accent);
  outline-offset: 2px;
  border-radius: 4px;
}

.note-list {
  margin: 0;
  padding-left: 0;
  list-style: none;
  display: grid;
  gap: 8px;
  max-width: 62ch;
}

.note-list li {
  position: relative;
  padding-left: 18px;
  font-size: 14px;
  line-height: 1.85;
  color: var(--note-text-muted);
}

.note-list li::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 0.72em;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--note-accent);
}

.note-list strong {
  color: var(--note-text);
  font-weight: 800;
}

.note-modal__foot {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--note-border);
  display: flex;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.note-button {
  min-height: 42px;
  padding: 10px 18px;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 700;
  color: var(--note-text);
  background: var(--note-surface-raised);
  border: 1px solid var(--note-border);
  transition: border-color var(--dur-fast) var(--ease-out), filter var(--dur-fast) var(--ease-out);
}

.note-button:hover {
  border-color: var(--note-accent);
}

.note-button--primary {
  color: #0b131e;
  background: var(--note-accent);
  border-color: color-mix(in srgb, var(--note-accent) 70%, #ffffff);
}

.note-button--primary:hover {
  filter: brightness(1.08);
}
</style>
