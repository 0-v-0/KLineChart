import { describe, expect, it } from 'vitest'

import RectBatch from '../common/RectBatch'

/**
 * A canvas that records the calls instead of painting, so a test can count how
 * many paths a batch cost and in what order the colours changed.
 */
function recorder(): { ctx: CanvasRenderingContext2D; ops: string[] } {
  const ops: string[] = []
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
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops }
}

const box = (x: number, y: number, width = 10, height = 20) => ({ x, y, width, height })

describe('RectBatch', () => {
  it('paints one colour as one path, however many rects it holds', () => {
    const { ctx, ops } = recorder()
    const batch = new RectBatch()
    batch.fill(0, '#ff0000', box(1, 1))
    batch.fill(0, '#ff0000', box(2, 2))
    batch.fill(0, '#ff0000', box(3, 3))
    batch.draw(ctx)
    expect(ops).toEqual(['dash()', 'begin', 'rect(1,1,10,20)', 'rect(2,2,10,20)', 'rect(3,3,10,20)', 'fill(#ff0000)'])
  })

  it('resets the dash and the line width, which the batch owns', () => {
    const { ctx } = recorder()
    ;(ctx as unknown as { setLineDash: (v: number[]) => void }).setLineDash([4, 2])
    const batch = new RectBatch()
    batch.fill(0, '#00ff00', box(0, 0))
    batch.draw(ctx)
    expect(ctx.lineWidth).toBe(1)
  })

  it('reports whether a fill will be painted at all', () => {
    const batch = new RectBatch()
    expect(batch.fill(0, '#ff0000', box(0, 0))).toBe(true)
    expect(batch.fill(0, 'transparent', box(0, 0))).toBe(false)
    expect(batch.fill(0, 'rgba(0, 0, 0, 0)', box(0, 0))).toBe(false)
  })

  it('drops a transparent stroke rather than stroking nothing', () => {
    const { ctx, ops } = recorder()
    const batch = new RectBatch()
    batch.stroke(0, 'transparent', box(0, 0), null)
    batch.draw(ctx)
    expect(ops).toEqual([])
  })

  it('strokes a rect large enough to show a border, inset half a pixel', () => {
    const { ctx, ops } = recorder()
    const batch = new RectBatch()
    batch.stroke(0, '#00ff00', box(10, 20, 10, 20), '#ff0000')
    batch.draw(ctx)
    expect(ops).toEqual(['dash()', 'begin', 'rect(10.5,20.5,9,19)', 'stroke(#00ff00)'])
  })

  it('fills a rect too thin to stroke, so it does not vanish when zoomed out', () => {
    const { ctx, ops } = recorder()
    const batch = new RectBatch()
    batch.stroke(0, '#00ff00', box(0, 0, 2, 2), '#ff0000')
    batch.draw(ctx)
    expect(ops).toEqual(['dash()', 'fillRect(0,0,2,2)'])
    expect(ops.some((op) => op.startsWith('stroke'))).toBe(false)
  })

  it('skips that fallback when the body is already the border colour', () => {
    const { ctx, ops } = recorder()
    const batch = new RectBatch()
    batch.stroke(0, '#00ff00', box(0, 0, 1, 1), '#00ff00')
    batch.draw(ctx)
    expect(ops).toEqual([])
  })

  it('paints fills before strokes inside a layer, and layers in order', () => {
    const { ctx, ops } = recorder()
    const batch = new RectBatch()
    batch.stroke(0, '#00ff00', box(0, 0), '#ff0000')
    batch.fill(0, '#ff0000', box(0, 0))
    batch.fill(1, '#0000ff', box(5, 5))
    batch.draw(ctx)
    expect(ops.filter((op) => op.startsWith('fill(') || op.startsWith('stroke('))).toEqual(['fill(#ff0000)', 'stroke(#00ff00)', 'fill(#0000ff)'])
  })

  it('does nothing at all when no rect was added', () => {
    const { ctx, ops } = recorder()
    new RectBatch().draw(ctx)
    expect(ops).toEqual([])
  })

  it('remembers a colour once, whichever rect asks first', () => {
    const { ctx, ops } = recorder()
    const batch = new RectBatch()
    batch.fill(0, 'rgba(0, 0, 0, 0)', box(0, 0))
    batch.fill(0, 'rgba(0, 0, 0, 0)', box(1, 1))
    batch.draw(ctx)
    expect(ops).toEqual([])
  })
})
