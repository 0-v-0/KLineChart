import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { AxisRange } from '../component/Axis'
import YAxisImp from '../component/YAxis'
import normal from '../extension/y-axis/normal'
import DrawPane from '../pane/DrawPane'

beforeAll(() => {
  // Node has no canvas; tick text measurement only needs a width.
  vi.stubGlobal('document', {
    createElement: () => ({
      ownerDocument: { defaultView: { devicePixelRatio: 1 } },
      getContext: () => ({
        scale: () => {
          /* noop */
        },
        measureText: (text: string) => ({ width: text.length * 6 })
      })
    })
  })
})

afterAll(() => {
  vi.unstubAllGlobals()
})

const HEIGHT = 400

interface FakeIndicator {
  yAxisId: string
  shouldOhlc: boolean
  precision: number
  minValue?: number
  maxValue?: number
  figures: Array<{ key: string }>
  result: Array<Record<string, number>>
}

interface Fixture {
  axis: YAxisImp
  setBarSpace: (bar: number) => void
}

function range(from: number, to: number): AxisRange {
  return { from, to, range: to - from, realFrom: from, realTo: to, realRange: to - from, displayFrom: from, displayTo: to, displayRange: to - from }
}

function makeAxis(opts: { closes?: number[]; indicators?: FakeIndicator[]; paneId?: string } = {}): Fixture {
  const closes = opts.closes ?? [100, 110, 120, 130]
  const bars = closes.map((close, i) => ({ timestamp: i, open: close, high: close + 5, low: close - 5, close, volume: 1 }))
  let barSpace = 10
  const chartStore = {
    getIndicatorsByPaneId: () => opts.indicators ?? [],
    getSymbol: () => ({ pricePrecision: 2 }),
    getVisibleRangeDataList: () => bars.map((data, dataIndex) => ({ dataIndex, x: 0, data: { current: data } })),
    getBarSpace: () => ({ bar: barSpace }),
    getStyles: () => ({ yAxis: { tickText: { size: 12, weight: 'normal', family: 'Arial' } } }),
    getInnerFormatter: () => ({ formatBigNumber: (value: string) => value }),
    getThousandsSeparator: () => ({ format: (value: string) => value }),
    getDecimalFold: () => ({ format: (value: string) => value }),
    setPriceFoldZeroCount: () => {
      /* noop */
    }
  }
  const chart = {
    getChartStore: () => chartStore,
    getStyles: () => ({ candle: { type: 'candle_solid', area: { value: 'close' } } })
  }
  const paneId = opts.paneId ?? 'candle_pane'
  const parent = {
    getId: () => paneId,
    getChart: () => chart,
    getYAxisWidgetById: () => null,
    getMainWidget: () => ({ getBounding: () => ({ height: HEIGHT, width: 60, top: 0, left: 0 }) }),
    isDefaultYAxis: () => true,
    isManualYAxis: () => false,
    getDefaultYAxisId: () => ''
  }
  const axis = new (YAxisImp.extend(normal))(parent as never) as unknown as YAxisImp
  return {
    axis,
    setBarSpace: (bar: number) => {
      barSpace = bar
    }
  }
}

function paneRig(axis: YAxisImp): { override: (options: { id: string; name?: string; reverse?: boolean; needWidget?: boolean }) => void } {
  const components = new Map<string, YAxisImp>([[axis.id, axis]])
  const fake = {
    _yAxisComponents: components,
    _yAxisWidgets: new Map(),
    _defaultYAxisId: axis.id,
    getId: () => 'candle_pane',
    createYAxisComponent: () => axis,
    createYAxisWidget: () => null,
    setAxisCursor: () => {
      /* noop */
    },
    getBounding: () => ({ height: HEIGHT, width: 60, top: 0, left: 0 })
  }
  return {
    override: (options) => {
      ;(DrawPane.prototype.createOrOverrideYAxis as unknown as (this: unknown, value: unknown) => void).call(fake, options)
    }
  }
}

