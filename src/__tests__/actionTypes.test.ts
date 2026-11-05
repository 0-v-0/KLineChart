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
import type { ActionType } from '../common/Action'
import StoreImp from '../Store'

// Compile-time contract: both W5 action names must be accepted everywhere an
// ActionType is expected, including Chart.executeAction and Store.executeAction.
const Y_AXIS_ACTIONS: ActionType[] = ['onYAxisRightClick', 'onYAxisAutoScaleRelease']

function chartAccepts(chart: Chart, type: ActionType): void {
  chart.executeAction(type, {} as never)
}

function storeAccepts(store: StoreImp, type: ActionType): void {
  store.executeAction(type)
}

function chartStub(): Chart {
  return { executeAction: () => undefined } as unknown as Chart
}

describe('y-axis action types', () => {
  it('are part of the public ActionType union', () => {
    expect(Y_AXIS_ACTIONS).toEqual(['onYAxisRightClick', 'onYAxisAutoScaleRelease'])
  })

  it('are accepted by both executeAction surfaces', () => {
    const chart = chartStub()
    const store = new StoreImp({ layout: () => undefined, updatePane: () => undefined } as unknown as Chart)
    for (const type of Y_AXIS_ACTIONS) {
      chartAccepts(chart, type)
      storeAccepts(store, type)
    }
  })

  it('dispatch to subscribers with their payload', () => {
    const store = new StoreImp({ layout: () => undefined, updatePane: () => undefined } as unknown as Chart)
    const received: Array<{ type: ActionType; data: unknown }> = []
    for (const type of Y_AXIS_ACTIONS) {
      store.subscribeAction(type, (data) => {
        received.push({ type, data })
      })
    }
    for (const type of Y_AXIS_ACTIONS) {
      store.executeAction(type, { paneId: 'candle_pane', type })
    }
    expect(received).toHaveLength(2)
    expect(received[0].type).toBe('onYAxisRightClick')
    expect(received[1].type).toBe('onYAxisAutoScaleRelease')
    expect(received[0].data).toEqual({ paneId: 'candle_pane', type: 'onYAxisRightClick' })
    expect(received[1].data).toEqual({ paneId: 'candle_pane', type: 'onYAxisAutoScaleRelease' })
  })

  it('can be unsubscribed without affecting the other action', () => {
    const store = new StoreImp({ layout: () => undefined, updatePane: () => undefined } as unknown as Chart)
    const rightClick = vi.fn()
    const release = vi.fn()
    store.subscribeAction('onYAxisRightClick', rightClick)
    store.subscribeAction('onYAxisAutoScaleRelease', release)
    store.unsubscribeAction('onYAxisRightClick', rightClick)
    store.executeAction('onYAxisRightClick', undefined)
    store.executeAction('onYAxisAutoScaleRelease', undefined)
    expect(rightClick).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledOnce()
  })
})
