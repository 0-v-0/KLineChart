import { beforeAll, describe, expect, it, vi } from 'vitest'

import type ChartImp from '../Chart'
import ChartStore from '../Store'

// The chart class pulls in the DOM-facing views, which ask the platform what it
// is at load time. Nothing here needs a DOM beyond that answer, so it is stubbed
// and the class imported afterwards — `beforeAll`, not the module body.
let ChartCtor: typeof ChartImp

beforeAll(async () => {
  vi.stubGlobal('window', { navigator: { userAgent: 'Linux' } })
  ChartCtor = (await import('../Chart')).default
})

interface Rig {
  chart: ChartImp
  store: ChartStore
  overlay: { id: string; onDeselected: ReturnType<typeof vi.fn> }
  onDeselected: ReturnType<typeof vi.fn>
  updatePane: ReturnType<typeof vi.fn>
  executeAction: ReturnType<typeof vi.fn>
}

/**
 * The real Store bookkeeping on a bare object: the selection lives in a set and
 * a clicked-overlay record, neither of which needs a canvas or a pane.
 */
function createRig(selected: string[] = ['a']): Rig {
  const onDeselected = vi.fn()
  const overlay = { id: 'a', onDeselected }
  const updatePane = vi.fn()
  const executeAction = vi.fn()
  const store = Object.assign(Object.create(ChartStore.prototype) as object, {
    _chart: { updatePane },
    _clickOverlayInfo: { paneId: 'candle_pane', overlay, figureType: 'line', figureIndex: 0, figure: null },
    // A deselect also checks for a leftover touch hover, and a stale one
    // triggers a re-sort because hover is a sort key.
    _hoverOverlayInfo: { paneId: 'candle_pane', overlay: null, figureType: 'none', figureIndex: -1, figure: null },
    _overlays: new Map(),
    _selectedOverlayIds: new Set(selected),
    executeAction
  }) as unknown as ChartStore
  const chart = Object.assign(Object.create(ChartCtor.prototype) as object, { _chartStore: store }) as unknown as ChartImp
  return { chart, store, overlay, onDeselected, updatePane, executeAction }
}

describe('clearOverlaySelection', () => {
  it('drops the clicked drawing and fires its onDeselected', () => {
    const { chart, store, overlay, onDeselected } = createRig()
    chart.clearOverlaySelection()
    expect(store.getClickOverlayInfo().overlay).toBeNull()
    expect(onDeselected).toHaveBeenCalledWith(expect.objectContaining({ chart, overlay }))
  })

  it('empties the selection set and repaints', () => {
    const { chart, store, updatePane } = createRig()
    chart.clearOverlaySelection()
    expect(store.getSelectedOverlayIds()).toEqual([])
    expect(updatePane).toHaveBeenCalled()
  })

  it('says nothing when nothing was selected', () => {
    const { chart, store, executeAction } = createRig([])
    store.setClickOverlayInfo(
      { paneId: 'candle_pane', overlay: null, figureType: 'none', figureIndex: -1, figure: null },
      () => false,
      () => true
    )
    executeAction.mockClear()
    chart.clearOverlaySelection()
    expect(executeAction).not.toHaveBeenCalled()
  })
})

describe('setSelectedOverlayIds', () => {
  it('holds a copy of the ids it was given', () => {
    const { store } = createRig([])
    const ids = ['a', 'b']
    store.setSelectedOverlayIds(ids)
    ids.push('c')
    expect(store.getSelectedOverlayIds()).toEqual(['a', 'b'])
  })

  it('hands out a copy, so a caller cannot edit the selection behind its back', () => {
    const { store } = createRig([])
    store.setSelectedOverlayIds(['a'])
    store.getSelectedOverlayIds().push('b')
    expect(store.isOverlaySelected('b')).toBe(false)
  })

  it('repaints and announces once, even for a repeated set', () => {
    const { store, updatePane, executeAction } = createRig([])
    store.setSelectedOverlayIds(['a', 'b'])
    expect(updatePane).toHaveBeenCalledTimes(1)
    expect(executeAction).toHaveBeenCalledWith('onSelectedOverlaysChange', ['a', 'b'])
    // Same members in a different order is the same selection.
    store.setSelectedOverlayIds(['b', 'a'])
    expect(updatePane).toHaveBeenCalledTimes(1)
    expect(executeAction).toHaveBeenCalledTimes(1)
  })
})

describe('toggleSelectedOverlayId', () => {
  it('adds a drawing that was not in the set', () => {
    const { store } = createRig(['a'])
    store.toggleSelectedOverlayId('b')
    expect(store.getSelectedOverlayIds()).toEqual(['a', 'b'])
  })

  it('takes one out that was', () => {
    const { store } = createRig(['a', 'b'])
    store.toggleSelectedOverlayId('a')
    expect(store.getSelectedOverlayIds()).toEqual(['b'])
  })

  it('announces the change every time, since every call is a user gesture', () => {
    const { store, executeAction } = createRig(['a'])
    store.toggleSelectedOverlayId('a')
    store.toggleSelectedOverlayId('a')
    expect(executeAction).toHaveBeenCalledTimes(2)
  })
})
