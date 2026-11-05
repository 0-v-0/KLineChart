import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import CandleHighLowAxisLabelView from '../view/CandleHighLowAxisLabelView'
import CandleHighLowLineView from '../view/CandleHighLowLineView'

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

interface CapturedFigure {
  name: string
  attrs: unknown
  styles: unknown
}

interface DrawableView {
  drawImp: (ctx: unknown) => void
}

interface FakeStyles {
  candle: {
    type: string
    priceMark: {
      show: boolean
      highLowAxis: {
        show: boolean
        text: Record<string, unknown>
        line: Record<string, unknown>
        color: string
      }
    }
  }
}

function stylesFor(overrides: Partial<FakeStyles['candle']['priceMark']['highLowAxis']> = {}, type = 'candle_solid'): FakeStyles {
  return {
    candle: {
      type,
      priceMark: {
        show: true,
        highLowAxis: {
          show: true,
          text: { show: true, size: 12, paddingLeft: 4, paddingRight: 4, paddingTop: 4, paddingBottom: 4, family: 'sans', weight: 'normal', color: '#fff' },
          line: { show: true, style: 'dashed', dashedValue: [4, 4], size: 1 },
          color: '#929AA5',
          ...overrides
        }
      }
    }
  }
}

function render(ViewClass: typeof CandleHighLowAxisLabelView | typeof CandleHighLowLineView, styles: FakeStyles, range: [number, number], pixels: Map<number, number>): CapturedFigure[] {
  const figures: CapturedFigure[] = []
  // The fake axis maps a price straight to a pixel; the text formatters are the
  // identity so the assertions only cover placement and gating.
  const yAxis = {
    isInCandle: () => true,
    isFromZero: () => false,
    getRange: () => ({ from: 0, to: 100 }),
    convertToPixel: (value: number) => pixels.get(value) ?? -1,
    valueToRealValue: (value: number) => value,
    realValueToDisplayValue: (value: number) => value,
    displayValueToText: (value: number, precision: number) => value.toFixed(precision)
  }
  const chartStore = {
    getStyles: () => styles,
    getVisibleRangeHighLowPrice: () => [
      { price: range[0], x: 1 },
      { price: range[1], x: 2 }
    ],
    getSymbol: () => ({ pricePrecision: 2 }),
    getDecimalFold: () => ({ formatPrice: (value: string) => value }),
    getThousandsSeparator: () => ({ format: (value: string) => value })
  }
  const chart = { getChartStore: () => chartStore }
  const pane = { getChart: () => chart, getAxisComponent: () => yAxis }
  const view = Object.assign(Object.create(ViewClass.prototype) as object, {
    getWidget: () => ({ getPane: () => pane, getBounding: () => ({ width: 60, height: 400 }) }),
    createFigure: (create: CapturedFigure) => {
      const figure = { name: create.name, attrs: create.attrs, styles: create.styles }
      figures.push(figure)
      return { draw: () => figure }
    }
  }) as unknown as DrawableView
  view.drawImp({})
  return figures
}

function textOf(figure: CapturedFigure): [string, number] {
  const attrs = figure.attrs as { text: string; y: number }
  return [attrs.text, attrs.y]
}

describe('high/low labels on the price axis', () => {
  it('labels the visible high and low, right aligned at the axis edge', () => {
    const figures = render(
      CandleHighLowAxisLabelView,
      stylesFor(),
      [135, 95],
      new Map([
        [135, 40],
        [95, 360]
      ])
    )
    expect(figures.map((figure) => [figure.name, ...textOf(figure)])).toEqual([
      ['text', '135.00', 40],
      ['text', '95.00', 360]
    ])
    const attrs = figures[0].attrs as { x: number; align: string }
    expect([attrs.x, attrs.align]).toEqual([60, 'right'])
    expect((figures[0].styles as { backgroundColor: string }).backgroundColor).toBe('#929AA5')
  })

  it('draws nothing while the master switch or the text part is off', () => {
    const cases: Array<Partial<FakeStyles['candle']['priceMark']['highLowAxis']>> = [{ show: false }, { text: { show: false } }]
    cases.forEach((overrides) => {
      expect(
        render(
          CandleHighLowAxisLabelView,
          stylesFor(overrides),
          [135, 95],
          new Map([
            [135, 40],
            [95, 360]
          ])
        )
      ).toEqual([])
    })
  })

  it('skips a label that a manual range pushed off screen', () => {
    const figures = render(
      CandleHighLowAxisLabelView,
      stylesFor(),
      [135, 95],
      new Map([
        [135, 900],
        [95, 360]
      ])
    )
    expect(figures.map(textOf)).toEqual([['95.00', 360]])
  })

  it('draws nothing on a close-only series, which has no wick to point at', () => {
    expect(
      render(
        CandleHighLowAxisLabelView,
        stylesFor({}, 'line'),
        [135, 95],
        new Map([
          [135, 40],
          [95, 360]
        ])
      )
    ).toEqual([])
  })

  it('draws a dashed line across the widget at each extreme', () => {
    const figures = render(
      CandleHighLowLineView,
      stylesFor(),
      [135, 95],
      new Map([
        [135, 40],
        [95, 360]
      ])
    )
    expect(figures.map((figure) => [(figure.attrs as { coordinates: unknown[] }).coordinates.length, (figure.attrs as { coordinates: Array<{ y: number }> }).coordinates[0].y])).toEqual([
      [2, 40],
      [2, 360]
    ])
    expect((figures[0].styles as { dashedValue: number[] }).dashedValue).toEqual([4, 4])
  })
})
