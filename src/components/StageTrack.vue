<script setup lang="ts">
/**
 * 阶段轨道：6 个阶段节点 + 当前阶段进度环 + "只回落不倒退"的说明。
 *
 * 进度环只在"百分比整数位变化"时才提交到响应式状态（每个阶段最多 100 次更新），
 * 既保证视觉连续，又避免每帧重渲染。
 */
import { computed, ref } from 'vue'
import { useGameTick } from '../composables/useGameTick'
import { clamp01 } from '../game/math'
import { STAGES } from '../game/stages'
import { gameStore } from '../game/store'

const store = gameStore
const RADIUS = 13
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** 0..1，整数百分比粒度 */
const committedProgress = ref(0)

const nodes = computed(() =>
  STAGES.map((stage) => ({
    key: stage.key,
    name: stage.name,
    state:
      stage.index < store.state.stageIndex
        ? 'done'
        : stage.index === store.state.stageIndex
          ? 'current'
          : 'locked',
  })),
)

const percentLabel = computed(() => `${Math.round(committedProgress.value * 100)}%`)
const ringOffset = computed(() => CIRCUMFERENCE * (1 - committedProgress.value))

useGameTick(() => {
  const progress = clamp01(store.state.stageProgress)
  if (Math.abs(progress - committedProgress.value) >= 0.01) committedProgress.value = progress
})
</script>

<template>
  <nav class="track panel" aria-label="求雨阶段进度">
    <ol class="track__list">
      <li v-for="node in nodes" :key="node.key" class="track__node" :class="`is-${node.state}`">
        <span class="track__dot">
          <svg v-if="node.state === 'current'" class="track__ring" viewBox="0 0 32 32" aria-hidden="true">
            <circle class="track__ring-bg" cx="16" cy="16" :r="RADIUS" />
            <circle
              class="track__ring-fg"
              cx="16"
              cy="16"
              :r="RADIUS"
              :stroke-dasharray="CIRCUMFERENCE"
              :stroke-dashoffset="ringOffset"
            />
          </svg>
        </span>
        <span class="track__name">{{ node.name }}</span>
      </li>
    </ol>

    <p class="track__note">
      当前阶段 <strong>{{ store.stage.value.name }}</strong>
      <span class="track__percent">{{ percentLabel }}</span>
      <span class="track__hint">不点击会缓慢回落，但绝不会退回上一阶段</span>
    </p>
  </nav>
</template>

<style scoped>
.track {
  padding: 10px 14px 9px;
  display: grid;
  gap: 8px;
  max-width: min(760px, calc(100% - 2 * var(--pad)));
  margin: 0 auto;
}

.track__list {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.track__node {
  display: grid;
  justify-items: center;
  gap: 4px;
  flex: 1 1 0;
  min-width: 0;
  position: relative;
}

/* 节点之间的连线 */
.track__node + .track__node::before {
  content: '';
  position: absolute;
  top: 9px;
  right: 50%;
  width: 100%;
  height: 2px;
  background: var(--hud-hairline);
  transform: translateX(-14px);
  z-index: 0;
}

.track__node.is-done + .track__node::before,
.track__node.is-current + .track__node::before {
  background: color-mix(in srgb, var(--accent) 70%, var(--hud-surface));
}

.track__dot {
  position: relative;
  z-index: 1;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--hud-text) 28%, transparent);
  box-shadow: 0 0 0 3px rgba(8, 14, 24, 0.9);
  transition: background 0.4s var(--ease-out), box-shadow 0.4s var(--ease-out);
}

.track__node.is-done .track__dot {
  background: color-mix(in srgb, var(--accent) 85%, #ffffff);
}

.track__node.is-current .track__dot {
  background: transparent;
  box-shadow: none;
}

.track__ring {
  position: absolute;
  inset: -7px;
  width: 32px;
  height: 32px;
  rotate: -90deg;
}

.track__ring-bg {
  fill: rgba(255, 255, 255, 0.14);
  stroke: rgba(255, 255, 255, 0.34);
  stroke-width: 3;
}

.track__ring-fg {
  fill: color-mix(in srgb, var(--accent) 42%, var(--hud-surface));
  stroke: color-mix(in srgb, var(--accent) 92%, #ffffff);
  stroke-width: 3.4;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.12s linear;
}

.track__name {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  white-space: nowrap;
  color: var(--hud-text-muted);
}

.track__node.is-done .track__name,
.track__node.is-current .track__name {
  color: var(--hud-text);
}

.track__node.is-current .track__name {
  color: color-mix(in srgb, var(--accent) 74%, #ffffff);
  text-shadow: 0 0 12px color-mix(in srgb, var(--accent) 55%, transparent);
}

.track__note {
  margin: 0;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--hud-text-muted);
}

.track__note strong {
  color: var(--hud-text);
}

.track__percent {
  font-variant-numeric: tabular-nums;
  font-weight: 800;
  color: color-mix(in srgb, var(--accent) 62%, #ffffff);
}

.track__hint {
  color: var(--hud-text-muted);
  font-size: 11px;
}

.track__hint::before {
  content: '·';
  margin-right: 6px;
}

@media (max-width: 560px) {
  .track__name {
    font-size: 10px;
    letter-spacing: 0;
  }
  .track__hint {
    display: none;
  }
}
</style>
