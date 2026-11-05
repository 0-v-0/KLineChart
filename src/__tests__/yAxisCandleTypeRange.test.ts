import { describe, expect, it } from 'vitest'

import type { CandleType } from '../common/Styles'
import YAxisImp from '../component/YAxis'

interface Bar {
  open: number
  high: number
  low: number
  close: number
}

/** Two bars whose wicks (80..120) are much wider than their closes (100..110). */
const bars: Bar[] = [
  { open: 99, high: 120, low: 80, close: 100 },
  { open: 102, high: 118, low: 85, close: 110 }
]

/**
 * The real `createRangeImp` on a bare axis: only the range post-processing is
 * stubbed (identity transforms, zero gaps), so the min/max it computes from
 * the visible bars is what the assertion sees.
 */
function rangeFor(type: CandleType): { from: number; to: number } {
  const visibleRangeDataList = bars.map((data, dataIndex) => ({ dataIndex, data: { current: data, prev: null, next: null } }))
  const chartStore = {
    getSymbol: () => ({ pricePrecision: 2 }),
    getVisibleRangeDataList: () => visibleRangeDataList
  }
  const chart = {
    getChartStore: () => chartStore,
    getStyles: () => ({ candle: { type, area: { value: 'close' } } })
  }
  const parent = { getId: () => 'candle_pane', getChart: () => chart }
  const axis = Object.assign(Object.create(YAxisImp.prototype) as object, {
    gap: { top: 0, bottom: 0 },
    getParent: () => parent,
    isInCandle: () => true,
    _shouldUseCandleData: () => true,
    _getIndicatorsByYAxisIds: () => [],
    createRange: (opts: { defaultRange: unknown }) => opts.defaultRange,
    minSpan: () => 0,
    getBounding: () => ({ height: 100 }),
    realValueToValue: (v: number) => v,
    realValueToDisplayValue: (v: number) => v
  }) as unknown as { createRangeImp: () => { from: number; to: number } }
  const { from, to } = axis.createRangeImp()
  return { from, to }
}

describe('price axis range by candle type', () => {
  it('uses high/low for a bar type', () => {
    expect(rangeFor('candle_solid')).toEqual({ from: 80, to: 120 })
  })

  it('does not stretch to wicks for a close-only series', () => {
    for (const type of ['area', 'column', 'line', 'line_markers', 'step_line', 'baseline'] as CandleType[]) {
      expect(rangeFor(type)).toEqual({ from: 100, to: 110 })
    }
  })

  it('still uses high/low for the two high/low-ish line renderers', () => {
    expect(rangeFor('hlc_area')).toEqual({ from: 80, to: 120 })
    expect(rangeFor('high_low')).toEqual({ from: 80, to: 120 })
  })

  it('honours an area value key other than close', () => {
    // `area.value` is a host's choice; the range follows that field, not close.
    const chartStore = {
      getSymbol: () => ({ pricePrecision: 2 }),
      getVisibleRangeDataList: () => bars.map((data, dataIndex) => ({ dataIndex, data: { current: { ...data, turnover: data.low }, prev: null, next: null } }))
    }
    const chart = {
      getChartStore: () => chartStore,
      getStyles: () => ({ candle: { type: 'area', area: { value: 'turnover' } } })
    }
    const parent = { getId: () => 'candle_pane', getChart: () => chart }
    const axis = Object.assign(Object.create(YAxisImp.prototype) as object, {
      gap: { top: 0, bottom: 0 },
      getParent: () => parent,
      isInCandle: () => true,
      _shouldUseCandleData: () => true,
      _getIndicatorsByYAxisIds: () => [],
      createRange: (opts: { defaultRange: unknown }) => opts.defaultRange,
      minSpan: () => 0,
      getBounding: () => ({ height: 100 }),
      realValueToValue: (v: number) => v,
      realValueToDisplayValue: (v: number) => v
    }) as unknown as { createRangeImp: () => { from: number; to: number } }
    expect(axis.createRangeImp()).toMatchObject({ from: 80, to: 85 })
  })
})
