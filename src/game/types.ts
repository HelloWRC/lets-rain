/** 全部游戏类型定义。阶段数据表 stages.ts 是唯一真源。 */

export type StageKey = 'sunny' | 'cloudy' | 'overcast' | 'rain' | 'storm' | 'severe'

/** 每个阶段点击音的"乐器"，由音频引擎合成。 */
export type ClickVoice = 'chime' | 'woodblock' | 'thud' | 'drop' | 'crack' | 'zap'

/** 环境音层：决定常驻噪声的组合方式。 */
export type AmbientKey = 'none' | 'breeze' | 'drone' | 'rain' | 'downpour' | 'tempest'

export interface Vec2 {
  x: number
  y: number
}

export interface Size {
  w: number
  h: number
}

/** 天空/云/地面/文字的配色，逐帧向目标阶段插值。 */
export interface StagePalette {
  skyTop: string
  skyMid: string
  skyBottom: string
  sun: string
  cloud: string
  cloudShade: string
  ground: string
  accent: string
  text: string
  vignette: string
  vignetteStrength: number
}

/** 按钮随风飘动 + 躲避指针的参数。 */
export interface WindProfile {
  /** 基础振幅（px） */
  amp: number
  /** 基础角频率（rad/s） */
  freq: number
  /** 躲避强度 0..1，0 表示完全不躲 */
  dodge: number
  /** 躲避触发半径 = 按钮半径 × 该倍数 */
  dodgeRadius: number
  /** 躲避一阶滞后（秒），越大越迟钝、越容易被点中 */
  dodgeLag: number
  /** 湍流强度 0..1 */
  jitter: number
}

export interface AudioProfile {
  ambient: AmbientKey
  /** 雨声底噪 0..1 */
  rainGain: number
  /** 风声 0..1 */
  windGain: number
  /** 低频 drone 0..1 */
  droneGain: number
  /** 冰雹敲击：每秒次数 */
  hailPerSecond: number
  /** 雷击频率：每分钟次数（仅影响音效，视觉由 effects.lightningPerSecond 控制） */
  thunderPerMinute: number
  /** 该阶段雷声是否可闻（阴天为远景无声闪电） */
  thunderAudible: boolean
  /** 是否播放龙卷风警报 */
  siren: boolean
  /** 点击音的"乐器" */
  click: ClickVoice
}

/** 全部视觉特效强度，0..1（少数为每秒次数/倍数）。 */
export interface EffectProfile {
  sun: number
  cloud: number
  cloudLayers: number
  dust: number
  leaves: number
  rain: number
  rainLength: number
  ripples: number
  waterDrops: number
  hail: number
  debris: number
  /** 每秒闪电次数 */
  lightningPerSecond: number
  vortex: number
  streaks: number
  /** 屏幕震动强度 0..1 */
  shake: number
  /** 频闪强度 0..1 */
  strobe: number
  /** 整体压暗 0..1 */
  contrast: number
  /** 热浪扭曲 0..1 */
  heat: number
}

export interface StageDef {
  index: number
  key: StageKey
  /** 阶段名，顺序必须为：晴天 → 多云 → 阴天 → 雨 → 暴雨 → 强对流 */
  name: string
  /** 阶段标语 */
  tagline: string
  /** 按钮副标题（随风飘动时的挑衅文案） */
  hint: string
  /** 单次点击基础进度增益（阶段内 0..1 进度） */
  advanceGain: number
  /** 每秒自然回落速度 */
  decayPerSec: number
  /** 点击后的衰减豁免时长（毫秒） */
  graceMs: number
  palette: StagePalette
  wind: WindProfile
  audio: AudioProfile
  effects: EffectProfile
  /** 祈祷词候选，点击时随机取一条 */
  prayers: readonly string[]
}

export interface GameState {
  /** 当前阶段下标 0..5，永不下降 */
  stageIndex: number
  /** 当前阶段内进度 0..1，会缓慢回落但不会低于 0 */
  stageProgress: number
  /** 连击计数 */
  combo: number
  maxCombo: number
  totalClicks: number
  /** 诚心值（累计进度） */
  totalPrayers: number
  /** 是否已把强对流推满 */
  completed: boolean
  /** 内部单调时钟（毫秒），由 tick 累加，测试可控 */
  clockMs: number
  lastClickAt: number
  graceUntil: number
  stageEnteredAt: number
  runStartedAt: number
}

export interface Prefs {
  muted: boolean
  volume: number
  easyMode: boolean
  reduceFx: boolean
  hintSeen: boolean
}

export interface BestRecord {
  bestStage: number
  bestCombo: number
  completions: number
}

export interface ClickOutcome {
  gained: number
  multiplier: number
  combo: number
  advanced: boolean
  completed: boolean
}

export type FeedKind = 'stage' | 'combo' | 'info' | 'warn'

export interface FeedItem {
  id: number
  kind: FeedKind
  text: string
  at: number
}

export interface ClickEvent {
  gained: number
  multiplier: number
  combo: number
  x: number
  y: number
  stageIndex: number
  prayer: string
}

export interface AdvanceEvent {
  from: number
  to: number
  stage: StageDef
}

export interface CompleteEvent {
  totalMs: number
}

export interface MissEvent {
  x: number
  y: number
  misses: number
}

export interface LightningEvent {
  x: number
  y: number
  /** 0..1，越远越弱 */
  intensity: number
  /** 归一化距离 0..1，用于计算雷声延迟 */
  distance: number
}

export interface GameEvents {
  click: ClickEvent
  advance: AdvanceEvent
  complete: CompleteEvent
  miss: MissEvent
  reset: undefined
  lightning: LightningEvent
}
