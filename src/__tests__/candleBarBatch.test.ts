import { describe, expect, it } from 'vitest'

import type BarSpace from '../common/BarSpace'
import type { VisibleRangeData } from '../common/Data'
import type { MouseTouchEvent } from '../common/EventHandler'
import type { CandleBarColor } from '../common/Styles'
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

const barSpace: BarSpace = { bar: 10, halfBar: 5, gapBar: 8, halfGapBar: 4 }

/** The pane is 100px tall, so price 30 is y 70 and price 70 is y 30. */
function harness(bars: VisibleRangeData[], options: { type?: string; isMain?: boolean; upBorder?: string } = {}): Harness {
  const { type = 'candle_solid', isMain = true, upBorder } = options
  const ops: string[] = []
  const actions: Array<{ type: string; data: unknown }> = []
  const styles = getDefaultStyles()
  styles.candle.type = type as never
  // The default palette draws a border in the body colour, so a case that wants
  // the two apart has to say so.
  if (upBorder !== undefined) {
    styles.candle.bar = { ...(styles.candle.bar as CandleBarColor), upBorderColor: upBorder }
  }

  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    setLineDash: (value: number[]) => ops.push(`dash(${value.join(',')})`),
    beginPath: () => ops.push('begin'),
    rect: (x: number, y: number, width: number, height: number) => ops.push(`rect(${x},${y},${width},${height})`),
    fill: () => ops.push(`fill(${String(ctx.fillStyle)})`),
    stroke: () => ops.push(`stroke(${String(ctx.strokeStyle)})`),
    fillRect: (x: number, y: number, width: number, height: number) => ops.push(`fillRect(${x},${y},${width},${height})`)
  }

  const chartStore = {
    getBarSpace: () => barSpace,
    getVisibleRangeDataList: () => bars,
    executeAction: (action: string, data?: unknown) => actions.push({ type: action, data })
  }
  const chart = { getStyles: () => styles, getChartStore: () => chartStore }
  const pane = {
    getId: () => (isMain ? PaneIdConstants.CANDLE : 'indicator_pane_1'),
    getDefaultYAxisId: () => 'candle',
    getChart: () => chart,
    getAxisComponent: () => ({ convertToPixel: (value: number) => 100 - value })
  }
  const view = new CandleBarView({ getPane: () => pane } as never)
  view.drawImp(ctx as unknown as CanvasRenderingContext2D)
  return { view, ops, actions }
}

function bar(x: number, low: number, high: number, open = low, close = high): VisibleRangeData {
  return { x, data: { prev: null, current: { open, close, high, low, timestamp: x, volume: 1 } } } as unknown as VisibleRangeData
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
