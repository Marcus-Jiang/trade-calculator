import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type {
  PatchResult,
  RatesData,
  RefreshResult,
  Settings,
  SettingsPayload,
  TradeCalcApi
} from '@shared/types'

function subscribe<T>(event: string, callback: (payload: T) => void): () => void {
  let disposed = false
  let unlisten: (() => void) | null = null
  void listen<T>(event, (received) => callback(received.payload))
    .then((fn) => {
      if (disposed) fn()
      else unlisten = fn
    })
    .catch(() => {
      // 订阅失败不应产生未处理的 Promise 拒绝；界面仍可通过 invoke 正常工作
    })
  return () => {
    disposed = true
    unlisten?.()
    unlisten = null
  }
}

const tauriApi: TradeCalcApi = {
  getSettings: () => invoke<SettingsPayload>('settings_get'),
  patchSettings: (patch) => invoke<PatchResult>('settings_patch', { patch }),
  getRates: () => invoke<RatesData | null>('rates_get'),
  refreshRates: () => invoke<RefreshResult>('rates_refresh'),
  minimize: () => invoke('window_minimize'),
  hideToTray: () => invoke('window_hide'),
  quit: () => invoke('window_quit'),
  copyText: (text) => invoke('clipboard_copy', { text }),
  setShortcutCapture: (active) => invoke('shortcut_capture', { active }),
  onSettingsChanged: (callback) => subscribe<Settings>('settings:changed', callback),
  onRatesChanged: (callback) => subscribe<RatesData>('rates:changed', callback),
  onSettingsSaveError: (callback) => subscribe<null>('settings:save-error', () => callback())
}

if (!isTauri()) {
  throw new Error('缺少 Tauri 运行环境桥接')
}

/** 渲染层统一使用该对象，不直接依赖 Tauri 内部实现 */
export const api: TradeCalcApi = tauriApi
