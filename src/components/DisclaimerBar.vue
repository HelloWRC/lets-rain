<script setup lang="ts">
/**
 * 常驻免责声明条。
 *
 * 可读性设计要点：
 *  - 用固定的深底 + 亮字（--note-* 令牌），不继承随阶段变化的 --text / --sky-*。
 *    天空从浅金到近黑，任何"半透明底 + 继承主题色"的写法都会在晴天变成深字压深底。
 *  - 正文 13px / 行高 1.65（窄屏 12.5px），左对齐、限制行宽，长句更好读。
 *  - 「仅供娱乐」做成高对比徽标，关键限制条款加粗提亮，一眼能扫到。
 *  - 完整声明放不进一条状态栏，改用「查看完整声明」按钮直达关于面板。
 */
defineEmits<{ (event: 'open-about'): void }>()
</script>

<template>
  <aside class="disclaimer-bar" role="note" aria-label="免责声明">
    <div class="disclaimer-bar__inner">
      <p class="disclaimer-bar__text">
        <span class="disclaimer-bar__badge">仅供娱乐</span>
        <span>
          本页所有天气特效与音效均由程序实时合成，<b>不代表任何实际气象数据、预报或诉求</b>；
          真实天气请以官方气象部门发布的信息为准。
        </span>
      </p>
      <button class="disclaimer-bar__link" type="button" @click="$emit('open-about')">
        查看完整声明
      </button>
    </div>
  </aside>
</template>

<style scoped>
.disclaimer-bar {
  /* 作为 grid 布局行存在（不是覆盖层），因此不会压住任何内容，也不会被内容压住 */
  position: relative;
  z-index: var(--z-hud);
  display: flex;
  align-items: center;
  padding: 8px calc(var(--pad) + 4px);
  background: var(--note-surface);
  border-top: 1px solid var(--note-border);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  color: var(--note-text);
}

.disclaimer-bar__inner {
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 8px 16px;
  flex-wrap: wrap;
}

.disclaimer-bar__text {
  flex: 1 1 320px;
  min-width: 0;
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  letter-spacing: 0.01em;
  text-align: left;
  text-wrap: pretty;
}

/* 徽标参与行内流：不会独占一行，窄屏也能和正文共用首行 */
.disclaimer-bar__badge {
  display: inline-block;
  margin-right: 6px;
  padding: 1px 9px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: var(--note-strong);
  background: var(--note-mark-bg);
  border: 1px solid color-mix(in srgb, var(--note-strong) 55%, transparent);
  white-space: nowrap;
}

.disclaimer-bar__text b {
  font-weight: 800;
  color: var(--note-strong);
}

.disclaimer-bar__link {
  flex: none;
  margin-left: auto;
  padding: 5px 12px;
  min-height: 30px;
  border-radius: var(--radius-pill);
  font-size: 12.5px;
  font-weight: 700;
  color: var(--note-accent);
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--note-accent) 45%, transparent);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
}

.disclaimer-bar__link:hover {
  background: color-mix(in srgb, var(--note-accent) 18%, transparent);
  border-color: var(--note-accent);
}

.disclaimer-bar__link:focus-visible {
  outline: 3px solid var(--note-accent);
  outline-offset: 2px;
}

@media (max-width: 720px) {
  .disclaimer-bar {
    align-items: flex-start;
    padding: 8px var(--pad);
  }
  /* 窄屏：按钮跟着正文行内流走，不再单独占一行 */
  .disclaimer-bar__inner {
    display: block;
  }
  .disclaimer-bar__text {
    font-size: 12.5px;
    line-height: 1.6;
  }
  .disclaimer-bar__link {
    display: inline-block;
    margin: 6px 0 0;
    padding: 3px 10px;
    min-height: 26px;
    font-size: 12px;
  }
}
</style>
