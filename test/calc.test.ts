import { describe, expect, it } from 'vitest'
import {
  basePerUnit,
  buildCurrencyRows,
  buildProfitRows,
  buildResultRows,
  convertAmount,
  convertCostPrice,
  convertManualRates,
  sellingPrice,
  taxBreakdown,
  toGross
} from '../src/renderer/src/lib/calc'
import {
  cleanAmountInput,
  formatAmount,
  formatInput,
  formatNumber,
  formatRate,
  parseAmount,
  roundTo
} from '../src/renderer/src/lib/format'
import type { RatesData } from '../src/shared/types'

const rates: RatesData = {
  base: 'CNY',
  rates: { CNY: 1, USD: 0.14, EUR: 0.12, JPY: 23 },
  provider: 'test',
  updatedAt: Date.now(),
  stale: false
}

describe('taxBreakdown', () => {
  it('把含税金额拆成未税与税额', () => {
    const result = taxBreakdown(113, 13, true)
    expect(result.net).toBeCloseTo(100, 10)
    expect(result.tax).toBeCloseTo(13, 10)
    expect(result.gross).toBeCloseTo(113, 10)
  })

  it('把未税金额加成含税', () => {
    const result = taxBreakdown(100, 13, false)
    expect(result.net).toBeCloseTo(100, 10)
    expect(result.tax).toBeCloseTo(13, 10)
    expect(result.gross).toBeCloseTo(113, 10)
  })

  it('税率为 0 时三者一致', () => {
    const result = taxBreakdown(88.5, 0, true)
    expect(result.net).toBeCloseTo(88.5, 10)
    expect(result.tax).toBeCloseTo(0, 10)
    expect(result.gross).toBeCloseTo(88.5, 10)
  })

  it('空金额返回空结果', () => {
    expect(taxBreakdown(null, 13, false)).toEqual({ net: null, tax: null, gross: null })
  })
})

describe('toGross', () => {
  it('未税输入按税率加成含税成本', () => {
    expect(toGross(100, 13, false)).toBeCloseTo(113, 10)
  })

  it('含税输入保持原值', () => {
    expect(toGross(113, 13, true)).toBeCloseTo(113, 10)
  })

  it('税率为 0 时两者相同', () => {
    expect(toGross(88.5, 0, false)).toBeCloseTo(88.5, 10)
    expect(toGross(88.5, 0, true)).toBeCloseTo(88.5, 10)
  })

  it('空输入返回空', () => {
    expect(toGross(null, 13, false)).toBeNull()
  })
})

describe('basePerUnit', () => {
  it('自动汇率取倒数', () => {
    expect(basePerUnit(rates, 'USD', {}, 'CNY')).toBeCloseTo(1 / 0.14, 10)
  })

  it('手动汇率优先', () => {
    expect(basePerUnit(rates, 'USD', { USD: 7.5 }, 'CNY')).toBe(7.5)
  })

  it('手动汇率为空时回退自动汇率', () => {
    expect(basePerUnit(rates, 'USD', { EUR: 8 }, 'CNY')).toBeCloseTo(1 / 0.14, 10)
  })

  it('人民币恒为 1', () => {
    expect(basePerUnit(null, 'CNY', {}, 'CNY')).toBe(1)
  })

  it('缺少币种数据时返回 null', () => {
    expect(basePerUnit(rates, 'GBP', {}, 'CNY')).toBeNull()
  })

  it('本位币为日元时用交叉汇率，且本位币恒为 1', () => {
    expect(basePerUnit(rates, 'USD', {}, 'JPY')).toBeCloseTo(23 / 0.14, 10)
    expect(basePerUnit(rates, 'CNY', {}, 'JPY')).toBeCloseTo(23, 10)
    expect(basePerUnit(null, 'JPY', {}, 'JPY')).toBe(1)
  })

  it('手动汇率以本位币计价', () => {
    expect(basePerUnit(rates, 'USD', { USD: 150 }, 'JPY')).toBe(150)
  })

  it('缺少本位币汇率时交叉汇率返回 null', () => {
    const noJpy: RatesData = { ...rates, rates: { CNY: 1, USD: 0.14, EUR: 0.12 } }
    expect(basePerUnit(noJpy, 'USD', {}, 'JPY')).toBeNull()
    expect(basePerUnit(noJpy, 'JPY', {}, 'JPY')).toBe(1)
  })
})

