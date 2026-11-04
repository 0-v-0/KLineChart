import { describe, expect, it } from 'vitest'

import { foldZeroCount, formatFoldDecimal, formatFoldDecimals, formatFoldDecimalsAt } from '../common/utils/format'

describe('formatFoldDecimal', () => {
  it('folds the leading zeros into a subscript count', () => {
    expect(formatFoldDecimal('0.000000024', 4)).toBe('0.0₇24')
  })

  it('trims trailing toFixed padding', () => {
    expect(formatFoldDecimal('0.0001200', 3)).toBe('0.0₃12')
  })

  it('leaves values below the threshold alone', () => {
    expect(formatFoldDecimal('0.0009', 4)).toBe('0.0009')
    expect(formatFoldDecimal('1.5', 4)).toBe('1.5')
  })
})

describe('formatFoldDecimals', () => {
  it('shares one zero count across the set', () => {
    expect(formatFoldDecimals(['0.000000016', '0.000000048'], 4)).toEqual(['0.0₇16', '0.0₇48'])
  })

  it('keeps the extra zeros of a shorter value as digits', () => {
    expect(formatFoldDecimals(['0.000000016', '0.00000000048'], 4)).toEqual(['0.0₇1600', '0.0₇0048'])
  })

  it('does not fold a set that holds a value above 1', () => {
    expect(formatFoldDecimals(['0.000000016', '12'], 4)).toEqual(['0.000000016', '12'])
  })
})

describe('foldZeroCount', () => {
  it('reports the count the set would fold to', () => {
    expect(foldZeroCount(['0.000000016', '0.000000048'], 4)).toBe(7)
  })

  it('reports null when the set does not fold', () => {
    expect(foldZeroCount(['0.0009'], 4)).toBeNull()
    expect(foldZeroCount(['0.000000016', '12'], 4)).toBeNull()
  })
})

describe('formatFoldDecimalsAt', () => {
  it('folds to the axis count rather than the value own count', () => {
    expect(formatFoldDecimalsAt(['0.00000000076'], 8, 4)).toEqual(['0.0₈076'])
  })

  it('falls back to the set rule without an axis count', () => {
    expect(formatFoldDecimalsAt(['0.000000024'], null, 4)).toEqual(['0.0₇24'])
  })
})
