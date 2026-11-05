import { describe, expect, it, vi } from 'vitest'

import OverlayView from '../view/OverlayView'

interface MiddleClickView {
  _figureMouseMiddleClickEvent: (overlay: unknown, figure: unknown) => (event: unknown) => boolean
}

interface MiddleRig {
  fire: () => boolean
  onMiddleClick: ReturnType<typeof vi.fn>
  removeOverlay: ReturnType<typeof vi.fn>
}

function middleRig(options: { ignoreEvent?: boolean; drawing?: boolean; handler?: boolean } = {}): MiddleRig {
  const removeOverlay = vi.fn()
  const onMiddleClick = vi.fn()
  const chartStore = { removeOverlay }
  const chart = { getChartStore: () => chartStore }
  const widget = { getPane: () => ({ getChart: () => chart }) }
  const view = Object.assign(Object.create(OverlayView.prototype) as object, { getWidget: () => widget })
  const overlay = {
    id: 'o1',
    isDrawing: () => options.drawing ?? false,
    onMiddleClick: options.handler === false ? null : onMiddleClick
  }
  const figure = options.ignoreEvent === true ? { ignoreEvent: 'onMiddleClick' } : { type: 'line' }
  const fire = (view as unknown as MiddleClickView)._figureMouseMiddleClickEvent(overlay, figure)
  return { fire: () => fire({ x: 12, y: 34 }), onMiddleClick, removeOverlay }
}

describe('middle-click on a drawing', () => {
  it('reports the click to the overlay callback and consumes it', () => {
    const rig = middleRig()
    expect(rig.fire()).toBe(true)
    expect(rig.onMiddleClick).toHaveBeenCalledOnce()
    expect(rig.onMiddleClick.mock.calls[0][0]).toMatchObject({ overlay: { id: 'o1' }, x: 12, y: 34 })
  })

  it('leaves removal to the host: the engine deletes nothing', () => {
    const rig = middleRig()
    rig.fire()
    expect(rig.removeOverlay).not.toHaveBeenCalled()
  })

  it('ignores the middle click on a figure that opts out of it', () => {
    const rig = middleRig({ ignoreEvent: true })
    expect(rig.fire()).toBe(false)
    expect(rig.onMiddleClick).not.toHaveBeenCalled()
  })

  it('is not consumed when the overlay has no middle-click handler', () => {
    const rig = middleRig({ handler: false })
    expect(rig.fire()).toBe(false)
  })

  it('reports a drawing in progress as unconsumed', () => {
    const rig = middleRig({ drawing: true })
    expect(rig.fire()).toBe(false)
    expect(rig.onMiddleClick).toHaveBeenCalledOnce()
  })
})
