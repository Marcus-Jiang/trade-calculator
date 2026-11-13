import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { Language } from '@shared/i18n'
import type { AppMeta, RatesData, Settings, Theme } from '@shared/types'
import { DEFAULT_SHORTCUT } from '@shared/types'
import { useI18n } from '../i18n'
import { api } from '../lib/api'
import { acceleratorFromEvent, displayAccelerator } from '../lib/accel'
import { CURRENCIES, currencyName } from '../lib/currency'
import { formatTime } from '../lib/format'
import { CloseIcon, RefreshIcon } from './Icons'
import { Switch } from './Switch'

const DECIMAL_OPTIONS = [2, 3, 4]
const REFRESH_OPTIONS = [0, 1, 3, 6, 12, 24]

/** 保留已保存但不在预设里的值，避免下拉框显示成别的选项 */
function optionsWithCurrent(options: number[], current: number): number[] {
  return options.includes(current) ? options : [...options, current].sort((a, b) => a - b)
}

interface SettingsModalProps {
  settings: Settings
  meta: AppMeta | null
  rates: RatesData | null
  rateError: string | null
  refreshing: boolean
  onClose: () => void
  onPatch: (patch: Partial<Settings>) => void
  onChangeBase: (code: string) => void
  onRefresh: () => void
  onQuit: () => void
}

