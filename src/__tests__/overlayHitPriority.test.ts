import { describe, expect, it } from 'vitest'

import type Eventful from '../common/Eventful'
import type OverlayImp from '../component/Overlay'
import OverlayView from '../view/OverlayView'

interface Child {
  label: string
}

interface Options {
  /** The drawing whose handles are drawn (single click). */
  selectedId?: string
  /** The drawing under the pointer. */
  hoveredId?: string
  /** Every member of a multi-selection. */
  selectedIds?: string[]
  /** Draw the second pass, the one after the crosshair. */
  aboveCrosshair?: boolean
  /** Painted above the crosshair, so it belongs in the second pass. */
  zLevel?: number
}

/**
 * The real `_drawPass` on a bare object. Canvas painting is replaced by two
 * children per drawing — a shape and a handle — which is all the hit-order
 * bookkeeping looks at. The owners map is the one `createFigure` fills in.
 */
function pass(options: Options = {}): string[] {
  const { selectedId, hoveredId, selectedIds = [], aboveCrosshair = false, zLevel = 0 } = options
  const store = {
    getClickOverlayInfo: () => ({ overlay: selectedId === undefined ? null : { id: selectedId } }),
    getHoverOverlayInfo: () => ({ overlay: hoveredId === undefined ? null : { id: hoveredId } }),
    isOverlayShown: () => true,
    isOverlaySelected: (id: string) => selectedIds.includes(id)
  }
  const overlays = [
    { id: 'a', zLevel },
    { id: 'b', zLevel }
  ] as unknown as OverlayImp[]
  const owners = new WeakMap<Eventful, { overlay: OverlayImp; handle: boolean }>()
  const view = Object.assign(Object.create(OverlayView.prototype) as object, {
    _children: [] as Eventful[],
    _figureOwners: owners,
    _drawingOwner: null,
    getWidget: () => ({ getPane: () => ({ getChart: () => ({ getChartStore: () => store }) }) }),
    getCompleteOverlays: () => overlays,
    getProgressOverlay: () => null,
    _drawOverlay: (_ctx: CanvasRenderingContext2D, overlay: OverlayImp) => {
      for (const handle of [false, true]) {
        const child = { label: `${overlay.id}.${handle ? 'handle' : 'shape'}` } as unknown as Eventful
        const target = view as unknown as { addChild: (c: Eventful) => void }
        target.addChild(child)
        owners.set(child, { overlay, handle })
      }
    }
  }) as unknown as {
    _drawPass: (ctx: CanvasRenderingContext2D, aboveCrosshair: boolean) => void
    getChildren: () => readonly Child[]
  }
  view._drawPass({} as CanvasRenderingContext2D, aboveCrosshair)
  return view.getChildren().map((child) => child.label)
}

describe('overlay hit priority', () => {
  it('hits the last painting first when nothing is selected', () => {
    expect(pass()).toEqual(['a.shape', 'a.handle', 'b.shape', 'b.handle'])
  })

  it("raises only the selected drawing's handle, not its body", () => {
    expect(pass({ selectedId: 'a' })).toEqual(['a.shape', 'b.shape', 'b.handle', 'a.handle'])
  })

  it('raises every member of a multi-selection', () => {
    expect(pass({ selectedId: 'a', selectedIds: ['a', 'b'] })).toEqual(['a.shape', 'b.shape', 'a.handle', 'b.handle'])
  })

  it('lets the hovered handle beat the selected one', () => {
    expect(pass({ selectedId: 'a', hoveredId: 'b' })).toEqual(['a.shape', 'b.shape', 'a.handle', 'b.handle'])
  })

  it('does not raise a drawing that is neither selected nor hovered', () => {
    expect(pass({ selectedId: 'a', hoveredId: 'a' })).toEqual(['a.shape', 'b.shape', 'b.handle', 'a.handle'])
  })

  it('leaves a plain overlay out of the pass above the crosshair', () => {
    expect(pass({ selectedId: 'a', aboveCrosshair: true })).toEqual([])
  })

  it('keeps a high-zLevel drawing in the second pass, with its hit order', () => {
    expect(pass({ selectedId: 'a', aboveCrosshair: true, zLevel: 1000 })).toEqual(['a.shape', 'b.shape', 'b.handle', 'a.handle'])
  })
})
