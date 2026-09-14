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
    expect(store.effectsReduced.value).toBe(false)
    expect(store.effectsAuto.value).toBe(false)
  })

  it('触屏设备默认自动减弱，并标记为"自动接管"', () => {
    setDevice({ isTouch: true, isNarrow: true, isMobile: true, prefersReducedMotion: false })
    const store = makeStore()
    expect(store.effectsReduced.value).toBe(true)
    expect(store.effectsAuto.value).toBe(true)
  })

  it('用户手动关掉「减弱特效」后不再自动接管（手机也能看完整特效）', () => {
    setDevice({ isTouch: true, isNarrow: true, isMobile: true, prefersReducedMotion: false })
    const store = makeStore()
    expect(store.effectsReduced.value).toBe(true)

    store.toggleEffectsReduced()

    expect(store.effectsReduced.value).toBe(false)
    expect(store.effectsAuto.value).toBe(false)
    expect(store.prefs.mobileAutoReduce).toBe(false)
  })

  it('再点一次则强制打开（此时与设备无关）', () => {
    setDevice({ isTouch: true, isNarrow: true, isMobile: true, prefersReducedMotion: false })
    const store = makeStore()
    store.toggleEffectsReduced() // 关掉自动 → 完整特效
    store.toggleEffectsReduced() // 强制打开

    expect(store.prefs.reduceFx).toBe(true)
    expect(store.effectsReduced.value).toBe(true)
    expect(store.effectsAuto.value).toBe(false)

    // 即使切回桌面也保持用户的选择
    setDevice({ isTouch: false, isNarrow: false, isMobile: false })
    expect(store.effectsReduced.value).toBe(true)
  })

  it('系统「减少动态效果」优先级最高，且不会被当成"自动接管"', () => {
    setDevice({ isTouch: false, isNarrow: false, isMobile: false, prefersReducedMotion: true })
    const store = makeStore()
    expect(store.effectsReduced.value).toBe(true)
    expect(store.effectsAuto.value).toBe(false)
  })

  it('resetEffectsAuto() 恢复"跟随设备"', () => {
    setDevice({ isTouch: true, isNarrow: true, isMobile: true, prefersReducedMotion: false })
    const store = makeStore()
    store.toggleEffectsReduced()
    expect(store.prefs.mobileAutoReduce).toBe(false)

    store.resetEffectsAuto()

    expect(store.prefs.reduceFx).toBe(false)
    expect(store.prefs.mobileAutoReduce).toBe(DEFAULT_PREFS.mobileAutoReduce)
    expect(store.effectsReduced.value).toBe(true)
    expect(store.effectsAuto.value).toBe(true)
  })

  it('窄屏但非触屏（桌面缩窗）不会自动减弱', () => {
    setDevice({ isTouch: false, isNarrow: true, isMobile: true, prefersReducedMotion: false })
    const store = makeStore()
    expect(store.effectsReduced.value).toBe(false)
  })

  it('运行中切换系统偏好会实时生效（reactive）', () => {
    setDevice({ isTouch: false, isNarrow: false, isMobile: false, prefersReducedMotion: false })
    const store = makeStore()
    expect(store.effectsReduced.value).toBe(false)

    setDevice({ prefersReducedMotion: true })
    expect(store.effectsReduced.value).toBe(true)
  })
})