export function SettingsModal({
  settings,
  meta,
  rates,
  rateError,
  refreshing,
  onClose,
  onPatch,
  onChangeBase,
  onRefresh,
  onQuit
}: SettingsModalProps): JSX.Element {
  const { t, locale } = useI18n()
  const [recording, setRecording] = useState(false)
  const [hotkeyError, setHotkeyError] = useState<string | null>(null)
  const [shortcutActive, setShortcutActive] = useState(meta?.shortcutRegistered ?? true)
  const decimalOptions = optionsWithCurrent(DECIMAL_OPTIONS, settings.decimals)
  const refreshOptions = optionsWithCurrent(REFRESH_OPTIONS, settings.autoRefreshHours)
  const baseOptions = CURRENCIES.includes(settings.baseCurrency)
    ? CURRENCIES
    : [settings.baseCurrency, ...CURRENCIES]

  useEffect(() => {
    if (!recording) return
    void api.setShortcutCapture(true)
    const handler = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape') {
        setRecording(false)
        return
      }
      const accelerator = acceleratorFromEvent(event, meta?.platform)
      if (!accelerator) return
      setRecording(false)
      void api
        .patchSettings({ shortcut: accelerator })
        .then((result) => {
          setHotkeyError(result.ok ? null : (result.error ?? t('error.shortcutFormat')))
          if (result.ok) setShortcutActive(true)
        })
        .catch(() => {
          setHotkeyError(t('error.settingsSave'))
        })
    }
    window.addEventListener('keydown', handler, true)
    return () => {
      window.removeEventListener('keydown', handler, true)
      void api.setShortcutCapture(false)
    }
  }, [recording, t, meta?.platform])

  useEffect(() => {
    if (meta) setShortcutActive(meta.shortcutRegistered)
  }, [meta])

  useEffect(() => {
    const handler = (): void => {
      if (document.hidden) setRecording(false)
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !recording) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, recording])

  const restoreDefaultShortcut = (): void => {
    setHotkeyError(null)
    void api
      .patchSettings({ shortcut: DEFAULT_SHORTCUT })
      .then((result) => {
        setHotkeyError(result.ok ? null : (result.error ?? t('error.shortcutFormat')))
        if (result.ok) setShortcutActive(true)
      })
      .catch(() => {
        setHotkeyError(t('error.settingsSave'))
      })
  }

  const updatedAt = rates ? t('rates.status', {
    provider: rates.provider,
    time: formatTime(rates.updatedAt, locale)
  }) : ''
  const rateStatus = rates
    ? `${updatedAt}${rates.stale ? t('settings.rateCachedSuffix') : ''}`
    : rateError
      ? t('settings.rateStatusFailed')
      : t('settings.rateStatusEmpty')

  return (
    <div className="modal-backdrop" onMouseDown={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('settings.title')}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{t('settings.title')}</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label={t('settings.close')}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="modal-body">
          <div className="setting">
            <div className="setting-main">
              <div className="setting-title">{t('settings.language')}</div>
              <div className="setting-desc">{t('settings.languageDesc')}</div>
            </div>
            <select
              className="select"
              value={settings.language}
              onChange={(event) => onPatch({ language: event.target.value as Language })}
              aria-label={t('settings.languageAria')}
            >
              <option value="auto">{t('settings.languageAuto')}</option>
              <option value="zh">中文</option>
              <option value="ja">日本語</option>
            </select>
          </div>

          <div className="setting">
            <div className="setting-main">
              <div className="setting-title">{t('settings.theme')}</div>
              <div className="setting-desc">{t('settings.themeDesc')}</div>
            </div>
            <select
              className="select"
              value={settings.theme}
              onChange={(event) => onPatch({ theme: event.target.value as Theme })}
              aria-label={t('settings.themeAria')}
            >
              <option value="auto">{t('settings.themeAuto')}</option>
              <option value="white">{t('settings.themeWhite')}</option>
              <option value="dark">{t('settings.themeDark')}</option>
            </select>
          </div>

          <div className="setting">
            <div className="setting-main">
              <div className="setting-title">{t('settings.shortcut')}</div>
              <div className="setting-desc">
                {t(
                  meta?.platform === 'macos'
                    ? 'settings.shortcutDescMac'
                    : 'settings.shortcutDesc'
                )}
              </div>
              {(hotkeyError || (!shortcutActive && !recording)) && (
                <div className="error-text">{hotkeyError ?? t('error.shortcutTaken')}</div>
              )}
            </div>
            <div className="hotkey-group">
              <button
                type="button"
                className={`hotkey-btn ${recording ? 'recording' : ''}`}
                onClick={() => {
                  setHotkeyError(null)
                  setRecording((value) => !value)
                }}
              >
                {recording
                  ? t('settings.recording')
                  : displayAccelerator(settings.shortcut, meta?.platform)}
              </button>
              {settings.shortcut !== DEFAULT_SHORTCUT && (
                <button type="button" className="link-btn" onClick={restoreDefaultShortcut}>
                  {t('settings.restoreDefault')}
                </button>
              )}
            </div>
          </div>

          <div className="setting">
            <div className="setting-main">
              <div className="setting-title">{t('settings.alwaysOnTop')}</div>
              <div className="setting-desc">{t('settings.alwaysOnTopDesc')}</div>
            </div>
            <Switch
              checked={settings.alwaysOnTop}
              onChange={(value) => onPatch({ alwaysOnTop: value })}
              label={t('settings.alwaysOnTop')}
            />
          </div>

          <div className="setting">
            <div className="setting-main">
              <div className="setting-title">{t('settings.autoLaunch')}</div>
              <div className="setting-desc">
                {meta?.isPackaged
                  ? t('settings.autoLaunchDesc')
                  : t('settings.autoLaunchDev')}
              </div>
            </div>
            <Switch
              checked={settings.autoLaunch}
              onChange={(value) => onPatch({ autoLaunch: value })}
              label={t('settings.autoLaunch')}
            />
          </div>

          <div className="setting">
            <div className="setting-main">
              <div className="setting-title">{t('settings.autoRefresh')}</div>
              <div className="setting-desc">{t('settings.autoRefreshDesc')}</div>
            </div>
            <select
              className="select"
              value={String(settings.autoRefreshHours)}
              onChange={(event) => onPatch({ autoRefreshHours: Number(event.target.value) })}
              aria-label={t('settings.autoRefreshAria')}
            >
              {refreshOptions.map((hours) => (
                <option key={hours} value={hours}>
                  {hours === 0
                    ? t('settings.off')
                    : hours === 24
                      ? t('settings.daily')
                      : t('settings.everyHours', { hours })}
                </option>
              ))}
            </select>
          </div>

          <div className="setting">
            <div className="setting-main">
              <div className="setting-title">{t('settings.decimals')}</div>
              <div className="setting-desc">{t('settings.decimalsDesc')}</div>
            </div>
            <select
              className="select"
              value={String(settings.decimals)}
              onChange={(event) => onPatch({ decimals: Number(event.target.value) })}
              aria-label={t('settings.decimalsAria')}
            >
              {decimalOptions.map((decimals) => (
                <option key={decimals} value={decimals}>
                  {t('settings.decimalsOption', { decimals })}
                </option>
              ))}
            </select>
          </div>

          <div className="setting">
            <div className="setting-main">
              <div className="setting-title">{t('settings.baseCurrency')}</div>
              <div className="setting-desc">{t('settings.baseCurrencyDesc')}</div>
            </div>
            <select
              className="select base-select"
              value={settings.baseCurrency}
              onChange={(event) => onChangeBase(event.target.value)}
              aria-label={t('settings.baseCurrencyAria')}
            >
              {baseOptions.map((code) => (
                <option key={code} value={code}>
                  {code} · {currencyName(locale, code)}
                </option>
              ))}
            </select>
          </div>

          <div className="setting">
            <div className="setting-main">
              <div className="setting-title">{t('settings.rateData')}</div>
              <div className={`setting-desc ${rates?.stale ? 'warn-text' : ''}`}>{rateStatus}</div>
            </div>
            <button type="button" className="btn btn-sm" onClick={onRefresh} disabled={refreshing}>
              <RefreshIcon className={refreshing ? 'spin' : ''} />
              {t('settings.refresh')}
            </button>
          </div>
        </div>

        <div className="modal-foot">
          <span>{t('settings.foot', { version: meta?.version ?? '1.0.0' })}</span>
          <button type="button" className="link-btn danger-text" onClick={onQuit}>
            {t('settings.quit')}
          </button>
        </div>
      </div>
    </div>
  )
}
