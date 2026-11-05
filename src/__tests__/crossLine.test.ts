import { describe, expect, it } from 'vitest'

import type { OverlayCreateFiguresCallbackParams } from '../component/Overlay'
import crossLine from '../extension/overlay/crossLine'

interface Params {
  extendData?: Record<string, unknown>
  value?: number
  timestamp?: number
}

/** The callback params these templates read, with a price axis two decimals wide. */
function params({ extendData = {}, value = 105.5, timestamp = 1_760_000_000_000 }: Params = {}): OverlayCreateFiguresCallbackParams<unknown> {
  const chart = {
    getChartStore: () => ({
      getInnerFormatter: () => ({ formatDate: (at: number, template: string) => `date:${at}:${template}` })
    }),
    getSymbol: () => ({ pricePrecision: 2 }),
    getThousandsSeparator: () => ({ format: (text: string) => text }),
    getDecimalFold: () => ({ formatPrice: (text: string) => text })
  }
  const overlay = { id: 'o1', points: [{ timestamp, value }], extendData }
  const yAxis = { isFromZero: () => false, displayValueToText: (v: number, precision: number) => v.toFixed(precision) }
  return {
    chart,
    overlay,
    coordinates: [{ x: 50, y: 60 }],
    bounding: { width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300 },
    xAxis: null,
    yAxis
  } as unknown as OverlayCreateFiguresCallbackParams<unknown>
}

describe('the cross line', () => {
  it('draws a horizontal and a vertical line through its point', () => {
    const figures = crossLine().createPointFigures?.(params()) as Array<{ type: string; attrs: Array<{ coordinates: unknown[] }> }>
    expect(figures).toHaveLength(1)
    expect(figures[0].type).toBe('line')
    expect(figures[0].attrs[0].coordinates).toEqual([
      { x: 0, y: 60 },
      { x: 400, y: 60 }
    ])
    expect(figures[0].attrs[1].coordinates).toEqual([
      { x: 50, y: 0 },
      { x: 50, y: 300 }
    ])
  })

  it('tags the axis with the price and the time, as TV does by default', () => {
    const template = crossLine()
    const priceTag = template.createYAxisFigures?.(params()) as Array<{ attrs: { text: string } }>
    const timeTag = template.createXAxisFigures?.(params()) as Array<{ attrs: { text: string } }>
    expect(priceTag[0].attrs.text).toBe('105.50')
    expect(timeTag[0].attrs.text).toBe('date:1760000000000:YYYY-MM-DD HH:mm')
  })

  it('drops a tag its own switch turns off, and only that one', () => {
    const template = crossLine()
    const noPrice = { extendData: { showPriceLabels: false } }
    const noTime = { extendData: { showTimeLabel: false } }
    expect(template.createYAxisFigures?.(params(noPrice))).toEqual([])
    expect((template.createXAxisFigures?.(params(noPrice)) as unknown[]).length).toBe(1)
    expect(template.createXAxisFigures?.(params(noTime))).toEqual([])
    expect((template.createYAxisFigures?.(params(noTime)) as unknown[]).length).toBe(1)
  })
})
