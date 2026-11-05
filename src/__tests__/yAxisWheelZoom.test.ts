import { beforeAll, describe, expect, it, vi } from 'vitest'

import type EventImp from '../Event'
import type { MouseTouchEvent } from '../common/EventHandler'
import { yAxisWheelRangeFactor } from '../common/utils/yAxisWheelZoom'
import { WidgetNameConstants } from '../widget/types'

let EventCtor: typeof EventImp

beforeAll(async () => {
  vi.stubGlobal('window', { navigator: { userAgent: 'Linux' } })
  EventCtor = (await import('../Event')).default
})

describe('yAxisWheelRangeFactor', () => {
  it('narrows the range when the wheel goes up and widens it when it goes down', () => {
    expect(yAxisWheelRangeFactor(1)).toBeCloseTo(0.9)
    expect(yAxisWheelRangeFactor(-1)).toBeCloseTo(1 / 0.9)
  })

  it('is neutral at zero and cancels opposite notches', () => {
    expect(yAxisWheelRangeFactor(0)).toBe(1)
    expect(yAxisWheelRangeFactor(0.4) * yAxisWheelRangeFactor(-0.4)).toBeCloseTo(1)
  })
})

interface WheelRig {
  handler: EventImp
  zoomYAxis: ReturnType<typeof vi.fn>
  setRange: ReturnType<typeof vi.fn>
}

function wheelRig(useRealZoom = false): WheelRig {
  const zoomYAxis = vi.fn()
  const setRange = vi.fn()
  const range = {
    from: 0,
    to: 100,
    range: 100,
    realFrom: 0,
    realTo: 100,
    realRange: 100,
    displayFrom: 0,
    displayTo: 100,
    displayRange: 100
  }
  const axis = {
    scrollZoomEnabled: true,
    getRange: () => range,
    valueToRealValue: (value: number) => value,
    realValueToDisplayValue: (value: number) => value,
    setRange
  }
  const widget = {
    getName: () => WidgetNameConstants.Y_AXIS,
    getBounding: () => ({ left: 0, top: 0, width: 100, height: 50 })
  }
  const extras: Record<string, unknown> = {
    _chart: { layout: () => undefined },
    _findWidgetByEvent: () => ({ widget, pane: null }),
    _getYAxisByWidget: () => axis,
    _getYAxisScaleTargetByWidget: () => axis,
    _syncManualYAxesValueRange: () => undefined,
    _zoomYAxis: zoomYAxis
  }
  if (useRealZoom) {
    delete extras._zoomYAxis
  }
  const handler = Object.assign(Object.create(EventCtor.prototype) as object, extras) as unknown as EventImp
  return { handler, zoomYAxis, setRange }
}

describe('y-axis wheel zoom', () => {
  it('passes the exponential factor to the range zoom', () => {
    const { handler, zoomYAxis } = wheelRig()
    handler.mouseWheelVertEvent({ x: 10, y: 20 } as MouseTouchEvent, 1)
    expect(zoomYAxis).toHaveBeenCalledTimes(1)
    expect(zoomYAxis.mock.calls[0][1]).toBeCloseTo(0.9)
  })

  it('widens the range when the wheel goes down', () => {
    const { handler, zoomYAxis } = wheelRig()
    handler.mouseWheelVertEvent({ x: 10, y: 20 } as MouseTouchEvent, -1)
    expect(zoomYAxis.mock.calls[0][1]).toBeCloseTo(1 / 0.9)
  })

  it('zooms in on the price axis when the wheel goes up', () => {
    const { handler, setRange } = wheelRig(true)
    expect(handler.mouseWheelVertEvent({ x: 10, y: 20 } as MouseTouchEvent, 1)).toBe(true)
    expect(setRange).toHaveBeenCalledTimes(1)
    const next = setRange.mock.calls[0][0] as { range: number }
    expect(next.range).toBeLessThan(100)
    expect(next.range).toBeCloseTo(90)
  })

  it('ignores the wheel when axis zoom is disabled', () => {
    const { handler, zoomYAxis } = wheelRig()
    Object.assign(handler, { _getYAxisByWidget: () => ({ scrollZoomEnabled: false }) })
    expect(handler.mouseWheelVertEvent({ x: 10, y: 20 } as MouseTouchEvent, 1)).toBe(false)
    expect(zoomYAxis).not.toHaveBeenCalled()
  })
})