describe('convertManualRates', () => {
  it('没有手动汇率时无需换算', () => {
    expect(convertManualRates({}, 'CNY', 'JPY', null)).toEqual({})
  })

  it('按自动汇率把手动汇率换算到新本位币', () => {
    expect(convertManualRates({ USD: 7.5 }, 'CNY', 'JPY', rates)).toEqual({ USD: 172.5 })
  })

  it('新本位币已有手动汇率时优先使用该汇率', () => {
    const converted = convertManualRates({ USD: 7.5, JPY: 0.05 }, 'CNY', 'JPY', null)
    expect(converted).toEqual({ USD: 150 })
  })

  it('缺少汇率时返回 null，由界面阻止切换', () => {
    const noJpy: RatesData = { ...rates, rates: { CNY: 1, USD: 0.14, EUR: 0.12 } }
    expect(convertManualRates({ USD: 7.5 }, 'CNY', 'JPY', noJpy)).toBeNull()
    expect(convertManualRates({ USD: 7.5 }, 'CNY', 'JPY', null)).toBeNull()
  })
})

describe('buildCurrencyRows', () => {
  it('以美元为主输入时同时得到三种币种单价与总价', () => {
    const rows = buildCurrencyRows(['USD', 'CNY', 'JPY'], 'USD', 12.5, 1000, rates, {}, 'CNY')
    expect(rows.map((row) => row.code)).toEqual(['USD', 'CNY', 'JPY'])
    expect(rows[0].unit).toBeCloseTo(12.5, 10)
    expect(rows[1].unit).toBeCloseTo((12.5 * (1 / 0.14)) / 1, 10)
    expect(rows[2].unit).toBeCloseTo((12.5 * (1 / 0.14)) / (1 / 23), 10)
    expect(rows[1].total).toBeCloseTo(((12.5 * (1 / 0.14)) / 1) * 1000, 8)
  })

  it('以人民币为主输入时换算成美元与日元', () => {
    const rows = buildCurrencyRows(['USD', 'CNY', 'JPY'], 'CNY', 100, 2, rates, {}, 'CNY')
    expect(rows[1].unit).toBeCloseTo(100, 10)
    expect(rows[0].unit).toBeCloseTo(100 * 0.14, 10)
    expect(rows[2].unit).toBeCloseTo(100 * 23, 10)
    expect(rows[0].total).toBeCloseTo(200 * 0.14, 8)
  })

  it('手动汇率参与换算', () => {
    const rows = buildCurrencyRows(['USD', 'CNY', 'JPY'], 'CNY', 100, 1, rates, { USD: 7.5 }, 'CNY')
    expect(rows[0].unit).toBeCloseTo(100 / 7.5, 10)
  })

  it('缺少某个币种汇率时该行单价与总价为空', () => {
    const withoutJpy: RatesData = { ...rates, rates: { CNY: 1, USD: 0.14, EUR: 0.12 } }
    const rows = buildCurrencyRows(['USD', 'CNY', 'JPY'], 'CNY', 100, 2, withoutJpy, {}, 'CNY')
    expect(rows[2].unit).toBeNull()
    expect(rows[2].total).toBeNull()
  })

  it('数量为空时仍展示单价', () => {
    const rows = buildCurrencyRows(['USD', 'CNY', 'JPY'], 'USD', 10, null, rates, {}, 'CNY')
    expect(rows[0].unit).toBe(10)
    expect(rows[0].total).toBeNull()
  })

  it('本位币为日元时按日元手动汇率换算', () => {
    const rows = buildCurrencyRows(
      ['USD', 'JPY', 'CNY'],
      'USD',
      1,
      1,
      rates,
      { USD: 150 },
      'JPY'
    )
    expect(rows[0].unit).toBe(1)
    expect(rows[1].unit).toBe(150)
    expect(rows[2].unit).toBeCloseTo(150 / 23, 10)
  })

  it('仅切换本位币不改变成本换算结果', () => {
    const cnyRows = buildCurrencyRows(['USD', 'CNY', 'JPY'], 'USD', 12.5, 3, rates, {}, 'CNY')
    const jpyRows = buildCurrencyRows(['USD', 'CNY', 'JPY'], 'USD', 12.5, 3, rates, {}, 'JPY')
    expect(jpyRows[1].unit).toBeCloseTo(cnyRows[1].unit as number, 10)
    expect(jpyRows[2].unit).toBeCloseTo(cnyRows[2].unit as number, 10)
    expect(jpyRows[2].total).toBeCloseTo(cnyRows[2].total as number, 8)
  })
})

