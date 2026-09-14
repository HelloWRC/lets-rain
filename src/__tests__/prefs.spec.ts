// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_BEST,
  DEFAULT_PREFS,
  clearStorage,
  loadBest,
  loadPrefs,
  saveBest,
  savePrefs,
} from '../game/prefs'

/**
 * 环境说明：在本机的 Node 26 + vitest jsdom 组合下，Node 自带的 localStorage 访问器
 * 会遮蔽 jsdom 的实现（`window.localStorage` 为 undefined）。浏览器里没有这个问题，
 * 但为了让持久化逻辑可测，这里装一个内存版 Storage。
 */
function installMemoryStorage(): Storage {
  const map = new Map<string, string>()
  const storage: Storage = {
    get length() {
      return map.size
    },
    clear: () => {
      map.clear()
    },
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => {
      map.delete(key)
    },
    setItem: (key: string, value: string) => {
      map.set(key, String(value))
    },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  })
  return storage
}

let storage: Storage

beforeEach(() => {
  storage = installMemoryStorage()
})

describe('偏好持久化', () => {
  it('空存储时返回默认值', () => {
    expect(loadPrefs()).toEqual(DEFAULT_PREFS)
    expect(loadBest()).toEqual(DEFAULT_BEST)
    // 移动端默认自动减弱特效
    expect(DEFAULT_PREFS.mobileAutoReduce).toBe(true)
  })

  it('保存后可以读回', () => {
    savePrefs({ ...DEFAULT_PREFS, muted: true, volume: 0.25, easyMode: true, hintSeen: true })
    const prefs = loadPrefs()
    expect(prefs.muted).toBe(true)
    expect(prefs.volume).toBe(0.25)
    expect(prefs.easyMode).toBe(true)
    expect(prefs.hintSeen).toBe(true)
    expect(prefs.mobileAutoReduce).toBe(true)
  })

  it('音量被钳制到 0..1，类型非法的字段回落到默认值', () => {
    storage.setItem(
      'lets-rain:prefs:v1',
      JSON.stringify({ volume: 42, muted: 'yes', mobileAutoReduce: 'no' }),
    )
    const prefs = loadPrefs()
    expect(prefs.volume).toBe(1)
    expect(prefs.muted).toBe(DEFAULT_PREFS.muted)
    expect(prefs.mobileAutoReduce).toBe(DEFAULT_PREFS.mobileAutoReduce)
  })

  it('用户可以关闭移动端自动减弱并持久化', () => {
    savePrefs({ ...DEFAULT_PREFS, mobileAutoReduce: false })
    expect(loadPrefs().mobileAutoReduce).toBe(false)
  })

  it('损坏的 JSON 不会抛错，直接回落默认值', () => {
    storage.setItem('lets-rain:prefs:v1', '{不是 JSON')
    storage.setItem('lets-rain:best:v1', 'null')
    expect(() => loadPrefs()).not.toThrow()
    expect(loadPrefs()).toEqual(DEFAULT_PREFS)
    expect(loadBest()).toEqual(DEFAULT_BEST)
  })

  it('存储被禁用（访问即抛错）时也不崩溃', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      get() {
        throw new Error('SecurityError')
      },
      configurable: true,
    })
    expect(loadPrefs()).toEqual(DEFAULT_PREFS)
    expect(() => savePrefs({ ...DEFAULT_PREFS })).not.toThrow()
  })
})

describe('历史记录持久化', () => {
  it('保存并读回最高阶段/最高连击/圆满次数', () => {
    saveBest({ bestStage: 5, bestCombo: 63, completions: 2 })
    expect(loadBest()).toEqual({ bestStage: 5, bestCombo: 63, completions: 2 })
  })

  it('负数与浮点被修正为合法值', () => {
    storage.setItem('lets-rain:best:v1', JSON.stringify({ bestStage: -3.7, bestCombo: 2.9 }))
    const best = loadBest()
    expect(best.bestStage).toBe(0)
    expect(best.bestCombo).toBe(2)
  })

  it('clearStorage 会清掉两项记录', () => {
    savePrefs({ ...DEFAULT_PREFS, muted: true })
    saveBest({ bestStage: 3, bestCombo: 9, completions: 1 })
    clearStorage()
    expect(loadPrefs()).toEqual(DEFAULT_PREFS)
    expect(loadBest()).toEqual(DEFAULT_BEST)
  })
})
