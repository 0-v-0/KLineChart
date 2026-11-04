import { afterEach, describe, expect, it } from 'vitest'
import { isHitAreaDebug, setDrawingOverlay, setHitAreaDebug } from '../component/Figure'

/**
 * The halo that paints a figure's click tolerance is a development aid with
 * two switches: the global one a host turns on, and the one the overlay view
 * sets around its own draw pass. Only both together paint, which is what keeps
 * candles and indicators — drawn outside that pass — free of halos.
 */
describe('hit area debug', () => {
  afterEach(() => {
    setHitAreaDebug(false)
    setDrawingOverlay(false)
  })

  it('stays off until the host asks for it', () => {
    setDrawingOverlay(true)
    expect(isHitAreaDebug()).toBe(false)
  })

  it('paints inside the overlay draw pass', () => {
    setHitAreaDebug(true)
    expect(isHitAreaDebug()).toBe(false)
    setDrawingOverlay(true)
    expect(isHitAreaDebug()).toBe(true)
    setDrawingOverlay(false)
    expect(isHitAreaDebug()).toBe(false)
  })

  it('goes quiet again when the host turns it off', () => {
    setHitAreaDebug(true)
    setDrawingOverlay(true)
    setHitAreaDebug(false)
    expect(isHitAreaDebug()).toBe(false)
  })
})