describe('buildResultRows', () => {
  it('按含税成本计算未税成本、税额与含税报价', () => {
    const rows = buildCurrencyRows(['USD', 'CNY', 'JPY'], 'USD', 100, 2, rates, {}, 'CNY')
    const result = buildResultRows(rows, 13, 15)
    expect(result[0].netUnit).toBeCloseTo(100 / 1.13, 10)
    expect(result[0].netTotal).toBeCloseTo(200 / 1.13, 10)
    expect(result[0].tax).toBeCloseTo(200 - 200 / 1.13, 10)
    expect(result[0].quoteUnit).toBeCloseTo(115, 10)
    expect(result[0].quoteTotal).toBeCloseTo(230, 10)
    expect(result[1].quoteTotal).toBeCloseTo((200 * (1 / 0.14)) * 1.15, 8)
  })
})

describe('sellingPrice', () => {
  it('含税成本加 15% 得到 115%', () => {
    expect(sellingPrice(100, 15)).toBeCloseTo(115, 10)
  })

  it('加价 0% 时售价等于成本', () => {
    expect(sellingPrice(88.5, 0)).toBeCloseTo(88.5, 10)
  })

  it('支持大于 100% 的加价', () => {
    expect(sellingPrice(100, 200)).toBeCloseTo(300, 10)
  })

  it('成本为空或负数时返回 null', () => {
    expect(sellingPrice(null, 15)).toBeNull()
    expect(sellingPrice(-1, 15)).toBeNull()
  })
})

describe('buildProfitRows', () => {
  it('直接利润为报价减含税成本，退税按未税成本计算', () => {
    const rows = buildResultRows(
      buildCurrencyRows(['USD', 'CNY', 'JPY'], 'CNY', 113, 2, rates, {}, 'CNY'),
      13,
      20
    )
    const profit = buildProfitRows(rows, 13)
    expect(profit[1].direct).toBeCloseTo(45.2, 8)
    expect(profit[1].rebate).toBeCloseTo(26, 8)
    expect(profit[1].total).toBeCloseTo(71.2, 8)
  })

  it('退税率只影响退税利润', () => {
    const rows = buildResultRows(
      buildCurrencyRows(['USD', 'CNY', 'JPY'], 'CNY', 113, 1, rates, {}, 'CNY'),
      13,
      20
    )
    const profit = buildProfitRows(rows, 0)
    expect(profit[1].rebate).toBeCloseTo(0, 10)
    expect(profit[1].total).toBeCloseTo(profit[1].direct as number, 10)
  })

  it('没有成本时利润为空', () => {
    const rows = buildResultRows(
      buildCurrencyRows(['USD', 'CNY', 'JPY'], 'CNY', null, 1, rates, {}, 'CNY'),
      13,
      20
    )
    const profit = buildProfitRows(rows, 13)
    expect(profit[1].direct).toBeNull()
    expect(profit[1].rebate).toBeNull()
    expect(profit[1].total).toBeNull()
  })
})

