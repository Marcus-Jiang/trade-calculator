import type { JSX } from 'react'
import { CURRENCY_FLAGS } from '../lib/flags'

interface CurrencyFlagProps {
  code: string
  small?: boolean
}

export function CurrencyFlag({ code, small = false }: CurrencyFlagProps): JSX.Element | null {
  const src = CURRENCY_FLAGS[code]
  if (!src) return null
  return (
    <img
      className={`flag ${small ? 'flag-sm' : ''}`}
      src={src}
      alt=""
      draggable={false}
    />
  )
}
