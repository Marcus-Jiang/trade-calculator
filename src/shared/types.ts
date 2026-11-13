/** 主进程与渲染进程共享的类型定义。 */

import type { Language } from './i18n'

export const DEFAULT_SHORTCUT = 'Alt+`'

/** auto 跟随系统；white 为纯白主题；dark 为深色主题 */
export type Theme = 'auto' | 'white' | 'dark'

export type CurrencyTriple = [string, string, string]

/** 物理像素坐标，与上面的逻辑坐标一起保存，用于混合 DPI 精确恢复。 */
export interface PhysicalBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
  /** 物理像素位置与尺寸：解决混合 DPI 多显示器下逻辑坐标重叠的问题 */
  physical?: PhysicalBounds
}

export interface Settings {
  /** 界面语言：auto 跟随系统，也可固定为中文或日语 */
  language: Language
  /** 界面主题：auto 跟随系统，white 白色主题，dark 深色主题 */
  theme: Theme
  /** 同时展示的三种币种，顺序即界面顺序 */
  currencies: CurrencyTriple
  /** 主输入币种，填写含税成本所用币种，一定包含在 currencies 中 */
  currency: string
  /** 成本单价（主输入币种），按 costIncludesTax 解释为含税价或未税价 */
  costPrice: string
  /** costPrice 是否为含税价；false 表示填写的是未税成本 */
  costIncludesTax: boolean
  quantity: string
  /** 增值税率，百分比数值，例如 13 表示 13% */
  taxRate: number
  /** 出口退税率，百分比数值，例如 13 表示 13% */
  rebateRate: number
  /** 利润面板是否展开 */
  profitOpen: boolean
  /** 成本加价百分比，例如 15 表示售价 = 含税成本 × 115% */
  markupRate: number
  /** 按币种记录的手动汇率（1 单位外币 = N 本位币），存在即优先于自动汇率 */
  manualRates: Record<string, number>
  /** 本位币：汇率展示与手动汇率的参照货币，缺省为人民币 */
  baseCurrency: string
  /** 汇率面板是否展开 */
  ratesOpen: boolean
  decimals: number
  /** 自动刷新间隔（小时），0 表示关闭 */
  autoRefreshHours: number
  alwaysOnTop: boolean
  autoLaunch: boolean
  shortcut: string
  trayHintShown: boolean
  bounds: WindowBounds | null
}

/** 汇率为人民币基准：1 CNY = rates[code] 单位外币 */
export interface RatesData {
  base: 'CNY'
  rates: Record<string, number>
  provider: string
  updatedAt: number
  stale: boolean
}

export interface AppMeta {
  version: string
  isPackaged: boolean
  /** 操作系统语言，例如 zh-CN、ja-JP；language 为 auto 时据此决定界面语言 */
  systemLocale: string
  /** 启动时全局快捷键是否注册成功；失败时设置页会提示 */
  shortcutRegistered: boolean
  /** 运行平台：windows / macos / linux */
  platform: string
}

export interface SettingsPayload {
  settings: Settings
  meta: AppMeta
}

export interface PatchResult {
  ok: boolean
  error?: string
  settings: Settings
}

export interface RefreshResult {
  ok: boolean
  data: RatesData | null
  error?: string
}

export interface TradeCalcApi {
  getSettings(): Promise<SettingsPayload>
  patchSettings(patch: Partial<Settings>): Promise<PatchResult>
  getRates(): Promise<RatesData | null>
  refreshRates(): Promise<RefreshResult>
  minimize(): Promise<void>
  hideToTray(): Promise<void>
  quit(): Promise<void>
  copyText(text: string): Promise<void>
  /** 录制快捷键时临时释放全局热键，避免按下当前热键把窗口隐藏 */
  setShortcutCapture(active: boolean): Promise<void>
  onSettingsChanged(cb: (settings: Settings) => void): () => void
  onRatesChanged(cb: (data: RatesData) => void): () => void
  /** 防抖写盘失败时通知界面（例如磁盘只读、文件被占用） */
  onSettingsSaveError(cb: () => void): () => void
}
