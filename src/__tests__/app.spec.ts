// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../App.vue'
import { gameStore } from '../game/store'
import { STAGES } from '../game/stages'

beforeEach(() => {
  // jsdom 默认没有 canvas 实现：粒子层会自动降级（getContext 返回 null）
  HTMLCanvasElement.prototype.getContext = (() => null) as never
  gameStore.reset()
})

describe('App 冒烟测试', () => {
  it('渲染出 6 个阶段节点，并常驻免责声明', () => {
    const wrapper = mount(App)

    expect(wrapper.findAll('.track__node')).toHaveLength(STAGES.length)
    expect(wrapper.text()).toContain('仅供娱乐')
    expect(wrapper.text()).toContain('不代表任何实际气象数据')

    wrapper.unmount()
  })

  it('默认弹出首次访问提示（音效与免责声明）', () => {
    const wrapper = mount(App)

    expect(wrapper.text()).toContain('开始之前')
    expect(wrapper.text()).toContain('会播放声音')

    wrapper.unmount()
  })

  it('点击求雨按钮会推进进度并累加点数', async () => {
    const wrapper = mount(App)
    const before = gameStore.state.totalClicks

    await wrapper.find('.pray-btn').trigger('pointerdown')

    expect(gameStore.state.totalClicks).toBe(before + 1)
    expect(gameStore.state.stageProgress).toBeGreaterThan(0)

    wrapper.unmount()
  })

  it('控制栏可以重新开始', async () => {
    const wrapper = mount(App)
    await wrapper.find('.pray-btn').trigger('pointerdown')
    expect(gameStore.state.totalClicks).toBeGreaterThan(0)

    const resetButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('重新开始'))
    expect(resetButton).toBeTruthy()
    await resetButton?.trigger('click')

    expect(gameStore.state.totalClicks).toBe(0)
    expect(gameStore.state.stageIndex).toBe(0)

    wrapper.unmount()
  })
})
