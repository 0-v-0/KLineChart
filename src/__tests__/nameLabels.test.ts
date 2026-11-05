import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { KLineData } from '../common/Data'
import { getDefaultStyles } from '../common/Styles'
import type { Indicator } from '../component/Indicator'
import NameLabelView, { collectNameLabels, type NameLabelParams } from '../view/NameLabelView'

beforeAll(() => {
  // Node has no canvas; text measurement only needs a width.
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

const bar = (open: number, close: number): KLineData => ({ timestamp: 0, open, high: close + 1, low: open - 1, close, volume: 1 })

function indicator(shortName: string, result: Array<Record<string, number>>): Indicator {
  return {
    shortName,
    visible: true,
    result,
    styles: null,
    figures: [
      { key: 'a', type: 'line' },
      { key: 'b', type: 'line' }
    ]
  } as unknown as Indicator
}

function params(over: Partial<NameLabelParams> = {}, show = { symbol: true, indicator: true }): NameLabelParams {
  const styles = getDefaultStyles()
  styles.candle.priceMark.last.nameLabel.show = show.symbol
  styles.indicator.lastValueMark.nameLabel.show = show.indicator
  return {
    isCandle: true,
    styles,
    symbol: { ticker: 'BTCUSDT', pricePrecision: 2, volumePrecision: 0 },
    dataList: [bar(100, 101), bar(101, 110)],
    indicators: [],
    convertToNicePixel: (value) => value * 2,
    barSpace: { bar: 6, halfBar: 3, halfGapBar: 1, gapBar: 2 },
    ...over
  }
}

describe('collectNameLabels', () => {
  it('puts the ticker at the last close, in the last-price colour', () => {
    const p = params()
    expect(collectNameLabels(p)).toEqual([{ text: 'BTCUSDT', y: 220, color: p.styles.candle.priceMark.last.upColor, style: p.styles.candle.priceMark.last.nameLabel }])
  })

  it('falls back to the symbol name when there is no ticker', () => {
    const labels = collectNameLabels(params({ symbol: { name: 'Bitcoin', pricePrecision: 2, volumePrecision: 0 } as never }))
    expect(labels[0].text).toBe('Bitcoin')
  })

  it('puts an indicator short name at its first figure last value only', () => {
    const labels = collectNameLabels(
      params({
        isCandle: false,
        indicators: [
          indicator('MA', [
            { a: 1, b: 2 },
            { a: 50, b: 60 }
          ])
        ]
      })
    )
    expect(labels.map((label) => [label.text, label.y])).toEqual([['MA', 100]])
  })

  it('draws nothing while both flags are off, and no ticker off the candle pane', () => {
    expect(collectNameLabels(params({ indicators: [indicator('MA', [{ a: 1 }, { a: 5 }])] }, { symbol: false, indicator: false }))).toEqual([])
    expect(collectNameLabels(params({ isCandle: false }, { symbol: true, indicator: false }))).toEqual([])
  })

  it('skips an indicator with no value on the last bar', () => {
    expect(collectNameLabels(params({ isCandle: false, indicators: [indicator('MA', [{ a: 1 }, {}])] }))).toEqual([])
  })
})

interface CapturedNameFigure {
  text: string
  x: number
  align: string
}

function drawOnAxes(axes: Array<{ id: string; position: 'left' | 'right'; isInCandle: boolean }>, indicators: Indicator[]): CapturedNameFigure[] {
  const figures: CapturedNameFigure[] = []
  const styles = getDefaultStyles()
  styles.candle.priceMark.last.nameLabel.show = true
  styles.indicator.lastValueMark.nameLabel.show = true
  const chartStore = {
    getStyles: () => styles,
    getSymbol: () => ({ ticker: 'BTCUSDT', pricePrecision: 2 }),
    getDataList: () => [bar(100, 101), bar(101, 110)],
    getBarSpace: () => ({ bar: 6, halfBar: 3, halfGapBar: 1, gapBar: 2 }),
    getIndicatorsByPaneId: () => indicators
  }
  const chart = { getChartStore: () => chartStore }
  const yAxes = axes.map((axis) => ({
    id: axis.id,
    position: axis.position,
    inside: false,
    isInCandle: () => axis.isInCandle,
    convertToNicePixel: (value: number) => value
  }))
  const pane = {
    getId: () => 'candle_pane',
    getChart: () => chart,
    getYAxisComponents: () => yAxes,
    getDefaultYAxisId: () => axes[0].id,
    isDefaultYAxis: (id: string) => id === axes[0].id,
    getYAxisWidgetById: () => null
  }
  const view = Object.assign(Object.create(NameLabelView.prototype) as object, {
    getWidget: () => ({ getPane: () => pane, getBounding: () => ({ width: 400, height: 300 }) }),
    createFigure: (create: { attrs: { text: string; x: number; align: string } }) => {
      figures.push({ text: create.attrs.text, x: create.attrs.x, align: create.attrs.align })
      return { draw: () => figures[figures.length - 1] }
    }
  }) as unknown as { drawImp: (ctx: unknown) => void }
  view.drawImp({})
  return figures
}

describe('name labels across a pane with several price axes', () => {
  it('puts each indicator name on the axis that scales it, and the ticker once', () => {
    const figures = drawOnAxes(
      [
        { id: 'a', position: 'right', isInCandle: true },
        { id: 'b', position: 'left', isInCandle: true }
      ],
      [{ ...indicator('MA', [{ a: 1 }, { a: 5 }]), yAxisId: 'a' } as unknown as Indicator, { ...indicator('BOLL', [{ a: 2 }, { a: 6 }]), yAxisId: 'b' } as unknown as Indicator]
    )
    expect(figures).toEqual([
      { text: 'BTCUSDT', x: 400, align: 'right' },
      { text: 'MA', x: 400, align: 'right' },
      { text: 'BOLL', x: 0, align: 'left' }
    ])
  })

  it('draws the ticker only on the default axis of the candle pane', () => {
    const figures = drawOnAxes(
      [
        { id: 'a', position: 'right', isInCandle: true },
        { id: 'b', position: 'right', isInCandle: true }
      ],
      []
    )
    expect(figures.map((figure) => figure.text)).toEqual(['BTCUSDT'])
  })
})
