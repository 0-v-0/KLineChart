import { describe, expect, it } from 'vitest'

import type BarSpace from '../common/BarSpace'
import type { VisibleRangeData } from '../common/Data'
import type { MouseTouchEvent } from '../common/EventHandler'
import type { FootprintBarData } from '../common/Footprint'
import type { CandleBarColor, CandleFootprintVariant } from '../common/Styles'
import { getDefaultStyles } from '../common/Styles'
import { PaneIdConstants } from '../pane/types'
import CandleBarView from '../view/CandleBarView'

/**
 * The view draws through `RectBatch` and hit-tests its own bars, so a test has
 * to stand in for four things at once: the canvas, the style store, the visible
 * bars and the action the click ends up firing.
 */
interface Harness {
  view: CandleBarView
  ops: string[]
  actions: Array<{ type: string; data: unknown }>
}

interface HarnessOptions {
  type?: string
  isMain?: boolean
  upBorder?: string
  space?: BarSpace
  variant?: CandleFootprintVariant
  /** Footprint rows by bar timestamp. */
  footprint?: Map<number, FootprintBarData>
}

const barSpace: BarSpace = { bar: 10, halfBar: 5, gapBar: 8, halfGapBar: 4 }

/** The pane is 100px tall, so price 30 is y 70 and price 70 is y 30. */
function harness(bars: VisibleRangeData[], options: HarnessOptions = {}): Harness {
  const { type = 'candle_solid', isMain = true, upBorder, variant } = options
  const space = options.space ?? barSpace
  const footprint = options.footprint ?? new Map<number, FootprintBarData>()
  const ops: string[] = []
  const actions: Array<{ type: string; data: unknown }> = []
  const styles = getDefaultStyles()
  styles.candle.type = type as never
  if (variant !== undefined) {
    styles.candle.footprint.variant = variant
  }
  // The default palette draws a border in the body colour, so a case that wants
  // the two apart has to say so.
  if (upBorder !== undefined) {
    styles.candle.bar = { ...(styles.candle.bar as CandleBarColor), upBorderColor: upBorder }
  }

  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: '',
    textBaseline: '',
    globalAlpha: 1,
    setLineDash: (value: number[]) => ops.push(`dash(${value.join(',')})`),
    beginPath: () => ops.push('begin'),
    rect: (x: number, y: number, width: number, height: number) => ops.push(`rect(${x},${y},${width},${height})`),
    fill: () => ops.push(`fill(${String(ctx.fillStyle)})`),
    stroke: () => ops.push(`stroke(${String(ctx.strokeStyle)})`),
    fillRect: (x: number, y: number, width: number, height: number) => ops.push(`fillRect(${x},${y},${width},${height})`),
    strokeRect: (x: number, y: number, width: number, height: number) => ops.push(`strokeRect(${x},${y},${width},${height})`),
    fillText: (text: string, x: number, y: number) => ops.push(`text(${text}@${x},${y})`),
    moveTo: (x: number, y: number) => ops.push(`moveTo(${x},${y})`),
    lineTo: (x: number, y: number) => ops.push(`lineTo(${x},${y})`),
    save: () => ops.push('save'),
    restore: () => ops.push('restore'),
    measureText: (text: string) => ({ width: text.length * 5 })
  }

  const chartStore = {
    getBarSpace: () => space,
    getVisibleRangeDataList: () => bars,
    getFootprint: (data: { timestamp: number }) => footprint.get(data.timestamp) ?? null,
    executeAction: (action: string, data?: unknown) => actions.push({ type: action, data })
  }
  const chart = { getStyles: () => styles, getChartStore: () => chartStore }
  const pane = {
    getId: () => (isMain ? PaneIdConstants.CANDLE : 'indicator_pane_1'),
    getDefaultYAxisId: () => 'candle',
    getChart: () => chart,
    getAxisComponent: () => ({ convertToPixel: (value: number) => 100 - value })
  }
  const view = new CandleBarView({ getPane: () => pane, getBounding: () => ({ width: 300, height: 100 }) } as never)
  view.drawImp(ctx as unknown as CanvasRenderingContext2D)
  return { view, ops, actions }
}

