import { describe, expect, it } from 'vitest'

import type BarSpace from '../common/BarSpace'
import type { VisibleRangeData } from '../common/Data'
import type { CandleLineSeriesType } from '../common/Styles'
import { getDefaultStyles } from '../common/Styles'
import CandleLineView from '../view/CandleLineView'

/**
 * `CandleLineView` draws through the figure templates, so a test records the
 * canvas calls: what is asserted is the shape a type puts on screen — the
 * points of the polyline, the fills a band produces, the clips a baseline
 * needs — rather than the pixels.
 */
function draw(type: CandleLineSeriesType, bars: VisibleRangeData[]): string[] {
  const ops: string[] = []
  const styles = getDefaultStyles()
  styles.candle.type = type

  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    setLineDash: () => ops.push('dash'),
    beginPath: () => ops.push('begin'),
    closePath: () => ops.push('close'),
    moveTo: (x: number, y: number) => ops.push(`moveTo(${x},${y})`),
    lineTo: (x: number, y: number) => ops.push(`lineTo(${x},${y})`),
    arc: (x: number, y: number) => ops.push(`arc(${x},${y})`),
    rect: (x: number, y: number, width: number, height: number) => ops.push(`rect(${x},${y},${width},${height})`),
    clip: () => ops.push('clip'),
    fill: () => ops.push(`fill(${String(ctx.fillStyle)})`),
    stroke: () => ops.push(`stroke(${String(ctx.strokeStyle)})`),
    save: () => ops.push('save'),
    restore: () => ops.push('restore'),
    translate: () => ops.push('translate')
  }

  const chartStore = { getBarSpace: () => ({ bar: 10, halfBar: 5, gapBar: 8, halfGapBar: 4 }) as BarSpace, getVisibleRangeDataList: () => bars }
  const chart = { getStyles: () => styles, getChartStore: () => chartStore }
  const pane = {
    getChart: () => chart,
    getAxisComponent: () => ({
      // The pane is 100px tall and the price range is 0..100.
      convertToPixel: (value: number) => 100 - value,
      getRange: () => ({ from: 0, to: 100, realFrom: 0, realTo: 100, range: 100, realRange: 100, displayFrom: 0, displayTo: 100, displayRange: 100 })
    })
  }
  const widget = { getPane: () => pane, getBounding: () => ({ width: 300, height: 100 }) }

  const view = new CandleLineView(widget as never)
  view.drawImp(ctx as unknown as CanvasRenderingContext2D)
  return ops
}

function bar(x: number, close: number, high = close + 5, low = close - 5): VisibleRangeData {
  return { x, data: { prev: null, current: { open: close, close, high, low, timestamp: x, volume: 1 } } } as unknown as VisibleRangeData
}

const points = (ops: string[]): string[] => ops.filter((op) => op.startsWith('moveTo') || op.startsWith('lineTo'))

describe('CandleLineView', () => {
  it('joins the closes with one line', () => {
    const ops = draw('line', [bar(10, 40), bar(20, 60), bar(30, 50)])
    expect(points(ops)).toEqual(['moveTo(10,60)', 'lineTo(20,40)', 'lineTo(30,50)'])
    expect(ops.filter((op) => op.startsWith('stroke('))).toEqual(['stroke(#1677FF)'])
  })

  it('steps: a run at the old price, then a jump to the new one', () => {
    const ops = draw('step_line', [bar(10, 40), bar(20, 60)])
    expect(points(ops)).toEqual(['moveTo(10,60)', 'lineTo(20,60)', 'lineTo(20,40)'])
  })

  it('marks each close when the type asks for it', () => {
    const ops = draw('line_markers', [bar(10, 40), bar(20, 60)])
    expect(ops.filter((op) => op.startsWith('arc('))).toEqual(['arc(10,60)', 'arc(20,40)'])
  })

  it('fills the band above and below the close in the HLC area type', () => {
    const ops = draw('hlc_area', [bar(10, 50, 60, 40), bar(20, 55, 65, 45)])
    expect(ops.filter((op) => op.startsWith('fill('))).toEqual(['fill(rgba(45, 192, 142, 0.2))', 'fill(rgba(249, 40, 85, 0.2))'])
    expect(ops.filter((op) => op.startsWith('stroke('))).toEqual(['stroke(#2DC08E)', 'stroke(#F92855)', 'stroke(#1677FF)'])
  })

  it('clips a baseline into a top half and a bottom half', () => {
    const ops = draw('baseline', [bar(10, 40), bar(20, 60)])
    // Level 50 of a 0..100 range is price 50, which is y 50.
    expect(ops.filter((op) => op === 'clip').length).toBe(2)
    expect(ops.filter((op) => op.startsWith('rect('))).toEqual(['rect(0,0,300,50)', 'rect(0,50,300,50)'])
    expect(ops.filter((op) => op.startsWith('fill('))).toEqual(['fill(rgba(45, 192, 142, 0.2))', 'fill(rgba(249, 40, 85, 0.2))'])
    expect(ops.filter((op) => op.startsWith('stroke('))).toEqual(['stroke(#2DC08E)', 'stroke(#F92855)'])
  })

  it('draws nothing at all when no bar has a close', () => {
    expect(draw('line', [])).toEqual([])
  })
})
