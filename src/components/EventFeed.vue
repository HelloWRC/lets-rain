<script setup lang="ts">
/** 事件播报：阶段升级、连击里程碑、手滑吐槽。内容由 store 统一产生。 */
import { gameStore } from '../game/store'

const store = gameStore
</script>

<template>
  <ul class="feed" aria-live="polite" aria-label="求雨动态">
    <li v-for="item in store.feed.value" :key="item.id" class="feed__item" :class="`is-${item.kind}`">
      {{ item.text }}
    </li>
  </ul>
</template>

<style scoped>
.feed {
  position: absolute;
  right: calc(var(--pad) + var(--safe-right));
  bottom: calc(var(--pad) + 62px);
  z-index: var(--z-hud);
  width: min(320px, 46vw);
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 6px;
  justify-items: end;
  pointer-events: none;
}

.feed__item {
  max-width: 100%;
  padding: 6px 11px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  line-height: 1.45;
  text-align: right;
  /* 播报条会漂在云/雨幕/草地之上，用不透明底，对比度不随背景变化 */
  background: color-mix(in srgb, var(--accent) 8%, var(--hud-surface-solid));
  border: 1px solid var(--hud-border);
  color: var(--hud-text);
  box-shadow: 0 6px 18px rgba(2, 6, 12, 0.4);
  animation: feed-in 0.32s var(--ease-out) both;
}

.feed__item.is-stage {
  font-weight: 700;
  border-color: color-mix(in srgb, var(--accent) 65%, transparent);
  background: color-mix(in srgb, var(--accent) 20%, var(--hud-surface-solid));
}

.feed__item.is-combo {
  border-color: color-mix(in srgb, var(--accent) 50%, transparent);
}

.feed__item.is-warn {
  border-color: rgba(255, 180, 140, 0.7);
}

/* 窄屏：让开底部的"紧凑数据条"与"控制栏"，并且只留最近 3 条 */
@media (max-width: 900px) {
  .feed {
    left: calc(var(--pad) + var(--safe-left));
    right: calc(var(--pad) + var(--safe-right));
    width: auto;
    bottom: calc(var(--pad) + 112px);
    justify-items: center;
  }
  .feed__item {
    text-align: center;
    font-size: 11.5px;
    padding: 5px 10px;
  }
  .feed__item:nth-child(n + 4) {
    display: none;
  }
}

/* 手机横屏：竖向没地方了，把播报挪到右上角空位，只留最新一条 */
@media (max-height: 480px) {
  .feed {
    top: calc(var(--pad) + 42px + var(--safe-top));
    bottom: auto;
    left: auto;
    right: calc(var(--pad) + var(--safe-right));
    width: min(46vw, 320px);
    justify-items: end;
  }
  .feed__item {
    text-align: right;
  }
  .feed__item:nth-child(n + 2) {
    display: none;
  }
}
</style>
