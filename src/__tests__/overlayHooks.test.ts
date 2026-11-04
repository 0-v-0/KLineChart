import { describe, expect, it } from 'vitest'
import type Coordinate from '../common/Coordinate'
import OverlayImp, { type OverlayTemplate } from '../component/Overlay'

/**
 * The view calls a tool's hooks off the overlay *instance*: `completeDrawing`
 * when a drawing finishes, `createExtraHandles` / `handleCursor` while it is
 * drawn, `moveExtraHandle` while a handle is dragged. A hook that failed to
 * reach the instance would not throw — `overlay.moveExtraHandle?.(...)` just
 * does nothing — so the contract is pinned here rather than discovered as a
 * handle that will not move.
 */

const hooks: OverlayTemplate = {
  name: 'hookProbe',
  totalStep: 2,
  completeDrawing: (): void => {
    /* no-op */
  },
  createExtraHandles: (): Array<{ x: number; y: number }> => [{ x: 1, y: 2 }],
  handleCursor: (): string => 'nwse-resize',
  moveExtraHandle: (): void => {
    /* no-op */
  },
  editTextOnCreate: true
}

describe('overlay template hooks', () => {
  it('carries every hook onto the instance the view holds', () => {
    const overlay = new (OverlayImp.extend(hooks))()
    expect(overlay.completeDrawing).toBe(hooks.completeDrawing)
    expect(overlay.createExtraHandles).toBe(hooks.createExtraHandles)
    expect(overlay.handleCursor).toBe(hooks.handleCursor)
    expect(overlay.moveExtraHandle).toBe(hooks.moveExtraHandle)
    expect(overlay.editTextOnCreate).toBe(true)
  })

  it('leaves the hooks callable in the shape the view calls them', () => {
    const overlay = new (OverlayImp.extend(hooks))()
    const coordinates: Coordinate[] = [{ x: 0, y: 0 }]
    expect(overlay.createExtraHandles?.({ overlay, coordinates })).toEqual([{ x: 1, y: 2 }])
    expect(overlay.handleCursor?.({ overlay, coordinates, index: 0 })).toBe('nwse-resize')
    expect(() => overlay.moveExtraHandle?.({ overlay, index: 0, coordinate: { x: 0, y: 0 }, coordinates, toPoint: () => ({}) })).not.toThrow()
  })

  it('defaults to no hooks, so the view calls are no-ops for a plain tool', () => {
    const overlay = new (OverlayImp.extend({ name: 'plainProbe', totalStep: 2 }))()
    expect(overlay.completeDrawing).toBeNull()
    expect(overlay.createExtraHandles).toBeNull()
    expect(overlay.handleCursor).toBeNull()
    expect(overlay.moveExtraHandle).toBeNull()
    expect(overlay.editTextOnCreate).toBe(false)
  })
})
