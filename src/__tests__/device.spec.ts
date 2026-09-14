import { afterEach, describe, expect, it } from 'vitest'
import { device, type DeviceProfile } from '../game/device'
import { createGameStore } from '../game/store'
import { DEFAULT_PREFS } from '../game/prefs'

/** device 是模块级单例，测试之间必须还原，避免互相污染 */
const pristineDevice: DeviceProfile = { ...device }

afterEach(() => {
  Object.assign(device, pristineDevice)
})

function makeStore() {
  return createGameStore({ persist: false, random: () => 0.5 })
}

function setDevice(patch: Partial<DeviceProfile>): void {
  Object.assign(device, patch)
}

describe('移动端自动减弱特效', () => {
  it('桌面端默认不减弱', () => {
    setDevice({ isTouch: false, isNarrow: false, isMobile: false, prefersReducedMotion: false })
    const store = makeStore()
    expect(store.effectsLevel.value).toBe('full')
    expect(store.effectsReduced.value).toBe(false)
    expect(store.effectsMinimal.value).toBe(false)
    expect(store.effectsAuto.value).toBe(false)
  })

  it('触屏设备默认进入「极简」档，并标记为自动接管', () => {
    setDevice({ isTouch: true, isNarrow: true, isMobile: true, prefersReducedMotion: false })
    const store = makeStore()
    expect(store.effectsLevel.value).toBe('minimal')
    expect(store.effectsMinimal.value).toBe(true)
    expect(store.effectsAuto.value).toBe(true)
  })

  it('用户手动关掉「减弱特效」后不再自动接管（手机也能看完整特效）', () => {
    setDevice({ isTouch: true, isNarrow: true, isMobile: true, prefersReducedMotion: false })
    const store = makeStore()
    expect(store.effectsLevel.value).toBe('minimal')

    store.toggleEffectsReduced()

    expect(store.effectsLevel.value).toBe('full')
    expect(store.effectsMinimal.value).toBe(false)
    expect(store.effectsAuto.value).toBe(false)
    expect(store.prefs.mobileAutoReduce).toBe(false)
  })

  it('移动端再点一次则强制打开（仍然是极简档，因为设备是触屏）', () => {
    setDevice({ isTouch: true, isNarrow: true, isMobile: true, prefersReducedMotion: false })
    const store = makeStore()
    store.toggleEffectsReduced() // 关掉自动 → 完整特效
    store.toggleEffectsReduced() // 手动要求减弱

    expect(store.prefs.reduceFx).toBe(true)
    expect(store.effectsLevel.value).toBe('minimal')
    expect(store.effectsAuto.value).toBe(false)
  })

  it('桌面端手动打开只到「减弱」档（不需要极简）', () => {
    setDevice({ isTouch: false, isNarrow: false, isMobile: false, prefersReducedMotion: false })
    const store = makeStore()
    store.toggleEffectsReduced()
    expect(store.prefs.reduceFx).toBe(true)
    expect(store.effectsLevel.value).toBe('reduced')
    expect(store.effectsMinimal.value).toBe(false)
  })

  it('系统「减少动态效果」在桌面给「减弱」，且不会被当成"自动接管"', () => {
    setDevice({ isTouch: false, isNarrow: false, isMobile: false, prefersReducedMotion: true })
    const store = makeStore()
    expect(store.effectsLevel.value).toBe('reduced')
    expect(store.effectsAuto.value).toBe(false)
  })

  it('系统「减少动态效果」在触屏上同样是极简（取更严的一档）', () => {
    setDevice({ isTouch: true, isNarrow: true, isMobile: true, prefersReducedMotion: true })
    const store = makeStore()
    expect(store.effectsLevel.value).toBe('minimal')
  })

  it('resetEffectsAuto() 恢复"跟随设备"', () => {
    setDevice({ isTouch: true, isNarrow: true, isMobile: true, prefersReducedMotion: false })
    const store = makeStore()
    store.toggleEffectsReduced()
    expect(store.prefs.mobileAutoReduce).toBe(false)

    store.resetEffectsAuto()

    expect(store.prefs.reduceFx).toBe(false)
    expect(store.prefs.mobileAutoReduce).toBe(DEFAULT_PREFS.mobileAutoReduce)
    expect(store.effectsLevel.value).toBe('minimal')
    expect(store.effectsAuto.value).toBe(true)
  })

  it('窄屏但非触屏（桌面缩窗）不会自动减弱', () => {
    setDevice({ isTouch: false, isNarrow: true, isMobile: true, prefersReducedMotion: false })
    const store = makeStore()
    expect(store.effectsLevel.value).toBe('full')
  })

  it('运行中切换系统偏好会实时生效（reactive）', () => {
    setDevice({ isTouch: false, isNarrow: false, isMobile: false, prefersReducedMotion: false })
    const store = makeStore()
    expect(store.effectsLevel.value).toBe('full')

    setDevice({ prefersReducedMotion: true })
    expect(store.effectsLevel.value).toBe('reduced')
  })
})

describe('渲染安全模式（?safe=1）', () => {
  it('默认关闭', () => {
    const store = makeStore()
    expect(store.safeRender.value).toBe(false)
  })

  it('safe=1 打开并顺带压到最低动效', () => {
    const store = makeStore()
    store.applySafeRenderFromUrl('?safe=1')
    expect(store.safeRender.value).toBe(true)
    expect(store.prefs.reduceFx).toBe(true)
    expect(store.prefs.mobileAutoReduce).toBe(false)
  })

  it('safe=0 可以关回去', () => {
    const store = makeStore()
    store.applySafeRenderFromUrl('?safe=1')
    store.applySafeRenderFromUrl('?safe=0')
    expect(store.safeRender.value).toBe(false)
  })

  it('带其它参数或没有参数时不动设置（幂等，不会误触发）', () => {
    const store = makeStore()
    store.applySafeRenderFromUrl('')
    store.applySafeRenderFromUrl('?utm=abc')
    store.applySafeRenderFromUrl('?safe=')
    expect(store.safeRender.value).toBe(false)
    expect(store.prefs.reduceFx).toBe(false)
  })

  it('在 query 中间也能识别（?a=1&safe=1&b=2）', () => {
    const store = makeStore()
    store.applySafeRenderFromUrl('?a=1&safe=1&b=2')
    expect(store.safeRender.value).toBe(true)
  })
})
