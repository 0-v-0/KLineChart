import { describe, expect, it, vi } from 'vitest'

import OverlayImp, { type OverlayPerformEventParams, type OverlayTemplate } from '../component/Overlay'
import type Point from '../common/Point'

interface TemplateOptions {
  name?: string
  totalStep?: number
  moveForDrawing?: (params: OverlayPerformEventParams) => void
  pressedMove?: (params: OverlayPerformEventParams) => void
}

function make(options: TemplateOptions = {}): OverlayImp {
  const template = {
    name: options.name ?? 'testLine',
    totalStep: options.totalStep ?? 3,
    performEventMoveForDrawing: options.moveForDrawing ?? null,
    performEventPressedMove: options.pressedMove ?? null
  } as unknown as OverlayTemplate
  return new OverlayImp(template)
}

function points(count: number): Array<Partial<Point>> {
  const list: Array<Partial<Point>> = []
  for (let i = 0; i < count; i++) {
    list.push({ timestamp: 1000 + i * 60, dataIndex: i, value: 100 + i })
  }
  return list
}

const restore = (overlay: OverlayImp, list: Array<Partial<Point>>): void => {
  overlay.override({ points: list })
}

describe('overlay setPoints', () => {
  it('finishes a variable-length tool as soon as points are supplied', () => {
    const overlay = make({ totalStep: Number.MAX_SAFE_INTEGER })
    restore(overlay, points(3))

    expect(overlay.isDrawing()).toBe(false)
    expect(overlay.points).toHaveLength(3)
  })

  it('finishes a fixed-step tool once the required points are present', () => {
    const overlay = make({ totalStep: 3 })
    restore(overlay, points(2))

    expect(overlay.isDrawing()).toBe(false)
  })

  it('keeps a partially restored fixed-step tool in progress', () => {
    const overlay = make({ totalStep: 4 })
    restore(overlay, points(2))

    expect(overlay.isDrawing()).toBe(true)
    expect(overlay.currentStep).toBe(3)
    expect(overlay.isStart()).toBe(false)
  })

  it('replays one move-for-drawing hook per supplied point when unfinished', () => {
    const moveForDrawing = vi.fn()
    const overlay = make({ totalStep: 4, moveForDrawing })
    restore(overlay, points(2))

    expect(moveForDrawing).toHaveBeenCalledTimes(2)
    expect(moveForDrawing.mock.calls.map((call) => (call[0] as OverlayPerformEventParams).currentStep)).toEqual([2, 3])
    expect(moveForDrawing.mock.calls.map((call) => (call[0] as OverlayPerformEventParams).performPointIndex)).toEqual([0, 1])
  })

  it('replays the full step sequence even when the drawing is finished', () => {
    const moveForDrawing = vi.fn()
    const overlay = make({ totalStep: 3, moveForDrawing })
    restore(overlay, points(2))

    expect(moveForDrawing).toHaveBeenCalledTimes(2)
    expect(moveForDrawing.mock.calls[1][0].performPoint).toBe(overlay.points[1])
  })

  it('lets the replay rebuild derived geometry', () => {
    const overlay = make({
      totalStep: 4,
      moveForDrawing: ({ currentStep, points: list, performPoint }) => {
        if (currentStep === 2) {
          list[0].dataIndex = (performPoint.dataIndex ?? 0) + 100
        }
      }
    })
    restore(overlay, points(2))

    expect(overlay.points[0].dataIndex).toBe(100)
  })

  it('calls pressed-move with the last point once finished', () => {
    const pressedMove = vi.fn()
    const overlay = make({ totalStep: 3, pressedMove })
    const list = points(2)
    restore(overlay, list)

    expect(pressedMove).toHaveBeenCalledTimes(1)
    const params = pressedMove.mock.calls[0][0] as OverlayPerformEventParams
    expect(params.performPointIndex).toBe(1)
    expect(params.performPoint).toBe(overlay.points[1])
    expect(params.currentStep).toBe(overlay.currentStep)
  })

  it('does not call pressed-move for a partial restore', () => {
    const pressedMove = vi.fn()
    const overlay = make({ totalStep: 4, pressedMove })
    restore(overlay, points(1))

    expect(pressedMove).not.toHaveBeenCalled()
    expect(overlay.currentStep).toBe(2)
  })

  it('does not replay anything for an empty point list', () => {
    const moveForDrawing = vi.fn()
    const pressedMove = vi.fn()
    const overlay = make({ moveForDrawing, pressedMove })
    restore(overlay, [])

    expect(moveForDrawing).not.toHaveBeenCalled()
    expect(pressedMove).not.toHaveBeenCalled()
    expect(overlay.isStart()).toBe(true)
  })
})
