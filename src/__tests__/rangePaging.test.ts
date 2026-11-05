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

import { describe, expect, it, vi } from 'vitest'
import type Chart from '../Chart'
import type { KLineData } from '../common/Data'
import type { DataLoader, DataLoaderGetBarsParams, DataLoaderGetRangeParams } from '../common/DataLoader'
import type { Period } from '../common/Period'
import type { SymbolInfo } from '../common/SymbolInfo'
import StoreImp from '../Store'

const SYMBOL: SymbolInfo = { ticker: 'AAA', pricePrecision: 2, volumePrecision: 0 } as SymbolInfo
const PERIOD: Period = { type: 'hour', span: 1 }

function candle(timestamp: number): KLineData {
  return { timestamp, open: 100, high: 101, low: 99, close: 100, volume: 1000 }
}

function createMockChart(): Chart {
  return {
    layout: () => undefined,
    updatePane: () => undefined
  } as unknown as Chart
}

interface PagingRig {
  store: StoreImp
  calls: DataLoaderGetRangeParams[]
}

/**
 * The init load is resolved manually, and range answers come from `respond`.
 * Range callbacks are synchronous, so a whole paging run finishes before
 * `loadRangeBackward` returns and can be asserted on directly.
 */
function pagingRig(respond: (params: DataLoaderGetRangeParams, call: number) => KLineData[]): PagingRig {
  const store = new StoreImp(createMockChart())
  const calls: DataLoaderGetRangeParams[] = []
  const pending: Array<(data: KLineData[]) => void> = []
  const loader: DataLoader = {
    getBars: (params: DataLoaderGetBarsParams) => {
      if (params.type === 'init') {
        pending.push((data) => params.callback(data, { backward: false, forward: false }))
      }
    },
    subscribeBar: () => undefined,
    unsubscribeBar: () => undefined,
    getRange: (params) => {
      calls.push(params)
      params.callback(respond(params, calls.length))
    }
  }
  store.setSymbol(SYMBOL)
  store.setPeriod(PERIOD)
  store.setDataLoader(loader)
  pending[0]?.([candle(1000)])
  return { store, calls }
}

describe('loadRangeBackward paging', () => {
  it('stops after a single empty page', () => {
    const { store, calls } = pagingRig(() => [])
    const done = vi.fn()
    store.loadRangeBackward(100, 1000, done)
    expect(calls).toHaveLength(1)
    expect(done).toHaveBeenCalledOnce()
    expect(store.getDataList()).toHaveLength(1)
  })

  it('keeps asking for older pages until the range reaches `from`', () => {
    const { store, calls } = pagingRig((params) => [candle(params.to - 200), candle(params.to - 100)])
    const done = vi.fn()
    store.loadRangeBackward(100, 1000, done)
    expect(calls.map((c) => c.to)).toEqual([1000, 800, 600, 400, 200])
    expect(calls.every((c) => c.from === 100)).toBe(true)
    expect(done).toHaveBeenCalledOnce()
    expect(store.getDataList()).toHaveLength(11)
    expect(store.getDataList()[0].timestamp).toBe(0)
  })

  it('stops as soon as one page already covers `from`', () => {
    const { store, calls } = pagingRig(() => [candle(50)])
    const done = vi.fn()
    store.loadRangeBackward(100, 1000, done)
    expect(calls).toHaveLength(1)
    expect(done).toHaveBeenCalledOnce()
    expect(store.getDataList()[0].timestamp).toBe(50)
  })

  it('stops when a page makes no progress', () => {
    const { store, calls } = pagingRig((params) => [candle(params.to + 100)])
    const done = vi.fn()
    store.loadRangeBackward(100, 1000, done)
    expect(calls).toHaveLength(1)
    expect(done).toHaveBeenCalledOnce()
    expect(store.getDataList()).toHaveLength(1)
  })

  it('caps an endless loader at MAX_RANGE_PAGES', () => {
    const { store, calls } = pagingRig((params) => [candle(params.to - 200), candle(params.to - 100)])
    const done = vi.fn()
    store.loadRangeBackward(-1e12, 1000, done)
    expect(calls).toHaveLength(50)
    expect(done).toHaveBeenCalledOnce()
    expect(store.getDataList()).toHaveLength(101)
  })

  it('calls back immediately when there is no range loader', () => {
    const store = new StoreImp(createMockChart())
    const done = vi.fn()
    store.loadRangeBackward(100, 1000, done)
    expect(done).toHaveBeenCalledOnce()
  })
})
