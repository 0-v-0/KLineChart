import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { AxisTick } from '../component/Axis'
import XAxisImp from '../component/XAxis'

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

const MINUTE = 60_000
// 23:00 on New Year's Eve: the series crosses a year, a day and hours, so the
// axis has several weights to rank.
const BASE = Date.UTC(2024, 11, 31, 23, 0, 0)
const BAR_COUNT = 240

interface TickAxis {
  createTicksImp: () => AxisTick[]
}

function createAxis(showSeconds: boolean): TickAxis {
  const dataList: Array<{ timestamp: number }> = []
  for (let i = 0; i < BAR_COUNT; i++) {
    dataList.push({ timestamp: BASE + i * MINUTE })
  }
  const chartStore = {
    getVisibleRange: () => ({ realFrom: 0, realTo: BAR_COUNT }),
    // The template itself is the text, so the assertions read the format used.
    getInnerFormatter: () => ({ formatDate: (_timestamp: number, template: string) => template }),
    getDateTimeFormat: () =>
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }),
    getPeriod: () => ({ type: 'minute', span: 1 }),
    getBarSpace: () => ({ bar: 8 }),
    getStyles: () => ({ xAxis: { tickText: { size: 12, weight: 'normal', family: 'Arial' } } }),
    getDataList: () => dataList,
    dataIndexToTimestamp: (index: number) => dataList[index]?.timestamp ?? null,
    getShowSeconds: () => showSeconds
  }
  const pane = { getChart: () => ({ getChartStore: () => chartStore }) }
  return Object.assign(Object.create(XAxisImp.prototype) as object, {
    _timeTickSourceCache: null,
    _timeTickCache: null,
    getParent: () => pane,
    getRange: () => ({ from: 0, to: BAR_COUNT, realFrom: 0, realTo: BAR_COUNT }),
    getBounding: () => ({ width: 600, height: 20 }),
    convertToPixel: (dataIndex: number) => dataIndex * 8
  }) as unknown as TickAxis
}

describe('time axis tick labels', () => {
  it('labels minutes without seconds by default', () => {
    const ticks = createAxis(false).createTicksImp()
    expect(ticks.map((tick) => tick.text)).toContain('HH:mm')
    expect(ticks.map((tick) => tick.text)).not.toContain('HH:mm:ss')
  })

  it('puts seconds on every time label when they are shown', () => {
    const ticks = createAxis(true).createTicksImp()
    const minuteLabels = ticks.filter((tick) => tick.text.startsWith('HH:mm'))
    expect(minuteLabels.length).toBeGreaterThan(0)
    expect(minuteLabels.every((tick) => tick.text === 'HH:mm:ss')).toBe(true)
  })

  it('draws only the heaviest boundary on screen bold', () => {
    const ticks = createAxis(false).createTicksImp()
    const bold = ticks.filter((tick) => tick.bold === true)
    expect(bold.length).toBeGreaterThan(0)
    expect(bold.length).toBeLessThan(ticks.length)
    // The year label is the heaviest boundary the window has.
    expect(bold.every((tick) => tick.text === 'YYYY')).toBe(true)
  })
})
