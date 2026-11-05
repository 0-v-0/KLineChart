import { beforeAll, describe, expect, it, vi } from 'vitest'

// Compile-time: these type exports must be part of the package surface. `tsc`
// checks this file as part of `npx tsc --noEmit`, so a missing re-export fails
// the build even though a type has no runtime value to assert on.
import type { CandleBaselineStyle, CandleFootprintStyle, CandleHlcAreaStyle, CandleLineStyle, FootprintBarData, FootprintImbalances, FootprintRow } from '../index'

type Surface = [CandleBaselineStyle, CandleFootprintStyle, CandleHlcAreaStyle, CandleLineStyle, FootprintBarData, FootprintImbalances, FootprintRow]
const surfaceIsTyped = (..._values: Surface): boolean => true

let api: typeof import('../index')

beforeAll(async () => {
  vi.stubGlobal('window', { navigator: { userAgent: 'Linux' }, getComputedStyle: () => ({ backgroundColor: '' }) })
  api = await import('../index')
})

describe('public API surface', () => {
  it('exports the footprint helpers as values', () => {
    expect(typeof api.footprintImbalances).toBe('function')
    expect(typeof api.footprintPoc).toBe('function')
    expect(typeof api.formatFootprintVolume).toBe('function')
  })

  it('exports the text hit test as a named value, not only inside utils', () => {
    expect(typeof api.checkCoordinateOnText).toBe('function')
    expect(api.checkCoordinateOnText).toBe(api.utils.checkCoordinateOnText)
  })

  it('still exposes the entry points a host starts from', () => {
    expect(typeof api.init).toBe('function')
    expect(typeof api.dispose).toBe('function')
    expect(typeof api.getSupportedOverlays).toBe('function')
    expect(typeof api.OVERLAY_Z_LEVEL_ABOVE_CROSSHAIR).toBe('number')
  })

  it('keeps the new style types usable from the package root', () => {
    // A compile-time assertion: `Surface` would not exist without the exports.
    expect(surfaceIsTyped).toBeDefined()
  })
})
