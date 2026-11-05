import { describe, expect, it } from 'vitest'

import type Eventful from '../common/Eventful'
import type { EventName, MouseTouchEvent } from '../common/EventHandler'
import type OverlayImp from '../component/Overlay'
import OverlayView from '../view/OverlayView'

interface Child extends Eventful {
  label: string
}

interface Options {
  /** The drawing whose handles are drawn (single click). */
  selectedId?: string
  /** Children the pointer lands on; a `handle` is one of them. */
  hits?: string[]
  /** Modifiers held down. */
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  /** A tool is being placed, so clicks belong to the view, not its figures. */
  drawing?: boolean
}

interface Result {
  /** `overlay:event` for every figure that was dispatched to. */
  dispatched: string[]
  /** Whether the view's own click callback ran. */
  viewCallback: number
}

const IDS = ['a', 'b', 'c']

/**
 * The real `dispatchEvent` and `_cycleSelection` on a bare object: three
 * overlapping drawings, one body figure each, plus handles that a raised hit
 * order would put last. A child only answers when the pointer is on it, which
 * is what `checkEventOn` does for a real figure.
 */
function click(options: Options = {}): Result {
  const { selectedId, hits = ['a.body', 'b.body', 'c.body'], metaKey, ctrlKey, shiftKey, drawing = false } = options
  const overlays = IDS.map((id) => ({ id })) as unknown as OverlayImp[]
  const byId = new Map(overlays.map((overlay) => [overlay.id, overlay]))
  const owners = new WeakMap<Eventful, { overlay: OverlayImp; handle: boolean }>()
  const dispatched: string[] = []
  let viewCallback = 0

  const children: Child[] = []
  for (const id of IDS) {
    for (const part of ['body', 'handle']) {
      const label = `${id}.${part}`
      const child = {
        label,
        checkEventOn: () => hits.includes(label),
        dispatchEvent: (name: EventName, event: MouseTouchEvent) => {
          if (!child.checkEventOn(event)) {
            return false
          }
          dispatched.push(`${label}:${name}`)
          return true
        }
      } as unknown as Child
      children.push(child)
      owners.set(child, { overlay: byId.get(id) as OverlayImp, handle: part === 'handle' })
    }
  }

  const store = {
    isOverlayDrawing: () => drawing,
    getClickOverlayInfo: () => ({ overlay: selectedId === undefined ? null : (byId.get(selectedId) ?? null) })
  }
  const callbacks = new Map<EventName, () => boolean>()
  callbacks.set('mouseClickEvent', () => {
    viewCallback++
    return true
  })
  const view = Object.assign(Object.create(OverlayView.prototype) as object, {
    _children: children,
    _callbacks: callbacks,
    _figureOwners: owners,
    getWidget: () => ({ getPane: () => ({ getChart: () => ({ getChartStore: () => store }) }) }),
    getCompleteOverlays: () => overlays
  }) as unknown as { dispatchEvent: (name: EventName, event: MouseTouchEvent) => boolean }

  const event = { x: 10, y: 10, metaKey, ctrlKey, shiftKey } as MouseTouchEvent
  view.dispatchEvent('mouseClickEvent', event)
  return { dispatched, viewCallback }
}

describe('cycle selection through overlapping drawings', () => {
  it('lets the topmost drawing take a plain click with nothing selected', () => {
    expect(click().dispatched).toEqual(['c.body:mouseClickEvent'])
  })

  it('does not cycle when only one drawing is under the pointer', () => {
    expect(click({ selectedId: 'a', hits: ['a.body'] }).dispatched).toEqual(['a.body:mouseClickEvent'])
  })

  it('selects the drawing below the selected one', () => {
    expect(click({ selectedId: 'c' }).dispatched).toEqual(['b.body:mouseClickEvent'])
  })

  it('wraps from the bottom of the stack back to the top', () => {
    expect(click({ selectedId: 'a' }).dispatched).toEqual(['c.body:mouseClickEvent'])
  })

  it('walks the middle of the stack downwards', () => {
    expect(click({ selectedId: 'b' }).dispatched).toEqual(['a.body:mouseClickEvent'])
  })

  it('leaves a click that misses the selected drawing alone', () => {
    expect(click({ selectedId: 'c', hits: ['a.body', 'b.body'] }).dispatched).toEqual(['b.body:mouseClickEvent'])
  })

  it('leaves a click that lands on a handle alone', () => {
    expect(click({ selectedId: 'c', hits: ['a.body', 'b.body', 'c.body', 'c.handle'] }).dispatched).toEqual(['c.handle:mouseClickEvent'])
  })

  it('leaves a Cmd-click alone, since that extends the selection', () => {
    expect(click({ selectedId: 'c', metaKey: true }).dispatched).toEqual(['c.body:mouseClickEvent'])
  })

  it('leaves a Ctrl-click alone', () => {
    expect(click({ selectedId: 'c', ctrlKey: true }).dispatched).toEqual(['c.body:mouseClickEvent'])
  })

  it('leaves a Shift-click alone', () => {
    expect(click({ selectedId: 'c', shiftKey: true }).dispatched).toEqual(['c.body:mouseClickEvent'])
  })

  it('sends a click to the view, not the figures, while a tool is being drawn', () => {
    const result = click({ selectedId: 'c', drawing: true })
    expect(result.dispatched).toEqual([])
    expect(result.viewCallback).toBe(1)
  })
})
