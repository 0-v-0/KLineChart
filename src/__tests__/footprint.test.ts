import { describe, expect, it } from 'vitest'

import { formatFootprintVolume, footprintImbalances, footprintLayout, footprintPoc, footprintValueArea, type FootprintRow } from '../common/Footprint'

describe('footprintLayout', () => {
  it('gives a wide adaptive bar two columns and a narrow one a single delta column', () => {
    expect(footprintLayout(30, 'adaptive').mode).toBe('split')
    expect(footprintLayout(28, 'adaptive').mode).toBe('split')
    expect(footprintLayout(27, 'adaptive').mode).toBe('single')
  })

  it('keeps a wide bar three pixels of body and two of gap', () => {
    expect(footprintLayout(40, 'adaptive')).toEqual({ mode: 'split', bodyWidth: 3, gap: 2 })
  })

  it('narrows the body and the gap when the bar is narrow', () => {
    expect(footprintLayout(10, 'adaptive')).toEqual({ mode: 'single', bodyWidth: 2, gap: 1 })
  })

  it('never drops below a three-pixel body on a wide bar', () => {
    expect(footprintLayout(20, 'adaptive').bodyWidth).toBe(3)
  })

  it('scales the body with the bar when it is wide enough to matter', () => {
    expect(footprintLayout(50, 'adaptive').bodyWidth).toBe(4)
  })

  it('returns the column the variant asks for, whatever the width', () => {
    expect(footprintLayout(10, 'delta').mode).toBe('single')
    expect(footprintLayout(50, 'delta').mode).toBe('single')
    expect(footprintLayout(10, 'profile').mode).toBe('profile')
    expect(footprintLayout(50, 'profile').mode).toBe('profile')
    expect(footprintLayout(10, 'histogram').mode).toBe('histogram')
  })

  it('gives the histogram a tenth of the bar, which leaves room for two histograms', () => {
    expect(footprintLayout(50, 'histogram').bodyWidth).toBe(5)
    expect(footprintLayout(50, 'profile').bodyWidth).toBe(4)
  })
})

describe('footprintImbalances', () => {
  it('marks the ask that outweighs the bid one row down', () => {
    const rows: FootprintRow[] = [
      [100, 5, 1],
      [101, 1, 10],
      [102, 6, 0]
    ]
    const result = footprintImbalances(rows, 1, 2)
    expect([...result.ask]).toEqual([1])
    expect([...result.bid]).toEqual([])
  })

  it('marks the bid that outweighs the ask one row up', () => {
    const rows: FootprintRow[] = [
      [100, 10, 1],
      [101, 1, 2]
    ]
    expect([...footprintImbalances(rows, 1, 2).bid]).toEqual([0])
  })

  it('does not count a diagonal partner with no volume, which would light up every edge row', () => {
    const rows: FootprintRow[] = [
      [100, 50, 0],
      [101, 0, 0]
    ]
    const result = footprintImbalances(rows, 1, 2)
    expect(result.bid.size + result.ask.size).toBe(0)
  })

  it('takes the ratio as a threshold, not a strict inequality', () => {
    const rows: FootprintRow[] = [
      [100, 10, 0],
      [101, 0, 20]
    ]
    expect([...footprintImbalances(rows, 1, 2).ask]).toEqual([1])
    expect([...footprintImbalances(rows, 1, 2.01).ask]).toEqual([])
  })

  it('finds the partner by price step, so a row list with a hole still compares', () => {
    const rows: FootprintRow[] = [
      [100, 10, 0],
      [102, 0, 10]
    ]
    expect([...footprintImbalances(rows, 1, 2).ask]).toEqual([])
  })

  it('answers nothing for a row size or ratio that cannot mean anything', () => {
    const rows: FootprintRow[] = [
      [100, 10, 0],
      [101, 0, 10]
    ]
    expect(footprintImbalances(rows, 0, 2).ask.size).toBe(0)
    expect(footprintImbalances(rows, 1, 0).ask.size).toBe(0)
  })
})

