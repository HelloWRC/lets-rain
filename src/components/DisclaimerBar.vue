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
 *  - 移动端：按钮排在正文右侧（不另占一行），按钮文案缩短，整条尽量矮。
 *  - 右侧操作区同时放本项目的 GitHub 链接（窄屏只留图标，省下横向空间给声明正文）。
 */
import { computed } from 'vue'
import { device } from '../game/device'
import { REPO_LABEL, REPO_URL } from '../game/site'

defineEmits<{ (event: 'open-about'): void }>()

const narrow = computed(() => device.isNarrow)
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
      <div class="disclaimer-bar__actions">
        <a
          class="disclaimer-bar__link disclaimer-bar__github"
          :href="REPO_URL"
          target="_blank"
          rel="noopener noreferrer"
          :aria-label="REPO_LABEL"
          :title="REPO_LABEL"
        >
          <svg
            class="disclaimer-bar__icon"
            viewBox="0 0 16 16"
            width="16"
            height="16"
            aria-hidden="true"
            focusable="false"
          >
            <path
              fill="currentColor"
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A7.995 7.995 0 0 0 16 8c0-4.42-3.58-8-8-8z"
            />
          </svg>
          <span class="disclaimer-bar__github-text">GitHub</span>
        </a>
        <button
          class="disclaimer-bar__link"
          type="button"
          aria-label="查看完整免责声明"
          @click="$emit('open-about')"
        >
          {{ narrow ? '完整声明' : '查看完整声明' }}
        </button>
      </div>
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
  padding: 8px calc(var(--pad) + 4px + var(--safe-right)) calc(8px + var(--safe-bottom))
    calc(var(--pad) + 4px + var(--safe-left));
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

.disclaimer-bar__actions {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.disclaimer-bar__link {
  flex: none;
  padding: 5px 12px;
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: var(--radius-pill);
  font-size: 12.5px;
  font-weight: 700;
  color: var(--note-accent);
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--note-accent) 45%, transparent);
  text-decoration: none;
  transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
}

.disclaimer-bar__github {
  font-weight: 600;
}

.disclaimer-bar__icon {
  display: block;
  flex: none;
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
    align-items: center;
    padding: 8px calc(var(--pad) + var(--safe-right)) calc(8px + var(--safe-bottom))
      calc(var(--pad) + var(--safe-left));
  }
  /* 按钮排在正文右侧而不是另起一行：整条声明能矮掉 40px 左右 */
  .disclaimer-bar__inner {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: nowrap;
  }
  .disclaimer-bar__text {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 12.5px;
    line-height: 1.6;
  }
  .disclaimer-bar__link {
    flex: none;
    margin: 0;
    padding: 9px 11px;
    min-height: 40px;
    font-size: 12px;
    white-space: nowrap;
  }
  /* 窄屏只留 GitHub 图标：横向空间优先给声明正文 */
  .disclaimer-bar__github {
    width: 36px;
    padding: 0;
  }
  .disclaimer-bar__github-text {
    display: none;
  }
  /* 窄屏正文再压一点：多一个操作项会多占一行，这里把行高和字号各收一点补回来 */
  .disclaimer-bar__text {
    font-size: 12px;
    line-height: 1.55;
  }
}

/* 横屏手机：整条只能占 60px 左右，按钮再压一点（触控目标 34px 是这里的取舍） */
@media (max-height: 480px) {
  .disclaimer-bar {
    padding: 6px calc(var(--pad) + var(--safe-right)) calc(6px + var(--safe-bottom))
      calc(var(--pad) + var(--safe-left));
  }
  .disclaimer-bar__text {
    font-size: 12px;
    line-height: 1.5;
  }
  .disclaimer-bar__link {
    min-height: 34px;
    padding: 7px 10px;
  }
  .disclaimer-bar__github {
    width: 34px;
    padding: 0;
  }
}
</style>
