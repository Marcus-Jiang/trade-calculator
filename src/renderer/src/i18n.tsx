import { createContext, useContext, useMemo } from 'react'
import type { JSX, ReactNode } from 'react'
import type { Locale, MessageKey, MessageParams } from '@shared/i18n'
import { translate } from '@shared/i18n'

export interface I18n {
  locale: Locale
  t: (key: MessageKey, params?: MessageParams) => string
}

const I18nContext = createContext<I18n>({
  locale: 'zh',
  t: (key, params) => translate('zh', key, params)
})

interface I18nProviderProps {
  locale: Locale
  children: ReactNode
}

export function I18nProvider({ locale, children }: I18nProviderProps): JSX.Element {
  const value = useMemo<I18n>(
    () => ({ locale, t: (key, params) => translate(locale, key, params) }),
    [locale]
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  return useContext(I18nContext)
}
