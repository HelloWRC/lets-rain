/** localStorage 持久化：用户偏好、历史记录。所有读写都用 try/catch 包住，隐私模式下自动退化为内存态。 */

import { clamp } from './math'
import type { BestRecord, Prefs } from './types'

const PREFS_KEY = 'lets-rain:prefs:v1'
const BEST_KEY = 'lets-rain:best:v1'

export const DEFAULT_PREFS: Prefs = {
  muted: false,
  volume: 0.7,
  easyMode: false,
  reduceFx: false,
  // 移动端默认减弱特效（缓解闪烁、也省电）；用户手动改过之后就不再自动接管
  mobileAutoReduce: true,
  hintSeen: false,
}

export const DEFAULT_BEST: BestRecord = {
  bestStage: 0,
  bestCombo: 0,
  completions: 0,
}

function getStorage(): Storage | null {
  // 先判断是否在浏览器环境：Node 里访问 localStorage 会触发无用的实验性警告。
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage ?? null
  } catch {
    // 隐私模式/被禁用时访问即抛错
    return null
  }
}

function readRecord(key: string): Record<string, unknown> | null {
  const storage = getStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

function writeRecord(key: string, value: unknown): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    /* 配额满或隐私模式：忽略 */
  }
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function loadPrefs(): Prefs {
  const raw = readRecord(PREFS_KEY)
  if (!raw) return { ...DEFAULT_PREFS }
  return {
    muted: asBool(raw.muted, DEFAULT_PREFS.muted),
    volume: clamp(asNumber(raw.volume, DEFAULT_PREFS.volume), 0, 1),
    easyMode: asBool(raw.easyMode, DEFAULT_PREFS.easyMode),
    reduceFx: asBool(raw.reduceFx, DEFAULT_PREFS.reduceFx),
    mobileAutoReduce: asBool(raw.mobileAutoReduce, DEFAULT_PREFS.mobileAutoReduce),
    hintSeen: asBool(raw.hintSeen, DEFAULT_PREFS.hintSeen),
  }
}

export function savePrefs(prefs: Prefs): void {
  writeRecord(PREFS_KEY, { ...prefs })
}

export function loadBest(): BestRecord {
  const raw = readRecord(BEST_KEY)
  if (!raw) return { ...DEFAULT_BEST }
  return {
    bestStage: Math.max(0, Math.floor(asNumber(raw.bestStage, 0))),
    bestCombo: Math.max(0, Math.floor(asNumber(raw.bestCombo, 0))),
    completions: Math.max(0, Math.floor(asNumber(raw.completions, 0))),
  }
}

export function saveBest(best: BestRecord): void {
  writeRecord(BEST_KEY, { ...best })
}

export function clearStorage(): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.removeItem(PREFS_KEY)
    storage.removeItem(BEST_KEY)
  } catch {
    /* 忽略 */
  }
}