describe('footprintValueArea', () => {
  it('grows one row at a time until the band holds the share', () => {
    const rows: FootprintRow[] = [
      [100, 1, 0],
      [101, 1, 1],
      [102, 5, 5],
      [103, 1, 1],
      [104, 1, 0]
    ]
    // 16 of volume; 70% is 11.2, so 10 at the POC plus one neighbour row of 2 is enough.
    expect(footprintValueArea(rows, 1, 102)).toEqual({ low: 102, high: 104 })
  })

  it('walks toward the busier side rather than symmetrically', () => {
    const rows: FootprintRow[] = [
      [99, 10, 10],
      [100, 1, 1],
      [101, 9, 9]
    ]
    // The heavy row is below the POC, so the band has to reach down to it.
    expect(footprintValueArea(rows, 1, 101)).toEqual({ low: 99, high: 102 })
  })

  it('takes the upper neighbour when both sides weigh the same', () => {
    const rows: FootprintRow[] = [
      [100, 1, 1],
      [101, 5, 5],
      [102, 1, 1]
    ]
    expect(footprintValueArea(rows, 1, 101, 0.9)).toEqual({ low: 100, high: 103 })
  })

  it('answers nothing without a POC, without rows, or without volume', () => {
    const rows: FootprintRow[] = [[100, 1, 1]]
    expect(footprintValueArea(rows, 1, null)).toBeNull()
    expect(footprintValueArea([], 1, 100)).toBeNull()
    expect(footprintValueArea([[100, 0, 0]], 1, 100)).toBeNull()
  })

  it('finds the POC row within half a row, and answers nothing beyond that', () => {
    const rows: FootprintRow[] = [
      [100, 1, 1],
      [102, 1, 1]
    ]
    expect(footprintValueArea(rows, 1, 101.6)).not.toBeNull()
    expect(footprintValueArea(rows, 1, 101)).toBeNull()
  })
})

describe('footprintPoc', () => {
  it('takes the busiest row', () => {
    expect(
      footprintPoc(
        [
          [100, 1, 0],
          [101, 2, 2],
          [102, 1, 0]
        ],
        100
      )
    ).toBe(101)
  })

  it('breaks a tie toward the row nearest the close', () => {
    const rows: FootprintRow[] = [
      [100, 2, 2],
      [101, 2, 2]
    ]
    expect(footprintPoc(rows, 101)).toBe(101)
    expect(footprintPoc(rows, 99)).toBe(100)
  })

  it('skips an empty row rather than calling it the POC', () => {
    expect(footprintPoc([[100, 0, 0]], 100)).toBeNull()
    expect(footprintPoc([], 100)).toBeNull()
  })
})

describe('formatFootprintVolume', () => {
  it('uses one letter for thousands and above', () => {
    expect(formatFootprintVolume(7000)).toBe('7K')
    expect(formatFootprintVolume(1_200_000)).toBe('1.2M')
    expect(formatFootprintVolume(1_000_000_000)).toBe('1B')
  })

  it('keeps three digits of a large scaled value and two below a hundred', () => {
    expect(formatFootprintVolume(123_456_789)).toBe('123M')
  })

  it('prints a plain number where a cell has room for one', () => {
    expect(formatFootprintVolume(350)).toBe('350')
    expect(formatFootprintVolume(999)).toBe('999')
    expect(formatFootprintVolume(4.5)).toBe('4.5')
  })

  it('keeps two significant digits of a fractional volume', () => {
    expect(formatFootprintVolume(0.031)).toBe('0.031')
    expect(formatFootprintVolume(0.5)).toBe('0.5')
  })

  it('prints zero as zero', () => {
    expect(formatFootprintVolume(0)).toBe('0')
  })

  it('keeps the sign of a delta', () => {
    expect(formatFootprintVolume(-7000)).toBe('-7K')
  })
})
