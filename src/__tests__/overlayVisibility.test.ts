import { describe, expect, it } from 'vitest'

import type Chart from '../Chart'
import type { Overlay } from '../component/Overlay'
import StoreImp from '../Store'

interface CallCounter {
  updates: number
}

function createStore(): { store: StoreImp; calls: CallCounter } {
  const calls: CallCounter = { updates: 0 }
  const chart = {
    layout: () => {
      /* noop */
    },
    updatePane: () => {
      calls.updates += 1
    }
  } as unknown as Chart
  return { store: new StoreImp(chart), calls }
}

function overlay(name: string, visible = true): Overlay {
  return { name, visible } as unknown as Overlay
}

describe('isOverlayShown', () => {
  it('follows the drawing while no resolver is set', () => {
    const { store } = createStore()
    expect(store.isOverlayShown(overlay('segment'))).toBe(true)
    expect(store.isOverlayShown(overlay('segment', false))).toBe(false)
  })

  it('lets the host hide a drawing that is still visible', () => {
    const { store } = createStore()
    store.setOverlayVisibilityResolver((o) => o.name !== 'hidden')
    expect(store.isOverlayShown(overlay('hidden'))).toBe(false)
    expect(store.isOverlayShown(overlay('shown'))).toBe(true)
  })

  it('cannot bring back a drawing that is already hidden', () => {
    const { store } = createStore()
    store.setOverlayVisibilityResolver(() => true)
    expect(store.isOverlayShown(overlay('segment', false))).toBe(false)
  })

  it('does not ask the host about a drawing it already hid itself', () => {
    const { store } = createStore()
    let asked = 0
    store.setOverlayVisibilityResolver(() => {
      asked += 1
      return true
    })
    store.isOverlayShown(overlay('segment', false))
    expect(asked).toBe(0)
    store.isOverlayShown(overlay('segment'))
    expect(asked).toBe(1)
  })

  it('repaints when the resolver is set or cleared', () => {
    const { store, calls } = createStore()
    store.setOverlayVisibilityResolver(() => false)
    expect(calls.updates).toBe(1)
    store.setOverlayVisibilityResolver(null)
    expect(calls.updates).toBe(2)
    // Clearing it puts the drawing back in charge of its own visibility.
    expect(store.isOverlayShown(overlay('segment'))).toBe(true)
  })
})
