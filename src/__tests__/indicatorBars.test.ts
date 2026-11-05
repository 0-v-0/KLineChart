import { describe, expect, it, vi } from 'vitest'

import { getDefaultStyles } from '../common/Styles'
import type { Indicator } from '../component/Indicator'
import CandleBarView from '../view/CandleBarView'
import IndicatorView from '../view/IndicatorView'

interface FakeRect {
  x: number
  y: number
  width: number
  height: number
}

interface FakeCtx {
  rects: FakeRect[]
  fills: string[]
  save: () => void
  restore: () => void
  beginPath: () => void
  rect: (x: number, y: number, width: number, height: number) => void
  fill: () => void
  fillRect: () => void
  stroke: () => void
  setLineDash: () => void
  fillStyle: string
  strokeStyle: string
  lineWidth: number
  globalCompositeOperation: string
}

function makeCtx(): FakeCtx {
  const ctx: FakeCtx = {
    rects: [],
    fills: [],
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    rect: (x, y, width, height) => {
      ctx.rects.push({ x, y, width, height })
    },
    fill: () => {
      ctx.fills.push(ctx.fillStyle)
    },
    fillRect: () => undefined,
    stroke: () => undefined,
    setLineDash: () => undefined,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    globalCompositeOperation: 'source-over'
  }
  return ctx
}

function indicator(figures: Indicator['figures']): Indicator {
  return {
    id: 'i',
    paneId: 'candle_pane',
    yAxisId: 'a',
    name: 'vol',
    shortName: 'VOL',
    precision: 0,
    zLevel: 0,
    visible: true,
    draw: null,
    shouldOhlc: false,
    shouldFormatBigNumber: false,
    styles: null,
    figures,
    result: [{ v: 40 }, { v: 80 }]
  } as unknown as Indicator
}

function draw(indicators: Indicator[]): { ctx: FakeCtx; figures: number } {
  const ctx = makeCtx()
  const styles = getDefaultStyles()
  // The y axis maps a value to the pixel above it, the x axis a bar to 10px.
  const yAxis = {
    convertToPixel: (value: number) => 100 - value,
    getRange: () => ({ from: 0, to: 100 })
  }
  const xAxis = { convertToPixel: (dataIndex: number) => dataIndex * 10 }
  const chartStore = {
    getStyles: () => styles,
    getIndicatorsByPaneId: () => indicators
  }
  const chart = { getChartStore: () => chartStore, getXAxisPane: () => ({ getXAxisComponent: () => xAxis }) }
  const pane = { getId: () => 'candle_pane', getChart: () => chart, getYAxisComponentById: () => yAxis }
  let figureCount = 0
  const view = Object.assign(Object.create(IndicatorView.prototype) as object, {
    getWidget: () => ({ getPane: () => pane, getBounding: () => ({ width: 100, height: 100 }) }),
    // The candles are the base view's business; only the indicator pass is under test.
    eachChildren: (cb: (data: { dataIndex: number; x: number }, barSpace: { bar: number; halfBar: number; halfGapBar: number; gapBar: number }) => void) => {
      const barSpace = { bar: 10, halfBar: 5, halfGapBar: 4, gapBar: 10 }
      cb({ dataIndex: 0, x: 0 }, barSpace)
      cb({ dataIndex: 1, x: 10 }, barSpace)
    },
    createFigure: () => {
      figureCount++
      return { draw: () => undefined }
    }
  }) as unknown as { drawImp: (ctx: unknown) => void }
  const superDraw = vi.spyOn(CandleBarView.prototype, 'drawImp').mockImplementation(() => undefined)
  view.drawImp(ctx)
  superDraw.mockRestore()
  return { ctx, figures: figureCount }
}

describe('indicator bars', () => {
  it('paints plain filled bars as one batched fill per colour, not as figures', () => {
    const { ctx, figures } = draw([indicator([{ key: 'v', type: 'bar' }])])
    expect(figures).toBe(0)
    // Both bars reach the canvas through the batch, drawn against the base of
    // the range: 40 -> 60px tall from y 60, 80 -> 20px tall from y 20.
    expect(ctx.rects).toEqual([
      { x: -4, y: 60, width: 8, height: 40 },
      { x: 6, y: 20, width: 8, height: 80 }
    ])
    expect(ctx.fills).toHaveLength(1)
  })

  it('leaves a bar that needs a border to the figure path', () => {
    const bar = indicator([{ key: 'v', type: 'bar' }])
    ;(bar as unknown as { styles: Record<string, unknown> }).styles = { bars: [{ style: 'stroke' }] }
    const { ctx, figures } = draw([bar])
    expect(figures).toBe(2)
    expect(ctx.rects).toEqual([])
  })

  it('skips an indicator that draws nothing of its own', () => {
    const { ctx, figures } = draw([indicator([])])
    expect([figures, ctx.rects]).toEqual([0, []])
  })
})
