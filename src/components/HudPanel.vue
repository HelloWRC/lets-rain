<script setup lang="ts">
/**
 * 侧边数据面板：连击 / 诚心值 / 统计 / 历史记录。
 *
 * 移动端适配：桌面是左侧三张卡片；窄屏下（≤900px）显示为底部一行紧凑胶囊，
 * 完整卡片收进「详情」里，避免手机上被界面占掉三分之一屏幕。
 *
 * 逐帧变化的值（连击倒计时、总进度）做节流提交，避免每帧重渲染。
 */
import { computed, ref } from 'vue'
import { useGameTick } from '../composables/useGameTick'
import { comboNextTier, STAGES } from '../game/stages'
import { gameStore } from '../game/store'

const store = gameStore

const cardsOpen = ref(false)
const comboBar = ref(0)
const overallCommitted = ref(0)
const elapsedSec = ref(0)

let lastBarStep = -1
let lastOverallStep = -1
let elapsedAccum = 0

const comboText = computed(() => (store.state.combo > 1 ? `×${store.state.combo}` : '—'))
const prayersText = computed(() => Math.round(store.state.totalPrayers).toString())
const multiplierText = computed(() => `×${store.multiplier.value.toFixed(2).replace(/0$/, '')}`)
const nextTierText = computed(() => {
  const tier = comboNextTier(store.state.combo)
  return tier === null ? '已达最高倍率' : `再连点 ${tier - store.state.combo} 次升档`
})
const gainText = computed(
  () => `${(store.stage.value.advanceGain * store.multiplier.value * 100).toFixed(1)}%`,
)
const decayText = computed(() => `${(store.decayPerSecond.value * 100).toFixed(0)}% / 秒`)
const bestStageName = computed(() => STAGES[store.best.bestStage]?.name ?? '晴天')
const elapsedText = computed(() => {
  const total = elapsedSec.value
  const mm = Math.floor(total / 60)
  const ss = total % 60
  return mm > 0 ? `${mm} 分 ${ss} 秒` : `${ss} 秒`
})
const nextStageName = computed(() => store.nextStage.value?.name ?? '已到终点')
const easyMode = computed(() => store.prefs.easyMode)

function onToggleEasy(): void {
  store.setPref('easyMode', !store.prefs.easyMode)
}

useGameTick((dtMs) => {
  const step = Math.round(store.comboTimer.value * 50)
  if (step !== lastBarStep) {
    lastBarStep = step
    comboBar.value = step / 50
  }
  const overallStep = Math.round((store.state.stageIndex + store.state.stageProgress) * 100)
  if (overallStep !== lastOverallStep) {
    lastOverallStep = overallStep
    overallCommitted.value = overallStep
  }
  elapsedAccum += dtMs
  if (elapsedAccum >= 500) {
    elapsedAccum = 0
    elapsedSec.value = Math.floor(store.runElapsedMs.value / 1000)
  }
})
</script>