describe('convertAmount', () => {
  it('通过人民币交叉换算', () => {
    const usdToCny = basePerUnit(rates, 'USD', {}, 'CNY')
    const eurToCny = basePerUnit(rates, 'EUR', {}, 'CNY')
    const result = convertAmount(100, usdToCny, eurToCny)
    expect(result).toBeCloseTo((100 * (1 / 0.14)) / (1 / 0.12), 10)
  })

  it('缺少汇率时返回 null', () => {
    expect(convertAmount(100, null, 1)).toBeNull()
  })
})

describe('convertCostPrice', () => {
  it('切换主币种时按人民币交叉换算', () => {
    expect(convertCostPrice(100, 'USD', 'EUR', rates, {}, 'CNY')).toBeCloseTo(
      (100 * (1 / 0.14)) / (1 / 0.12),
      10
    )
  })

  it('缺少任一侧汇率时返回 null，由界面阻止切换', () => {
    expect(convertCostPrice(100, 'USD', 'GBP', rates, {}, 'CNY')).toBeNull()
    expect(convertCostPrice(100, 'GBP', 'USD', rates, {}, 'CNY')).toBeNull()
    expect(convertCostPrice(null, 'USD', 'EUR', rates, {}, 'CNY')).toBeNull()
  })

  it('手动汇率优先生效', () => {
    expect(convertCostPrice(100, 'CNY', 'USD', rates, { USD: 8 }, 'CNY')).toBeCloseTo(12.5, 10)
  })
})

describe('格式化与解析', () => {
  it('解析金额并忽略逗号', () => {
    expect(parseAmount('1,234.5')).toBeCloseTo(1234.5, 10)
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
  })

  it('按位数四舍五入', () => {
    expect(roundTo(11.0619469, 4)).toBeCloseTo(11.0619, 10)
    expect(roundTo(1.005, 2)).toBeCloseTo(1.01, 10)
  })

  it('格式化带千分位', () => {
    expect(formatNumber(1234.5, 2)).toBe('1,234.50')
    expect(formatNumber(2.525, 2)).toBe('2.53')
    expect(formatNumber(null, 2)).toBe('—')
  })

  it('单价保留更多有效小数，便于与总价核对', () => {
    expect(formatAmount(107.142857, 2)).toBe('107.1429')
    expect(formatAmount(12.5, 2)).toBe('12.50')
    expect(formatAmount(null, 2)).toBe('—')
  })

  it('输入框数值不带千分位', () => {
    expect(formatInput(1234.5)).toBe('1234.5')
    expect(formatInput(11.0619469)).toBe('11.0619')
    expect(formatInput(null)).toBe('')
  })

  it('汇率按量级展示小数位', () => {
    expect(formatRate(7.123456)).toBe('7.1235')
    expect(formatRate(0.000123)).toBe('0.000123')
  })

  it('输入清洗只保留数字和一个小数点', () => {
    expect(cleanAmountInput('12.3.4a5')).toBe('12.345')
    expect(cleanAmountInput('abc')).toBe('')
  })

  it('全角数字和科学计数法不会被静默改坏', () => {
    expect(cleanAmountInput('１２．５')).toBe('12.5')
    expect(cleanAmountInput('１，０００')).toBe('1000')
    expect(cleanAmountInput('1E+06')).toBe('1000000')
    expect(cleanAmountInput('1.23E+08')).toBe('123000000')
    expect(cleanAmountInput('1E-6')).toBe('0.000001')
    expect(cleanAmountInput('1e')).toBe('1e')
    expect(parseAmount('１，２３４．５')).toBe(1234.5)
  })
})
