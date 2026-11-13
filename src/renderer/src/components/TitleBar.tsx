import type { JSX } from 'react'
import { useI18n } from '../i18n'
import { CloseIcon, MinusIcon, PinIcon, SlidersIcon } from './Icons'

interface TitleBarProps {
  alwaysOnTop: boolean
  onTogglePin: () => void
  onOpenSettings: () => void
  onMinimize: () => void
  onHide: () => void
}

export function TitleBar({
  alwaysOnTop,
  onTogglePin,
  onOpenSettings,
  onMinimize,
  onHide
}: TitleBarProps): JSX.Element {
  const { t } = useI18n()
  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="brand" data-tauri-drag-region>
        <span className="brand-mark" data-tauri-drag-region>
          ¥
        </span>
        <span className="brand-name" data-tauri-drag-region>
          {t('app.name')}
        </span>
      </div>
      <div className="win-actions">
        <button
          type="button"
          className={`icon-btn ${alwaysOnTop ? 'active' : ''}`}
          onClick={onTogglePin}
          title={alwaysOnTop ? t('window.unpin') : t('window.pin')}
          aria-label={alwaysOnTop ? t('window.unpinAria') : t('window.pinAria')}
        >
          <PinIcon />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={onOpenSettings}
          title={t('window.settings')}
          aria-label={t('window.settingsAria')}
        >
          <SlidersIcon />
        </button>
        <span className="win-sep" />
        <button
          type="button"
          className="icon-btn"
          onClick={onMinimize}
          title={t('window.minimize')}
          aria-label={t('window.minimize')}
        >
          <MinusIcon />
        </button>
        <button
          type="button"
          className="icon-btn danger"
          onClick={onHide}
          title={t('window.hideToTray')}
          aria-label={t('window.hideToTray')}
        >
          <CloseIcon />
        </button>
      </div>
    </header>
  )
}
