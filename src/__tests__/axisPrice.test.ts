import { describe, expect, it } from 'vitest'
import { formatAxisPrice } from '../common/utils/axisPrice'

/** Groups the integer part only, the way `ThousandsSeparator` does. */
function group(value: string): string {
  const [integer, fraction] = value.split('.')
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return fraction === undefined ? grouped : `${grouped}.${fraction}`
}

/**
 * The chart is taken structurally, so a test can hand in the three getters
 * `formatAxisPrice` actually reads instead of a full `Chart`.
 */
function chart(options: { precision?: number; separator?: boolean; fold?: (value: string) => string } = {}): Parameters<typeof formatAxisPrice>[0] {
  const { precision = 2, separator = false, fold } = options
  return {
    getSymbol: () => ({ pricePrecision: precision }),
    getThousandsSeparator: () => ({ sign: ',', format: (value: string | number) => (separator ? group(`${value}`) : `${value}`) }),
    getDecimalFold: () => ({ formatPrice: fold ?? ((value: string) => value) })
  }
}

const axis = { displayValueToText: (value: number, precision: number) => `axis:${value.toFixed(precision)}` }

describe('formatAxisPrice', () => {
  it('prints through the axis, so a tag matches the scale beside it', () => {
    expect(formatAxisPrice(chart(), axis, 1.5)).toBe('axis:1.50')
  })

  it('falls back to plain precision when there is no axis yet', () => {
    expect(formatAxisPrice(chart(), null, 1.5)).toBe('1.50')
  })

  it('takes the precision from the symbol by default', () => {
    expect(formatAxisPrice(chart({ precision: 4 }), null, 1.5)).toBe('1.5000')
  })

  it('lets the caller override the precision', () => {
    expect(formatAxisPrice(chart({ precision: 4 }), null, 1.5, 8)).toBe('1.50000000')
  })

  it('applies the thousands separator before the decimal fold', () => {
    const seen: string[] = []
    const fold = (value: string): string => {
      seen.push(value)
      return `fold(${value})`
    }
    const folded = formatAxisPrice(chart({ separator: true, fold }), { displayValueToText: () => '1234567.50' }, 1234567.5)
    expect(seen).toEqual(['1,234,567.50'])
    expect(folded).toBe('fold(1,234,567.50)')
  })

  it('keeps a non-numeric label as it came', () => {
    expect(formatAxisPrice(chart(), { displayValueToText: () => 'n/a' }, Number.NaN)).toBe('n/a')
  })
})
