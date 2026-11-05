import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { REAL_SEPARATOR_HEIGHT, TOUCH_SEPARATOR_HEIGHT } from '../widget/types'

// `Event` reads the platform at module load, so the import waits for the stub.
let EventClass: new () => unknown

beforeAll(async () => {
  vi.stubGlobal('window', { navigator: { userAgent: 'node' }, addEventListener: () => undefined, removeEventListener: () => undefined })
  vi.stubGlobal('document', { addEventListener: () => undefined, removeEventListener: () => undefined })
  EventClass = (await import('../Event')).default as unknown as new () => unknown
})

afterAll(() => {
  vi.unstubAllGlobals()
})

interface TriggerInfo {
  widget: { getName: () => string } | null
}

interface Finder {
  _findWidgetByEvent: (event: { x: number; y: number; isTouch?: boolean }) => TriggerInfo
}

/**
 * A pane boundary at y 200 with a 2px line: the grab band is centred on it, so
 * the band reaches from 200 - (band - 2) / 2 to that plus `band`.
 */
function finder(): Finder {
  const separatorWidget = { getName: () => 'separator' }
  const separatorPane = {
    getBounding: () => ({ left: 0, top: 200, width: 400, height: 100 }),
    getWidget: () => separatorWidget
  }
  const chart = {
    getSeparatorPanes: () => [['separator_1', separatorPane]],
    getStyles: () => ({ separator: { size: 2 } }),
    getDrawPanes: () => []
  }
  return Object.assign(Object.create(EventClass.prototype) as object, { _chart: chart }) as unknown as Finder
}

describe('the pane separator grab band', () => {
  it('is the mouse band for a pointer and the wider one for a finger', () => {
    const event = finder()
    const mouseOffset = Math.floor((REAL_SEPARATOR_HEIGHT - 2) / 2)
    const touchOffset = Math.floor((TOUCH_SEPARATOR_HEIGHT - 2) / 2)
    // Just inside the mouse band, and outside it but inside the touch band.
    expect(event._findWidgetByEvent({ x: 10, y: 200 - mouseOffset }).widget?.getName()).toBe('separator')
    expect(event._findWidgetByEvent({ x: 10, y: 200 - touchOffset }).widget).toBeNull()
    expect(event._findWidgetByEvent({ x: 10, y: 200 - touchOffset, isTouch: true }).widget?.getName()).toBe('separator')
  })
})
