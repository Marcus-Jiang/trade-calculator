import type { RatesData } from '@shared/types'

export interface TaxBreakdown {
  net: number | null
  tax: number | null
  gross: number | null
}

/** 单个币种下的含税成本单价与总价 */
export interface CurrencyRow {
  code: string
  /** 1 单位该币种 = 多少本位币 */
  rate: number | null
  unit: number | null
  total: number | null
}

export interface ResultRow extends CurrencyRow {
  /** 未税成本单价 */
  netUnit: number | null
  /** 未税成本总价 */
  netTotal: number | null
  /** 成本中已包含的税额 */
  tax: number | null
  /** 含税报价单价 */
  quoteUnit: number | null
  /** 含税报价总价 */
  quoteTotal: number | null
}

/** 按税率拆分含税 / 未税金额，ratePercent 为百分数（13 表示 13%） */
export function taxBreakdown(
  amount: number | null,
  ratePercent: number,
  includesTax: boolean
): TaxBreakdown {
  if (amount === null || !Number.isFinite(amount)) {
    return { net: null, tax: null, gross: null }
  }
  const rate = Math.max(0, ratePercent) / 100
  const net = includesTax ? amount / (1 + rate) : amount
  const gross = includesTax ? amount : amount * (1 + rate)
  return { net, tax: gross - net, gross }
}

/**
 * 把填写的成本换算成含税成本：includesTax 为 true 时原样返回，
 * 否则按税率加成（未税 → 含税）。
 */
export function toGross(
  amount: number | null,
  ratePercent: number,
  includesTax: boolean
): number | null {
  return taxBreakdown(amount, ratePercent, includesTax).gross
}

/**
 * 1 单位指定币种折合多少本位币。手动汇率以本位币计价（1 单位该币种 = N 本位币），
 * 本位币自身恒为 1。自动汇率以人民币为基准，换算时用交叉汇率。
 */
export function basePerUnit(
  rates: RatesData | null,
  code: string,
  manualRates: Record<string, number>,
  base: string
): number | null {
  if (code === base) return 1
  const manual = manualRates[code]
  if (manual && manual > 0) return manual
  const perBase = rates?.rates[base]
  const perCode = rates?.rates[code]
  if (!perBase || !perCode || perBase <= 0 || perCode <= 0) return null
  return perBase / perCode
}

/** 根据主输入币种的含税成本，推导三种币种下的成本单价与总价 */
export function buildCurrencyRows(
  currencies: readonly string[],
  primary: string,
  primaryUnit: number | null,
  quantity: number | null,
  rates: RatesData | null,
  manualRates: Record<string, number>,
  base: string
): CurrencyRow[] {
  const primaryRate = basePerUnit(rates, primary, manualRates, base)
  return currencies.map((code) => {
    const rate = basePerUnit(rates, code, manualRates, base)
    let unit: number | null
    if (code === primary) {
      unit = primaryUnit
    } else if (primaryUnit !== null && primaryRate !== null && rate !== null) {
      unit = (primaryUnit * primaryRate) / rate
    } else {
      unit = null
    }
    const total = unit !== null && quantity !== null ? unit * quantity : null
    return { code, rate, unit, total }
  })
}

/** 成本加价：售价 = 成本 × (1 + 百分比 / 100) */
export function sellingPrice(cost: number | null, markupPercent: number): number | null {
  if (cost === null || !Number.isFinite(cost) || cost < 0) return null
  const rate = Number.isFinite(markupPercent) ? Math.max(0, markupPercent) : 0
  return cost * (1 + rate / 100)
}

/**
 * 根据含税成本行，生成三种币种的计算结果：
 * 未税成本单价 / 未税成本总价 / 税额 / 含税成本总价（即 row.total）/ 含税报价
 */
export function buildResultRows(
  rows: CurrencyRow[],
  taxRate: number,
  markupRate: number
): ResultRow[] {
  return rows.map((row) => {
    const unitTax = taxBreakdown(row.unit, taxRate, true)
    const totalTax = taxBreakdown(row.total, taxRate, true)
    return {
      ...row,
      netUnit: unitTax.net,
      netTotal: totalTax.net,
      tax: totalTax.tax,
      quoteUnit: sellingPrice(row.unit, markupRate),
      quoteTotal: sellingPrice(row.total, markupRate)
    }
  })
}

export interface ProfitRow {
  code: string
  /** 直接利润：含税报价总价 − 含税成本总价 */
  direct: number | null
  /** 退税利润：未税成本总价 × 退税率 */
  rebate: number | null
  /** 直接利润 + 退税利润 */
  total: number | null
}

/** 按退税率计算三种币种下的直接利润、退税利润与合计 */
export function buildProfitRows(rows: ResultRow[], rebateRate: number): ProfitRow[] {
  const rate = Number.isFinite(rebateRate) ? Math.max(0, rebateRate) / 100 : 0
  return rows.map((row) => {
    const direct =
      row.quoteTotal !== null && row.total !== null ? row.quoteTotal - row.total : null
    const rebate = row.netTotal !== null ? row.netTotal * rate : null
    return {
      code: row.code,
      direct,
      rebate,
      total: direct !== null && rebate !== null ? direct + rebate : null
    }
  })
}

export function convertAmount(
  amount: number | null,
  cnyPerFrom: number | null,
  cnyPerTo: number | null
): number | null {
  if (amount === null || !cnyPerFrom || !cnyPerTo) return null
  return (amount * cnyPerFrom) / cnyPerTo
}

/** 主输入币种变化时换算成本单价；缺少任一币种汇率时返回 null，由调用方阻止切换 */
export function convertCostPrice(
  amount: number | null,
  fromCode: string,
  toCode: string,
  rates: RatesData | null,
  manualRates: Record<string, number>,
  base: string
): number | null {
  return convertAmount(
    amount,
    basePerUnit(rates, fromCode, manualRates, base),
    basePerUnit(rates, toCode, manualRates, base)
  )
}

/** 1 单位指定币种折合多少人民币（仅用于本位币之间的换算） */
function unitsPerCny(rates: RatesData | null, code: string): number | null {
  if (code === 'CNY') return 1
  const perCny = rates?.rates[code]
  return perCny && perCny > 0 ? perCny : null
}

/**
 * 切换本位币时把手动汇率换算到新本位币。
 * 优先使用用户为「新本位币」填写的汇率，否则用自动汇率算交叉值；
 * 都没有时返回 null，由调用方提示并阻止切换。没有手动汇率时无需换算。
 */
export function convertManualRates(
  manualRates: Record<string, number>,
  fromBase: string,
  toBase: string,
  rates: RatesData | null
): Record<string, number> | null {
  if (fromBase === toBase) return { ...manualRates }
  const entries = Object.entries(manualRates).filter(
    ([code, value]) => code !== toBase && value > 0
  )
  if (entries.length === 0) return {}

  let factor: number | null = null
  const manualTo = manualRates[toBase]
  if (manualTo && manualTo > 0) {
    // 新本位币已有手动汇率：1 新本位币 = manualTo 旧本位币
    factor = 1 / manualTo
  } else {
    const fromPerCny = unitsPerCny(rates, fromBase)
    const toPerCny = unitsPerCny(rates, toBase)
    if (fromPerCny !== null && toPerCny !== null) factor = toPerCny / fromPerCny
  }
  if (factor === null) return null

  const result: Record<string, number> = {}
  for (const [code, value] of entries) {
    // 保留 6 位小数，避免换算后出现 177.87085500000002 这样的浮点尾巴
    result[code] = Math.round((value * factor + Number.EPSILON) * 1e6) / 1e6
  }
  return result
}
