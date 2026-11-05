/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 * http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, expect, it } from 'vitest'
import type Chart from '../Chart'
import type { AxisRange } from '../component/Axis'
import { getYAxisClass, registerYAxis } from '../extension/y-axis'
import indexed100 from '../extension/y-axis/indexed100'

function axisRange(from: number, to: number): AxisRange {
  return { from, to, range: to - from, realFrom: from, realTo: to, realRange: to - from, displayFrom: from, displayTo: to, displayRange: to - from }
}

function chartWith(closes: number[], realFrom = 0): Chart {
  const bars = closes.map((close, i) => ({ timestamp: i, open: close, high: close + 5, low: close - 5, close, volume: 1 }))
  return {
    getDataList: () => bars,
    getVisibleRange: () => ({ from: 0, to: bars.length, realFrom, realTo: bars.length })
  } as unknown as Chart
}

const { createRange, valueToRealValue, realValueToValue, displayValueToText, minSpan } = indexed100

if (createRange === undefined || valueToRealValue === undefined || realValueToValue === undefined || displayValueToText === undefined || minSpan === undefined) {
  throw new Error('indexed100 is missing a required template member')
}

const makeRange = (chart: Chart, defaultRange: AxisRange): AxisRange => createRange({ chart, paneId: 'candle_pane', defaultRange })

describe('indexed100 y-axis', () => {
  it('is registered as its own axis and unknown names still fall back to normal', () => {
    expect(getYAxisClass('indexed100')).not.toBe(getYAxisClass('normal'))
    expect(getYAxisClass('indexed100')).not.toBe(getYAxisClass('percentage'))
    expect(getYAxisClass('no_such_axis')).toBe(getYAxisClass('normal'))
  })

  it('maps the first visible close to 100 and a double to 200', () => {
    const r = makeRange(chartWith([100, 110, 120, 130]), axisRange(100, 200))
    expect(r.realFrom).toBe(100)
    expect(r.realTo).toBe(200)
    expect(r.displayFrom).toBe(100)
    expect(r.displayTo).toBe(200)
    expect(r.from).toBe(100)
    expect(r.range).toBe(100)
    expect(valueToRealValue(100, { range: r })).toBeCloseTo(100)
    expect(valueToRealValue(200, { range: r })).toBeCloseTo(200)
    expect(realValueToValue(150, { range: r })).toBeCloseTo(150)
  })

  it('prints an index, not a percentage', () => {
    expect(displayValueToText(150, 2)).toBe('150.00')
    expect(displayValueToText(150, 2)).not.toContain('%')
    expect(minSpan(0)).toBe(0.01)
  })

  it('survives a zero or missing base close', () => {
    const defaultRange = axisRange(100, 200)
    expect(makeRange(chartWith([0, 0]), defaultRange)).toBe(defaultRange)
    expect(makeRange(chartWith([]), defaultRange)).toBe(defaultRange)
  })

  it('clamps a view that starts past the end of the data', () => {
    const r = makeRange(chartWith([100, 110, 120, 130], 99), axisRange(100, 200))
    expect(r.realFrom).toBeCloseTo((100 / 130) * 100)
  })

  it('keeps a degenerate range finite', () => {
    const degenerate = axisRange(100, 100)
    expect(valueToRealValue(100, { range: degenerate })).toBe(100)
    expect(realValueToValue(100, { range: degenerate })).toBe(100)
  })

  it('lets a host replace the registration and restores the built-in', () => {
    const builtIn = getYAxisClass('indexed100')
    registerYAxis({ name: 'indexed100', displayValueToText: () => 'custom' })
    expect(getYAxisClass('indexed100')).not.toBe(builtIn)
    registerYAxis(indexed100)
    expect(getYAxisClass('indexed100')).not.toBe(getYAxisClass('normal'))
  })
})
