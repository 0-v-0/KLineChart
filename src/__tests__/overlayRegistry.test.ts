import { describe, expect, it } from 'vitest'
import type OverlayImp from '../component/Overlay'
import { getOverlayClass, getOverlayInnerClass, getSupportedOverlays } from '../extension/overlay'
import { factories as tvAnnotationFactories } from '../extension/overlay/tv/annotations'
import { factories as tvFibCycleFactories } from '../extension/overlay/tv/fibCycles'
import { factories as tvForecastDataFactories } from '../extension/overlay/tv/forecastData'
import { factories as tvLineShapeFactories } from '../extension/overlay/tv/linesShapes'
import { factories as tvPatternFactories } from '../extension/overlay/tv/patterns'
import { factories as tvPitchforkGannFactories } from '../extension/overlay/tv/pitchforkGann'

const tvGroups = [tvAnnotationFactories, tvFibCycleFactories, tvForecastDataFactories, tvLineShapeFactories, tvPatternFactories, tvPitchforkGannFactories]

const tvNames = tvGroups.reduce<string[]>((names, factories) => names.concat(factories.map((factory) => factory().name)), [])

/**
 * The registry is a plain record keyed by template name, so a duplicate name is
 * silently swallowed: the later template overwrites the earlier one and the tool
 * simply disappears from `getSupportedOverlays()`. These tests pin the name set
 * instead of the count, so adding a tool does not require touching them.
 */
/** Build a registered overlay to read a flag off the instance the view holds. */
function instantiate(name: string): OverlayImp {
  const Inner = getOverlayInnerClass(name)
  if (Inner === null) {
    throw new Error(`no overlay named ${name}`)
  }
  return new Inner()
}

describe('overlay registry', () => {
  it('exposes every TV tool under its own name', () => {
    expect(tvNames.length).toBeGreaterThan(0)
    const missing = tvNames.filter((name) => !getSupportedOverlays().includes(name))
    expect(missing).toEqual([])
  })

  it('gives every TV tool a unique name', () => {
    const seen = new Set<string>()
    const duplicates: string[] = []
    for (const name of tvNames) {
      if (seen.has(name)) {
        duplicates.push(name)
      }
      seen.add(name)
    }
    expect(duplicates).toEqual([])
  })

  it('resolves every TV tool to a constructor', () => {
    const unresolved = tvNames.filter((name) => getOverlayClass(name) === null)
    expect(unresolved).toEqual([])
  })

  it('returns a fresh registry snapshot each call', () => {
    getSupportedOverlays().push('not-a-real-overlay')
    expect(getSupportedOverlays()).not.toContain('not-a-real-overlay')
  })
})

/**
 * `editTextOnCreate` decides whether a drawing opens with the inline text
 * editor, and the editor triggers on an *empty* editable text — which is also
 * how a channel or an ellipse's label starts out. So the flag has to be
 * declared by the tools whose text is the point of the drawing, and left off
 * everywhere else: without the gate, drawing a channel popped a text box over
 * a shape the user had not asked to label.
 */
describe('edit text on create', () => {
  const editors = ['text', 'note', 'callout', 'comment', 'signpost', 'pin', 'priceNote', 'simpleAnnotation', 'balloon', 'anchoredText', 'anchoredNote']

  it('opens the editor for the tools whose text is the drawing', () => {
    const silent = editors.filter((name) => instantiate(name).editTextOnCreate !== true)
    expect(silent).toEqual([])
  })

  it('leaves the editor closed for every other TV tool', () => {
    const allowed = new Set(['balloon', 'anchoredText', 'anchoredNote'])
    const editory = tvNames.filter((name) => !allowed.has(name) && instantiate(name).editTextOnCreate !== false)
    expect(editory).toEqual([])
  })

  it('leaves it closed for the TV shapes that carry an optional label', () => {
    const silent = ['ellipse', 'arc', 'doubleCurve', 'rotatedRectangle', 'flatBottom', 'disjointAngle', 'gannBox', 'regressionTrend', 'trendAngle']
    const editory = silent.filter((name) => instantiate(name).editTextOnCreate !== false)
    expect(editory).toEqual([])
  })
})