function bar(x: number, low: number, high: number, open = low, close = high, prev: { close: number } | null = null): VisibleRangeData {
  return { x, data: { prev, current: { open, close, high, low, timestamp: x, volume: 1 } } } as unknown as VisibleRangeData
}

const click = (x: number, y: number) => ({ x, y, pageX: x, pageY: y }) as MouseTouchEvent

/** Rects wide and tall enough to skip the batch's small-size branches. */
const upBar = (x: number) => bar(x, 30, 70)

describe('CandleBarView batch', () => {
  it('paints a whole frame in one path per colour, not one per bar', () => {
    const { ops } = harness([upBar(10), upBar(20), upBar(30)])
    // One colour, two depths (wick, body): two fill paths for three bars.
    expect(ops.filter((op) => op.startsWith('fill('))).toEqual(['fill(#2DC08E)', 'fill(#2DC08E)'])
  })

  it('paints the wick below the body, as the per-bar draw did', () => {
    const { ops } = harness([upBar(10)])
    expect(ops.filter((op) => op.startsWith('rect('))).toEqual(['rect(10,30,1,40)', 'rect(6,30,9,40)', 'rect(6.5,30.5,8,39)'])
  })

  it('fills a solid body and strokes a stroked one', () => {
    const solid = harness([upBar(10)], { type: 'candle_solid' })
    expect(solid.ops.filter((op) => op.startsWith('stroke('))).toEqual(['stroke(#2DC08E)'])

    const stroke = harness([upBar(10)], { type: 'candle_stroke' })
    // The wick is still filled; the body is outline only.
    expect(stroke.ops.filter((op) => op.startsWith('fill('))).toEqual(['fill(#2DC08E)'])
    expect(stroke.ops.filter((op) => op.startsWith('stroke('))).toEqual(['stroke(#2DC08E)'])
  })

  it('fills a body too thin to outline instead of stroking nothing', () => {
    // Open and close half a pixel apart, with the wick spanning the row: the
    // body is a 1px sliver, and at that size an outline would vanish.
    const flat = harness([bar(10, 30, 70, 50, 50.5)], { upBorder: '#123456' })
    expect(flat.ops).toContain('fillRect(6,49.5,9,1)')
  })
})

describe('CandleBarView hit test', () => {
  it('claims the click it is on and reports that bar', () => {
    const { view, actions } = harness([upBar(10), upBar(60)])
    expect(view.checkEventOn(click(10, 50))).toBe(true)
    view.onEvent('mouseClickEvent', click(10, 50))
    expect(actions.length).toBe(1)
    expect(actions[0].type).toBe('onCandleBarClick')
    expect((actions[0].data as VisibleRangeData).x).toBe(10)
  })

  it('keeps quiet on the gap between bars', () => {
    const { view, actions } = harness([upBar(10)])
    expect(view.checkEventOn(click(40, 50))).toBe(false)
    view.onEvent('mouseClickEvent', click(40, 50))
    expect(actions).toEqual([])
  })

  it('answers with the bar drawn last where two overlap', () => {
    const { view, actions } = harness([upBar(10), upBar(12)])
    view.checkEventOn(click(12, 50))
    view.onEvent('mouseClickEvent', click(12, 50))
    expect((actions[0].data as VisibleRangeData).x).toBe(12)
  })

  it('does not claim a click on a pane whose bars are not the main ones', () => {
    const { view } = harness([upBar(10)], { isMain: false })
    expect(view.checkEventOn(click(10, 50))).toBe(false)
  })

  it('forgets the last bar once a click misses, so nothing stale fires', () => {
    const { view, actions } = harness([upBar(10)])
    expect(view.checkEventOn(click(10, 50))).toBe(true)
    expect(view.checkEventOn(click(90, 95))).toBe(false)
    view.onEvent('mouseClickEvent', click(90, 95))
    expect(actions).toEqual([])
  })
})

/**
 * A footprint bar keeps a thin OHLC body on its left edge and spends the rest of
 * its width on the volume at each price. The rows below are one 20px price band
 * with three sold and seven bought, which is also an ask imbalance against the
 * row under it — the case that gets a bold number and an outline.
 */
const rows: FootprintBarData = { rowSize: 20, poc: 60, rows: [[60, 3, 7]] }
const withRows = (x: number): Map<number, FootprintBarData> => new Map([[x, rows]])