describe('the price-to-bar lock', () => {
  it('re-derives the span around the same centre when the bar space changes', () => {
    const fixture = makeAxis()
    fixture.axis.buildTicks(true)
    const before = fixture.axis.getRange()
    const centre = (before.realFrom + before.realTo) / 2
    fixture.axis.override({ name: 'normal', priceToBarRatio: null })
    expect(fixture.axis.getAutoCalcTickFlag()).toBe(false)
    expect(fixture.axis.getPriceToBarRatio()).toBeCloseTo((before.realRange / HEIGHT) * 10)
    fixture.setBarSpace(20)
    fixture.axis.buildTicks(true)
    const after = fixture.axis.getRange()
    expect(after.realRange).toBeCloseTo(before.realRange / 2)
    expect((after.realFrom + after.realTo) / 2).toBeCloseTo(centre)
  })

  it('takes an explicit ratio, and a manual range updates it', () => {
    const fixture = makeAxis()
    fixture.axis.override({ name: 'normal', priceToBarRatio: 2 })
    fixture.axis.buildTicks(true)
    expect(fixture.axis.getRange().realRange).toBeCloseTo((2 / 10) * HEIGHT)
    fixture.axis.setRange(range(0, 80))
    expect(fixture.axis.getPriceToBarRatio()).toBeCloseTo((80 / HEIGHT) * 10)
  })

  it('is released by turning auto scale on', () => {
    const fixture = makeAxis()
    fixture.axis.override({ name: 'normal', priceToBarRatio: 2 })
    fixture.axis.setAutoCalcTickFlag(true)
    expect(fixture.axis.getPriceToBarRatio()).toBeNull()
    expect(fixture.axis.getAutoCalcTickFlag()).toBe(true)
  })
})

describe('scaleSeriesOnly', () => {
  const far: FakeIndicator = {
    yAxisId: '',
    shouldOhlc: false,
    precision: 2,
    maxValue: 1000,
    figures: [{ key: 'v' }],
    result: [{ v: 900 }, { v: 900 }, { v: 900 }, { v: 900 }]
  }

  it('lets a far-away candle-pane indicator widen the range only when off', () => {
    const off = makeAxis({ indicators: [far] })
    off.axis.buildTicks(true)
    expect(off.axis.getRange().to).toBeGreaterThan(900)
    const on = makeAxis({ indicators: [far] })
    on.axis.override({ name: 'normal', scaleSeriesOnly: true })
    on.axis.buildTicks(true)
    expect(on.axis.getRange().to).toBeLessThan(200)
  })

  it('has no effect on an indicator pane', () => {
    const fixture = makeAxis({ indicators: [far], paneId: 'indicator_pane_1' })
    fixture.axis.override({ name: 'normal', scaleSeriesOnly: true })
    fixture.axis.buildTicks(true)
    expect(fixture.axis.getRange().to).toBeGreaterThan(900)
  })
})

describe('a manual range across pane option changes', () => {
  it('survives an override of the same axis', () => {
    const fixture = makeAxis()
    const pane = paneRig(fixture.axis)
    fixture.axis.setRange(range(50, 150))
    pane.override({ id: fixture.axis.id, name: 'normal', reverse: true, needWidget: false })
    expect(fixture.axis.getAutoCalcTickFlag()).toBe(false)
    expect(fixture.axis.reverse).toBe(true)
  })

  it('goes back to auto when the axis itself changes', () => {
    const fixture = makeAxis()
    const pane = paneRig(fixture.axis)
    fixture.axis.setRange(range(50, 150))
    pane.override({ id: fixture.axis.id, name: 'percentage', needWidget: false })
    expect(fixture.axis.getAutoCalcTickFlag()).toBe(true)
  })
})

describe('the tick step floor', () => {
  it('never steps below one price unit on a candle price axis', () => {
    const fixture = makeAxis()
    fixture.axis.setRange(range(0, 0.03))
    fixture.axis.buildTicks(true)
    const values = fixture.axis.getTicks().map((tick) => Number(tick.value))
    // 0.03 over eight ticks would step 0.005 and print three decimals twice
    // over; the symbol's two-decimal precision floors it at 0.01.
    expect(values.length).toBeLessThanOrEqual(4)
    values.slice(1).forEach((value, i) => {
      expect(value - values[i]).toBeGreaterThanOrEqual(0.0099)
    })
  })

  it('leaves an indicator pane free to step finer', () => {
    const fixture = makeAxis({ paneId: 'indicator_pane_1' })
    fixture.axis.setRange(range(0, 0.03))
    fixture.axis.buildTicks(true)
    // No price precision to respect on an indicator pane, so the step stays
    // finer than a unit and the axis carries more ticks than the floored one.
    expect(fixture.axis.getTicks().length).toBeGreaterThan(4)
  })
})
