/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 * http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, expect, it, vi } from 'vitest'
import type Chart from '../Chart'
import type { AxisTick } from '../component/Axis'
import YAxisImp from '../component/YAxis'
import { foldZeroCount } from '../common/utils/format'
import { PaneIdConstants } from '../pane/types'
import StoreImp from '../Store'
import CandleHighLowPriceView from '../view/CandleHighLowPriceView'

const DISPLAYED = ['0.0000000016', '0.0000000018', '0.0000000020']

interface AxisRig {
  ticks: () => AxisTick[]
  formatAll: ReturnType<typeof vi.fn>
  format: ReturnType<typeof vi.fn>
  setZeroCount: ReturnType<typeof vi.fn>
  produced: string[]
}

function axisRig(options: { inCandle?: boolean; withFormatAll?: boolean } = {}): AxisRig {
  const inCandle = options.inCandle ?? true
  const withFormatAll = options.withFormatAll ?? true
  const produced: string[] = []
  let displayIndex = 0
  let y = 20
  const format = vi.fn((value: string) => `single:${value}`)
  const formatAll = vi.fn((values: string[]) => values.map((value) => `group:${value}`))
  const setZeroCount = vi.fn()
  const decimalFold = {
    threshold: 4,
    format,
    formatAll: withFormatAll ? formatAll : undefined,
    formatPrice: (value: string) => value,
    formatPrices: (values: string[]) => values
  }
  const chartStore = {
    getStyles: () => ({ yAxis: { tickText: { size: 12 } } }),
    getSymbol: () => ({ pricePrecision: 10 }),
    getInnerFormatter: () => ({ formatBigNumber: (value: string) => value }),
    getThousandsSeparator: () => ({ format: (value: string) => value }),
    getDecimalFold: () => decimalFold,
    setPriceFoldZeroCount: setZeroCount
  }
  const pane = {
    getId: () => (inCandle ? PaneIdConstants.CANDLE : 'pane_1'),
    getChart: () => ({ getChartStore: () => chartStore })
  }
  const yAxis = Object.create(YAxisImp.prototype) as YAxisImp
  Object.assign(yAxis, {
    getParent: () => pane,
    getBounding: () => ({ width: 120, height: 1000 }),
    getRange: () => ({ displayFrom: 0, displayTo: 3, displayRange: 3 }),
    _getIndicatorsByYAxisIds: () => [],
    _shouldUseCandleData: () => inCandle,
    isInCandle: () => inCandle,
    displayValueToText: () => {
      const value = DISPLAYED[displayIndex++ % DISPLAYED.length]
      produced.push(value)
      return value
    },
    realValueToValue: (value: number) => value,
    displayValueToRealValue: (value: number) => value,
    convertToPixel: () => {
      y += 60
      return y
    },
    createTicks: undefined
  })
  return {
    ticks: () => (yAxis as unknown as { createTicksImp: () => AxisTick[] }).createTicksImp(),
    formatAll,
    format,
    setZeroCount,
    produced
  }
}

describe('price axis fold alignment', () => {
  it('folds tick labels as one group and writes them back', () => {
    const rig = axisRig()
    const ticks = rig.ticks()
    expect(ticks.length).toBeGreaterThan(1)
    expect(rig.formatAll).toHaveBeenCalledOnce()
    expect(ticks.every((tick) => tick.text.startsWith('group:'))).toBe(true)
    expect(rig.format).not.toHaveBeenCalled()
  })

  it('falls back to folding each label when formatAll is missing', () => {
    const rig = axisRig({ withFormatAll: false })
    const ticks = rig.ticks()
    expect(rig.formatAll).not.toHaveBeenCalled()
    expect(rig.format).toHaveBeenCalledTimes(ticks.length)
    expect(ticks.every((tick) => tick.text.startsWith('single:'))).toBe(true)
  })

  it('records the zero count the candle axis ticks share', () => {
    const rig = axisRig()
    rig.ticks()
    expect(rig.setZeroCount).toHaveBeenCalledOnce()
    expect(foldZeroCount(rig.produced, 4)).toBe(8)
    expect(rig.setZeroCount).toHaveBeenCalledWith(8)
  })

  it('does not impose a price fold count from an indicator pane', () => {
    const rig = axisRig({ inCandle: false })
    rig.ticks()
    expect(rig.setZeroCount).not.toHaveBeenCalled()
  })
})

describe('price fold state', () => {
  it('makes formatPrice and formatPrices use the recorded count', () => {
    const store = new StoreImp({ layout: () => undefined, updatePane: () => undefined } as unknown as Chart)
    // A price with one more leading zero folds to `₉` on its own, but must be
    // rewritten at the axis's `₈` count once that count is recorded.
    const deeper = '0.00000000016'
    const before = store.getDecimalFold().formatPrice(deeper)
    store.setPriceFoldZeroCount(8)
    const after = store.getDecimalFold().formatPrice(deeper)
    expect(after).not.toBe(before)
    expect(after.startsWith('0.0₈')).toBe(true)
    expect(store.getDecimalFold().formatPrice('0.0000000016')).toBe('0.0₈16')
    expect(store.getDecimalFold().formatPrices(['0.0000000016', '0.0000000018'])).toEqual(['0.0₈16', '0.0₈18'])
  })
})

describe('price marks fold in the axis terms', () => {
  it('uses formatPrice rather than format for the high/low marks', () => {
    const format = vi.fn(() => 'wrong')
    const formatPrice = vi.fn(() => 'folded')
    const chartStore = {
      getStyles: () => ({ candle: { priceMark: { show: true, high: { show: true }, low: { show: true } } } }),
      getVisibleRangeHighLowPrice: () => [
        { price: 105, x: 10 },
        { price: 95, x: 20 }
      ],
      getSymbol: () => ({ pricePrecision: 2 }),
      getDecimalFold: () => ({ format, formatPrice }),
      getThousandsSeparator: () => ({ format: (value: string) => value })
    }
    const pane = {
      getYAxisComponentById: () => ({ convertToPixel: () => 0 }),
      getChart: () => ({ getChartStore: () => chartStore })
    }
    const drawMark = vi.fn()
    const view = Object.create(CandleHighLowPriceView.prototype) as CandleHighLowPriceView
    Object.assign(view, {
      getWidget: () => ({ getPane: () => pane, getBounding: () => ({ width: 100, height: 100 }) }),
      _drawMark: drawMark
    })
    view.drawImp({} as CanvasRenderingContext2D)
    expect(formatPrice).toHaveBeenCalledTimes(2)
    expect(format).not.toHaveBeenCalled()
    expect(drawMark).toHaveBeenCalledTimes(2)
    expect(drawMark.mock.calls[0][1]).toBe('folded')
  })
})