describe('CandleBarView footprint', () => {
  it('falls back to a solid candle for a bar the host has no rows for', () => {
    const { ops } = harness([upBar(10)], { type: 'footprint' })
    expect(ops).toContain('rect(6,30,9,40)')
    expect(ops.some((op) => op.startsWith('fillRect'))).toBe(false)
  })

  it('falls back for the whole chart while the bars are too narrow to read', () => {
    const { ops } = harness([upBar(10)], { type: 'footprint', space: { bar: 2, halfBar: 1, gapBar: 2, halfGapBar: 1 }, footprint: withRows(10) })
    expect(ops.some((op) => op.startsWith('fillRect'))).toBe(false)
  })

  it('draws the bid and ask columns, the POC and the numbers in a wide bar', () => {
    const { ops } = harness([upBar(100)], { type: 'footprint', space: { bar: 40, halfBar: 20, gapBar: 40, halfGapBar: 20 }, footprint: withRows(100) })
    // The body shrinks to the layout's three pixels, the wick moves with it.
    expect(ops).toContain('rect(81,30,1,40)')
    expect(ops).toContain('rect(80,30,3,40)')
    // Bid then ask, each inset by a pixel, with the POC drawn over both.
    expect(ops).toContain('fillRect(85,20,16,19)')
    expect(ops).toContain('fillRect(102,20,16,19)')
    expect(ops).toContain('strokeRect(85.5,20.5,32,18)')
    expect(ops).toContain('text(3@93.5,30)')
    expect(ops).toContain('text(7@110.5,30)')
  })

  it('gives a narrow footprint bar one delta column instead of two', () => {
    const { ops } = harness([upBar(100)], { type: 'footprint', footprint: withRows(100) })
    // `adaptive` at 8px: one column, holding ask - bid, five pixels wide.
    expect(ops.filter((op) => op.startsWith('fillRect')).length).toBe(1)
    // Even "+4" needs ten pixels, so the number is dropped rather than squeezed.
    expect(ops.some((op) => op.startsWith('text('))).toBe(false)
  })

  it('prints the delta in the delta variant, where the column has room', () => {
    const { ops } = harness([upBar(100)], { type: 'footprint', variant: 'delta', space: { bar: 40, halfBar: 20, gapBar: 40, halfGapBar: 20 }, footprint: withRows(100) })
    expect(ops).toContain('fillRect(85,20,34,19)')
    expect(ops).toContain('text(+4@102.5,30)')
  })

  it('draws the histogram variant as two histograms and a dashed value area', () => {
    const { ops } = harness([upBar(100)], { type: 'footprint', variant: 'histogram', space: { bar: 40, halfBar: 20, gapBar: 40, halfGapBar: 20 }, footprint: withRows(100) })
    expect(ops).toContain('fillRect(86,20,13,19)')
    expect(ops).toContain('fillRect(102,20,18,19)')
    expect(ops).toContain('dash(3,2)')
    expect(ops).toContain('moveTo(86,40.5)')
    expect(ops).toContain('lineTo(160,40.5)')
    // No numbers in this variant, however tall the rows are.
    expect(ops.some((op) => op.startsWith('text('))).toBe(false)
  })
})

describe('CandleBarView column and high-low', () => {
  it('runs a column from the close to the floor of the pane', () => {
    const { ops } = harness([bar(10, 30, 70, 40, 50)], { type: 'column' })
    expect(ops).toContain('rect(6,50,9,50)')
  })

  it('draws a high-low bar as one rect from high to low', () => {
    const { ops } = harness([upBar(10)], { type: 'high_low' })
    expect(ops).toContain('rect(6,30,9,40)')
    // One rect, no wick: the bar is the range itself.
    expect(ops.filter((op) => op.startsWith('rect(')).length).toBe(1)
  })

  it('colours them by the day rather than by open against close', () => {
    // Closing above the open but below the previous close: a down day.
    const down = harness([bar(20, 40, 60, 45, 55, { close: 58 })], { type: 'column' })
    // A candle with the same prices but no body rule reads it as up.
    const up = harness([bar(20, 40, 60, 45, 55, { close: 58 })], { type: 'candle_solid' })
    expect(down.ops).toContain('fill(#F92855)')
    expect(up.ops).toContain('fill(#2DC08E)')
  })
})
