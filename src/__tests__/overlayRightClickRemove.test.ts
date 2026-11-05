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
import OverlayView from '../view/OverlayView'

interface RightClickView {
  _figureMouseRightClickEvent: (overlay: unknown, figureType: string, figureIndex: number, figure: unknown) => (event: unknown) => boolean
}

interface RemoveRig {
  fire: () => boolean
  removeOverlay: ReturnType<typeof vi.fn>
  onRightClick: ReturnType<typeof vi.fn>
}

function removeRig(options: { selected?: boolean; selectedIds?: string[]; ignoreEvent?: boolean; drawing?: boolean; prevent?: boolean } = {}): RemoveRig {
  const removeOverlay = vi.fn()
  const onRightClick = options.prevent === true ? vi.fn((event: { preventDefault: () => void }) => event.preventDefault()) : vi.fn()
  const chartStore = {
    getClickOverlayInfo: () => ({ overlay: options.selected === true ? { id: 'o1' } : null }),
    getSelectedOverlayIds: () => options.selectedIds ?? [],
    removeOverlay
  }
  const chart = { getChartStore: () => chartStore }
  const widget = { getPane: () => ({ getChart: () => chart }) }
  const view = Object.assign(Object.create(OverlayView.prototype) as object, { getWidget: () => widget })
  const overlay = { id: 'o1', isDrawing: () => options.drawing ?? false, onRightClick }
  const figure = options.ignoreEvent === true ? { ignoreEvent: true } : {}
  const fire = (view as unknown as RightClickView)._figureMouseRightClickEvent(overlay, 'point', 0, figure)
  return { fire: () => fire({ x: 0, y: 0 }), removeOverlay, onRightClick }
}

describe('right-click removal of selected drawings', () => {
  it('still removes an unselected drawing hit on an interactive figure', () => {
    const rig = removeRig()
    expect(rig.fire()).toBe(true)
    expect(rig.removeOverlay).toHaveBeenCalledOnce()
  })

  it('does not remove through an event-ignoring label when nothing is selected', () => {
    const rig = removeRig({ ignoreEvent: true })
    expect(rig.fire()).toBe(false)
    expect(rig.removeOverlay).not.toHaveBeenCalled()
  })

  it('removes a selected drawing even through an event-ignoring label', () => {
    const rig = removeRig({ selected: true, ignoreEvent: true })
    expect(rig.fire()).toBe(true)
    expect(rig.removeOverlay).toHaveBeenCalledOnce()
  })

  it('clears a whole marquee selection with one right-click', () => {
    const rig = removeRig({ selected: true, selectedIds: ['o1', 'o2', 'o3'] })
    expect(rig.fire()).toBe(true)
    expect(rig.removeOverlay).toHaveBeenCalledTimes(3)
    expect(rig.removeOverlay.mock.calls.map((call) => call[0])).toEqual([{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }])
  })

  it('keeps the single-drawing path when only one drawing is selected', () => {
    const rig = removeRig({ selected: true, selectedIds: ['o1'] })
    expect(rig.fire()).toBe(true)
    expect(rig.removeOverlay).toHaveBeenCalledOnce()
    expect(rig.removeOverlay.mock.calls[0][0]).toMatchObject({ id: 'o1' })
  })

  it('honours onRightClick preventDefault', () => {
    const rig = removeRig({ selected: true, prevent: true })
    expect(rig.fire()).toBe(true)
    expect(rig.onRightClick).toHaveBeenCalledOnce()
    expect(rig.removeOverlay).not.toHaveBeenCalled()
  })

  it('reports a drawing in progress as unconsumed', () => {
    const rig = removeRig({ selected: true, drawing: true })
    expect(rig.fire()).toBe(false)
  })
})
