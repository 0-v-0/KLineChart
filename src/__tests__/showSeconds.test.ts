import { beforeAll, describe, expect, it, vi } from 'vitest'

import type ChartImp from '../Chart'
import ChartStore from '../Store'
import type { MouseTouchEvent } from '../common/EventHandler'
import CrosshairVerticalLabelView from '../view/CrosshairVerticalLabelView'

// The chart class asks the platform what it is at load time; the dynamic import
// keeps that question answerable in the node test environment.
let ChartCtor: typeof ChartImp

beforeAll(async () => {
  vi.stubGlobal('window', { navigator: { userAgent: 'Linux' }, getComputedStyle: () => ({ backgroundColor: '' }) })
  ChartCtor = (await import('../Chart')).default
})

/** The format string the vertical crosshair hands to the host's date formatter. */
function labelFormat(type: string, showSeconds: boolean): string {
  let format = ''
  const chartStore = {
    getPeriod: () => ({ type, span: 1 }),
    getShowSeconds: () => showSeconds,
    getInnerFormatter: () => ({
      formatDate: (_timestamp: number, value: string) => {
        format = value
        return ''
      }
    })
  }
  const view = Object.create(CrosshairVerticalLabelView.prototype) as CrosshairVerticalLabelView
  view.getText({ timestamp: 0 } as MouseTouchEvent & { timestamp: number }, chartStore as never)
  return format
}

describe('crosshair time label', () => {
  it('uses a date stamp distinct from the tooltip row', () => {
    expect(labelFormat('minute', false)).toBe("DD MMM 'YY  HH:mm")
    expect(labelFormat('day', false)).toBe("DD MMM 'YY")
    expect(labelFormat('year', false)).toBe('YYYY')
  })

  it('appends seconds to minute and hour labels only when asked', () => {
    expect(labelFormat('minute', true)).toBe("DD MMM 'YY  HH:mm:ss")
    expect(labelFormat('hour', true)).toBe("DD MMM 'YY  HH:mm:ss")
  })

  it('does not append seconds twice to a second period', () => {
    expect(labelFormat('second', true)).toBe("DD MMM 'YY  HH:mm:ss")
  })

  it('leaves a label with no time alone', () => {
    expect(labelFormat('day', true)).toBe("DD MMM 'YY")
    expect(labelFormat('month', true)).toBe("MMM 'YY")
  })
})

describe('showSeconds state', () => {
  it('keeps the flag in the store', () => {
    const store = Object.assign(Object.create(ChartStore.prototype) as object, { _showSeconds: false }) as unknown as ChartStore
    expect(store.getShowSeconds()).toBe(false)
    store.setShowSeconds(true)
    expect(store.getShowSeconds()).toBe(true)
    store.setShowSeconds(false)
    expect(store.getShowSeconds()).toBe(false)
  })

  it('rebuilds the axis ticks when the chart changes it', () => {
    const setShowSeconds = vi.fn()
    const getShowSeconds = vi.fn(() => true)
    const layout = vi.fn()
    const store = { setShowSeconds, getShowSeconds } as unknown as ChartStore
    const chart = Object.assign(Object.create(ChartCtor.prototype) as object, { _chartStore: store, layout }) as unknown as ChartImp
    chart.setShowSeconds(true)
    expect(setShowSeconds).toHaveBeenCalledWith(true)
    expect(layout).toHaveBeenCalledOnce()
    expect(chart.getShowSeconds()).toBe(true)
  })
})
