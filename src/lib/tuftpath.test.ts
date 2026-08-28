import { describe, expect, it } from 'vitest'
import { buildTuftPath, travelByColor } from './tuftpath'
import type { Pattern, Region } from '../types'

function region(
  id: number,
  colorIndex: number,
  bbox: [number, number, number, number],
  cellCount: number,
): Region {
  return { id, colorIndex, bbox, cellCount, tooSmall: false }
}

/** whole grid = one region, 1 cm cells */
function rectPattern(cols: number, rows: number): Pattern {
  return {
    cols,
    rows,
    cells: new Int32Array(cols * rows).fill(0),
    regions: [region(0, 0, [0, 0, cols - 1, rows - 1], cols * rows)],
    palette: [
      { index: 0, hex: '#808080', lab: [50, 0, 0], name: 'grau' },
    ],
    cellSizeMm: 10,
  }
}

describe('buildTuftPath', () => {
  const plan = buildTuftPath(rectPattern(10, 10))
  const path = plan.paths[0]

  it('traces one closed outline near the true perimeter', () => {
    expect(path.outline.length).toBeGreaterThanOrEqual(1)
    // 10x10 cm square = 40 cm perimeter, minus a little from corner rounding
    expect(path.outlineLenCm).toBeGreaterThan(34)
    expect(path.outlineLenCm).toBeLessThan(41)
  })

  it('fills the region with a continuous polyline', () => {
    expect(path.fill.length).toBeGreaterThan(2)
    expect(path.fillLenCm).toBeGreaterThan(80)
    expect(path.thin).toBe(false)
  })

  it('total travel is outline + fill', () => {
    expect(plan.totalTravelCm).toBeCloseTo(
      path.outlineLenCm + path.fillLenCm,
      5,
    )
  })

  it('reports the snapped row spacing', () => {
    expect(plan.rowSpacingCm).toBeGreaterThan(0)
  })
})

describe('tuft order', () => {
  it('puts a light colour before a dark one', () => {
    const cols = 4
    const rows = 2
    const cells = new Int32Array(cols * rows)
    for (let i = 0; i < cells.length; i++) cells[i] = i % cols < 2 ? 0 : 1
    const pattern: Pattern = {
      cols,
      rows,
      cells,
      regions: [
        region(0, 0, [0, 0, 1, 1], 4),
        region(1, 1, [2, 0, 3, 1], 4),
      ],
      palette: [
        { index: 0, hex: '#f2efe6', lab: [95, 0, 0], name: 'hell' },
        { index: 1, hex: '#1e1e1e', lab: [12, 0, 0], name: 'dunkel' },
      ],
      cellSizeMm: 10,
    }
    const plan = buildTuftPath(pattern)
    expect(plan.order[0]).toBe(0) // the light region
  })
})

describe('travelByColor', () => {
  it('sums each region onto its effective colour', () => {
    const plan = buildTuftPath(rectPattern(8, 8))
    const t = travelByColor(plan, rectPattern(8, 8), () => 0)
    expect(t[0]).toBeCloseTo(plan.totalTravelCm, 5)
  })
})
