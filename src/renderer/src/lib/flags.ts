import AU from 'country-flag-icons/string/3x2/AU'
import CA from 'country-flag-icons/string/3x2/CA'
import CH from 'country-flag-icons/string/3x2/CH'
import CN from 'country-flag-icons/string/3x2/CN'
import EU from 'country-flag-icons/string/3x2/EU'
import GB from 'country-flag-icons/string/3x2/GB'
import HK from 'country-flag-icons/string/3x2/HK'
import JP from 'country-flag-icons/string/3x2/JP'
import SG from 'country-flag-icons/string/3x2/SG'
import US from 'country-flag-icons/string/3x2/US'

function dataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** 常用贸易币种对应的国旗（data URI，离线可用） */
export const CURRENCY_FLAGS: Record<string, string> = {
  AUD: dataUri(AU),
  CAD: dataUri(CA),
  CHF: dataUri(CH),
  CNY: dataUri(CN),
  EUR: dataUri(EU),
  GBP: dataUri(GB),
  HKD: dataUri(HK),
  JPY: dataUri(JP),
  SGD: dataUri(SG),
  USD: dataUri(US)
}