<template>
  <aside class="hud" aria-label="求雨数据面板">
    <!-- 窄屏专用的紧凑条 -->
    <div class="hud__strip">
      <span class="hud__pill">连击 <strong>{{ comboText }}</strong></span>
      <span class="hud__pill">诚心 <strong>{{ prayersText }}</strong></span>
      <span class="hud__pill hud__pill--minor">手滑 <strong>{{ store.missCount.value }}</strong></span>
      <button
        class="hud__pill hud__more"
        type="button"
        :aria-expanded="cardsOpen"
        @click="cardsOpen = !cardsOpen"
      >
        {{ cardsOpen ? '收起' : '详情' }}
      </button>
    </div>

    <div class="hud__cards" :class="{ 'is-open': cardsOpen }">
      <section class="hud__card panel">
        <h2 class="panel-title">连击</h2>
        <p class="hud__combo">{{ comboText }}</p>
        <div class="hud__bar" role="presentation">
          <span class="hud__bar-fill" :style="{ transform: `scaleX(${comboBar})` }" />
        </div>
        <p class="hud__meta">{{ multiplierText }} 倍增益 · {{ nextTierText }}</p>
      </section>

      <section class="hud__card panel">
        <h2 class="panel-title">本轮</h2>
        <dl class="hud__stats">
          <div>
            <dt>诚心值</dt>
            <dd>{{ store.state.totalPrayers.toFixed(1) }}</dd>
          </div>
          <div>
            <dt>单次增益</dt>
            <dd>{{ gainText }}</dd>
          </div>
          <div>
            <dt>点击数</dt>
            <dd>{{ store.state.totalClicks }}</dd>
          </div>
          <div>
            <dt>手滑</dt>
            <dd>{{ store.missCount.value }}</dd>
          </div>
          <div>
            <dt>本轮用时</dt>
            <dd>{{ elapsedText }}</dd>
          </div>
          <div>
            <dt>下一阶段</dt>
            <dd>{{ nextStageName }}</dd>
          </div>
        </dl>
        <p class="hud__decay">
          闲置回落 <strong>{{ decayText }}</strong>
          <span v-if="easyMode">（轻松模式已减半风力）</span>
        </p>
        <button
          class="ghost-button hud__easy"
          type="button"
          :aria-pressed="easyMode"
          @click="onToggleEasy"
        >
          {{ easyMode ? '轻松模式：开' : '轻松模式：关' }}
        </button>
      </section>

      <section class="hud__card panel">
        <h2 class="panel-title">最好成绩</h2>
        <dl class="hud__stats">
          <div>
            <dt>最高阶段</dt>
            <dd>{{ bestStageName }}</dd>
          </div>
          <div>
            <dt>最高连击</dt>
            <dd>{{ store.best.bestCombo }}</dd>
          </div>
          <div>
            <dt>求雨圆满</dt>
            <dd>{{ store.best.completions }} 次</dd>
          </div>
          <div>
            <dt>总进度</dt>
            <dd>{{ (overallCommitted / 6).toFixed(1) }}%</dd>
          </div>
        </dl>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.hud {
  position: absolute;
  top: calc(var(--pad) + 86px);
  left: var(--pad);
  z-index: var(--z-hud);
  width: 210px;
  pointer-events: none;
}

.hud__cards {
  display: grid;
  gap: 10px;
}

.hud__strip {
  display: none;
}

.hud__card {
  padding: 10px 12px;
  pointer-events: auto;
}

.hud__combo {
  margin: 4px 0 6px;
  font-size: 30px;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: color-mix(in srgb, var(--accent) 74%, #ffffff);
  text-shadow: 0 0 18px color-mix(in srgb, var(--accent) 55%, transparent);
}

.hud__bar {
  height: 5px;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.18);
  overflow: hidden;
}

.hud__bar-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 40%, #ffffff));
  transform-origin: 0 50%;
}

.hud__meta,
.hud__decay {
  margin: 7px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--hud-text-muted);
}

.hud__decay strong {
  color: var(--hud-text);
}

.hud__stats {
  margin: 6px 0 0;
  display: grid;
  gap: 5px;
  font-size: 12px;
}

.hud__stats > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.hud__stats dt {
  color: var(--hud-text-muted);
}

.hud__stats dd {
  margin: 0;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--hud-text);
}

.hud__easy {
  margin-top: 9px;
  width: 100%;
}

/* ---- 窄屏：底部紧凑条 + 可展开的详情 ---- */
@media (max-width: 900px) {
  .hud {
    top: auto;
    bottom: calc(var(--pad) + 58px);
    left: calc(var(--pad) + var(--safe-left));
    right: calc(var(--pad) + var(--safe-right));
    width: auto;
  }

  .hud__strip {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    flex-wrap: wrap;
    pointer-events: auto;
  }

  .hud__pill {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    padding: 8px 11px;
    min-height: 44px;
    border-radius: var(--radius-pill);
    font-size: 12px;
    color: var(--hud-text-muted);
    background: var(--hud-surface-solid);
    border: 1px solid var(--hud-border);
  }

  .hud__pill strong {
    font-size: 14px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: var(--hud-text);
  }

  .hud__more {
    font-weight: 700;
    color: var(--hud-text);
    cursor: pointer;
  }

  .hud__cards {
    display: none;
    position: absolute;
    bottom: calc(100% + 8px);
    left: 0;
    right: 0;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    max-height: 46vh;
    overflow: auto;
  }

  .hud__cards.is-open {
    display: grid;
  }

  .hud__cards > :last-child {
    grid-column: 1 / -1;
  }

  .hud__combo {
    font-size: 24px;
  }

  .hud__easy {
    min-height: 44px;
  }
}

/* ---- 横屏矮屏：详情默认收起，紧凑条再压一点 ---- */
@media (max-height: 480px) {
  .hud__pill {
    padding: 5px 9px;
    min-height: 34px;
    font-size: 11.5px;
  }
  .hud__cards {
    max-height: 60vh;
  }
}
</style>
