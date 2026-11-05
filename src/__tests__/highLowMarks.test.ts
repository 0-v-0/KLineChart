import { describe, expect, it } from 'vitest'

import { candleTypeUsesHighLow, type CandleType } from '../common/Styles'
import { visibleHighLowMarks } from '../common/utils/highLowMarks'

describe('visibleHighLowMarks', () => {
  it('returns the visible high and low', () => {
    expect(visibleHighLowMarks([{ price: 135 }, { price: 95 }])).toEqual({ high: 135, low: 95 })
  })

  it('drops the store sentinels when nothing is visible', () => {
    expect(visibleHighLowMarks([{ price: Number.MIN_SAFE_INTEGER }, { price: Number.MAX_SAFE_INTEGER }])).toEqual({ high: null, low: null })
  })

  it('treats a sentinel on one side alone as missing', () => {
    expect(visibleHighLowMarks([{ price: Number.MIN_SAFE_INTEGER }, { price: 95 }])).toEqual({ high: null, low: 95 })
    expect(visibleHighLowMarks([{ price: 135 }, { price: Number.MAX_SAFE_INTEGER }])).toEqual({ high: 135, low: null })
  })

  it('handles a missing list', () => {
    expect(visibleHighLowMarks([])).toEqual({ high: null, low: null })
  })
})

const CLOSE_ONLY: CandleType[] = ['area', 'column', 'line', 'line_markers', 'step_line', 'baseline']
const USES_HIGH_LOW: CandleType[] = ['candle_solid', 'candle_stroke', 'candle_up_stroke', 'candle_down_stroke', 'ohlc', 'heikin_ashi', 'footprint', 'hlc_area', 'high_low']

describe('candleTypeUsesHighLow', () => {
  it('is false for close-only series', () => {
    for (const type of CLOSE_ONLY) {
      expect(candleTypeUsesHighLow(type)).toBe(false)
    }
  })

  it('is true for bars, footprints and the two high/low-ish line renderers', () => {
    for (const type of USES_HIGH_LOW) {
      expect(candleTypeUsesHighLow(type)).toBe(true)
    }
  })

  it('covers every declared candle type exactly once', () => {
    expect(new Set([...CLOSE_ONLY, ...USES_HIGH_LOW]).size).toBe(15)
  })
})
