import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import type ChartImp from '../Chart'

// The chart class asks the platform what it is at load time; the dynamic import
// keeps that question answerable in the node test environment.
let ChartCtor: typeof ChartImp

beforeAll(async () => {
  vi.stubGlobal('window', { navigator: { userAgent: 'Linux' }, getComputedStyle: () => ({ backgroundColor: '' }) })
  ChartCtor = (await import('../Chart')).default
})

// `layout()` batches requests into one pass on a microtask, guarded by a
// pending flag. One pass that threw used to leave that flag set and the error
// swallowed: every later request was skipped and the chart stopped painting.
const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function fakeChart(layout: () => void): { layoutPending: () => boolean; request: () => void } {
  // Local dev names the batched options `_layoutUpdateOptions`.
  const self = { _layoutOptions: {}, _layoutUpdateOptions: {}, _layoutPending: false, _layout: layout }
  return {
    layoutPending: () => self._layoutPending,
    request: () => {
      ChartCtor.prototype.layout.call(self as unknown as ChartImp, { update: true })
    }
  }
}

describe('Chart.layout after a pass that throws', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('runs the next pass and reports the error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let fail = true
    const pass = vi.fn(() => {
      if (fail) {
        fail = false
        throw new Error('pass failed')
      }
    })
    const chart = fakeChart(pass)

    chart.request()
    await settle()
    expect(pass).toHaveBeenCalledTimes(1)
    expect(chart.layoutPending()).toBe(false)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('layout'), expect.objectContaining({ message: 'pass failed' }))

    chart.request()
    await settle()
    expect(pass).toHaveBeenCalledTimes(2)
  })
})
