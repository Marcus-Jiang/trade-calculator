import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { MessageKey, MessageParams } from '@shared/i18n'
import { resolveLocale, translate } from '@shared/i18n'
import type { AppMeta, CurrencyTriple, RatesData, Settings } from '@shared/types'
import { ProfitCard } from './components/ProfitCard'
import { QuoteCard } from './components/QuoteCard'
import { RatesCard } from './components/RatesCard'
import { ResultCard } from './components/ResultCard'
import { SettingsModal } from './components/SettingsModal'
import { TitleBar } from './components/TitleBar'
import { I18nProvider } from './i18n'
import { api } from './lib/api'
import {
  buildCurrencyRows,
  buildProfitRows,
  buildResultRows,
  convertCostPrice,
  convertManualRates,
  toGross
} from './lib/calc'
import { cleanAmountInput, formatInput, parseAmount } from './lib/format'

export default function App(): JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [meta, setMeta] = useState<AppMeta | null>(null)
  const [rates, setRates] = useState<RatesData | null>(null)
  const [rateError, setRateError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)
  const initialRefresh = useRef(false)
  const shortcutWarned = useRef(false)

  // 显式选择的语言优先；auto 时按系统语言（日语系统自动显示日语）
  const locale = resolveLocale(
    settings?.language ?? 'auto',
    meta?.systemLocale ?? navigator.language
  )
  const t = useCallback(
    (key: MessageKey, params?: MessageParams): string => translate(locale, key, params),
    [locale]
  )

  useEffect(() => {
    document.documentElement.lang = locale === 'ja' ? 'ja' : 'zh-CN'
    document.title = translate(locale, 'app.name')
  }, [locale])

  useEffect(() => {
    document.documentElement.dataset.theme = settings?.theme ?? 'auto'
  }, [settings?.theme])

  const toast = useCallback((message: string) => {
    setToastMessage(message)
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToastMessage(null), 1600)
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    }
  }, [])

  useEffect(() => {
    return api.onSettingsSaveError(() => toast(t('error.settingsSave')))
  }, [toast, t])

  // 启动时快捷键被占用不要静默：提示一次，设置页和托盘菜单也会显示不可用
  useEffect(() => {
    if (meta && !meta.shortcutRegistered && !shortcutWarned.current) {
      shortcutWarned.current = true
      toast(t('error.shortcutTaken'))
    }
  }, [meta, toast, t])

  useEffect(() => {
    let alive = true

    void api
      .getSettings()
      .then((payload) => {
        if (!alive) return
        setSettings(payload.settings)
        setMeta(payload.meta)
      })
      .catch(() => {
        if (alive) setLoadError(true)
      })
    void api
      .getRates()
      .then((data) => {
        if (alive && data) setRates(data)
      })
      .catch(() => {
        // 汇率加载失败不阻塞界面；下面的首次刷新会再试一次并显示错误
      })

    const offSettings = api.onSettingsChanged((next) => setSettings(next))
    const offRates = api.onRatesChanged((data) => {
      setRates(data)
      // 失败时后端也会回传缓存数据（stale=true），不能因此清掉具体错误
      if (!data.stale) setRateError(null)
    })

    return () => {
      alive = false
      offSettings()
      offRates()
    }
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    setRefreshing(true)
    try {
      const result = await api.refreshRates()
      if (result.data) setRates(result.data)
      setRateError(result.ok ? null : (result.error ?? t('rates.fetchFailed')))
    } catch {
      setRateError(t('rates.fetchFailed'))
    } finally {
      setRefreshing(false)
    }
  }, [t])

  useEffect(() => {
    if (!settings || rates || initialRefresh.current) return
    initialRefresh.current = true
    void refresh()
  }, [settings, rates, refresh])

  const patch = useCallback(
    (partial: Partial<Settings>) => {
      setSettings((previous) => {
        if (!previous) return previous
        return {
          ...previous,
          ...partial,
          manualRates: partial.manualRates ?? previous.manualRates
        }
      })
      void api
        .patchSettings(partial)
        .then((result) => {
          if (!result.ok) {
            toast(result.error ?? t('error.settingsSave'))
            setSettings(result.settings)
          }
        })
        .catch(() => {
          toast(t('error.settingsSave'))
          // 重新从后端拉取，避免本地乐观状态与磁盘上的设置长期不一致
          void api
            .getSettings()
            .then((payload) => setSettings(payload.settings))
            .catch(() => {})
        })
    },
    [toast, t]
  )

  /** 修改任一币种的成本单价时，把该币种设为主输入币种；includesTax 标记填的是含税价还是未税价 */
  const editCost = useCallback(
    (code: string, raw: string, includesTax: boolean) => {
      patch({ currency: code, costPrice: cleanAmountInput(raw), costIncludesTax: includesTax })
    },
    [patch]
  )

  const changeCurrencyAt = useCallback(
    (index: number, code: string) => {
      if (!settings) return
      const currencies = [...settings.currencies] as CurrencyTriple
      if (currencies[index] === code) return

      const duplicate = currencies.indexOf(code)
      if (duplicate !== -1) {
        // 已存在于其他位置：交换两个币种，避免重复
        ;[currencies[index], currencies[duplicate]] = [currencies[duplicate], currencies[index]]
        patch({ currencies })
        return
      }

      if (currencies[index] === settings.currency) {
        // 修改的是主输入币种：换算成本后再切换；缺汇率时不能把原数值重解释成新币种
        const value = parseAmount(settings.costPrice)
        let costPrice = settings.costPrice
        if (value !== null) {
          const converted = convertCostPrice(
            value,
            settings.currency,
            code,
            rates,
            settings.manualRates,
            settings.baseCurrency
          )
          if (converted === null) {
            toast(t('error.missingRate', { from: settings.currency, to: code }))
            return
          }
          costPrice = formatInput(converted, 6)
        }
        currencies[index] = code
        patch({ currencies, currency: code, costPrice })
        return
      }

      currencies[index] = code
      patch({ currencies })
    },
    [settings, rates, patch, toast, t]
  )

  const openSettings = useCallback(() => {
    setSettingsOpen(true)
    // 重新读取 meta，保证快捷键是否注册成功等状态是最新的
    void api
      .getSettings()
      .then((payload) => {
        setMeta(payload.meta)
        setSettings(payload.settings)
      })
      .catch(() => {})
  }, [])

  /** 切换本位币：把手动汇率换算到新本位币后再保存，避免数值含义被悄悄改变 */
  const changeBaseCurrency = useCallback(
    (code: string) => {
      if (!settings || settings.baseCurrency === code) return
      const manualRates = convertManualRates(
        settings.manualRates,
        settings.baseCurrency,
        code,
        rates
      )
      if (manualRates === null) {
        toast(
          t('error.missingBaseRate', {
            from: settings.baseCurrency,
            to: code
          })
        )
        return
      }
      patch({ baseCurrency: code, manualRates })
    },
    [settings, rates, patch, toast, t]
  )

  /** 主输入币种的含税成本：未税输入会先按税率加成，其余计算都以含税成本为基准 */
  const primaryGross = useMemo(() => {
    if (!settings) return null
    return toGross(parseAmount(settings.costPrice), settings.taxRate, settings.costIncludesTax)
  }, [settings])

  const costRows = useMemo(() => {
    if (!settings) return []
    return buildCurrencyRows(
      settings.currencies,
      settings.currency,
      primaryGross,
      parseAmount(settings.quantity),
      rates,
      settings.manualRates,
      settings.baseCurrency
    )
  }, [settings, rates, primaryGross])

  const resultRows = useMemo(() => {
    if (!settings) return []
    return buildResultRows(costRows, settings.taxRate, settings.markupRate)
  }, [costRows, settings])

  const profitRows = useMemo(() => {
    if (!settings) return []
    return buildProfitRows(resultRows, settings.rebateRate)
  }, [resultRows, settings])

  if (!settings) {
    return (
      <I18nProvider locale={locale}>
        <div className="app loading">
          {loadError ? (
            <div className="loading-error">
              <div>{t('error.loadFailed')}</div>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => window.location.reload()}
              >
                {t('action.retry')}
              </button>
            </div>
          ) : (
            t('app.loading')
          )}
        </div>
      </I18nProvider>
    )
  }

  return (
    <I18nProvider locale={locale}>
      <div className="app">
        <TitleBar
          alwaysOnTop={settings.alwaysOnTop}
          onTogglePin={() => patch({ alwaysOnTop: !settings.alwaysOnTop })}
          onOpenSettings={openSettings}
          onMinimize={() => void api.minimize()}
          onHide={() => void api.hideToTray()}
        />

        <main className="content">
          <QuoteCard
            settings={settings}
            rows={costRows}
            onEditCost={editCost}
            onChangeCurrency={changeCurrencyAt}
            onPatch={patch}
          />
          <ResultCard settings={settings} rows={resultRows} onToast={toast} />
          <ProfitCard settings={settings} rows={profitRows} onPatch={patch} />
          <RatesCard
            settings={settings}
            rates={rates}
            rateError={rateError}
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            onPatch={patch}
          />
        </main>

        {settingsOpen && (
          <SettingsModal
            settings={settings}
            meta={meta}
            rates={rates}
            rateError={rateError}
            refreshing={refreshing}
            onClose={() => setSettingsOpen(false)}
            onPatch={patch}
            onChangeBase={changeBaseCurrency}
            onRefresh={() => void refresh()}
            onQuit={() => void api.quit()}
          />
        )}

        {toastMessage && (
          <div className="toast" role="status" aria-live="polite" key={toastMessage}>
            {toastMessage}
          </div>
        )}
      </div>
    </I18nProvider>
  )
}
