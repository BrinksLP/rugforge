import { describe, expect, it } from 'vitest'
import { borderColorIndex, buildTuftPath, travelByColor } from './tuftpath'
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
    // 10x10 cm square = 40 cm perimeter, less a bit from corner rounding
    expect(path.outlineLenCm).toBeGreaterThan(30)
    expect(path.outlineLenCm).toBeLessThan(41)
  })

  it('the outline is smoothed, not a per-cell staircase', () => {
    // a 10-cell edge would be ~11 boundary points raw; smoothed is far fewer
    expect(path.outline[0].length).toBeLessThan(40)
  })

  it('fills the region with vertical strokes', () => {
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

  it('no fill stroke leaves the region (concave shape)', () => {
    // 6x6 grid with a 2x2 hole in the middle
    const cols = 6
    const rows = 6
    const cells = new Int32Array(cols * rows).fill(0)
    for (let y = 2; y <= 3; y++)
      for (let x = 2; x <= 3; x++) cells[y * cols + x] = -1
    const pattern: Pattern = {
      cols,
      rows,
      cells,
      regions: [region(0, 0, [0, 0, 5, 5], cols * rows - 4)],
      palette: [{ index: 0, hex: '#777777', lab: [50, 0, 0], name: 'x' }],
      cellSizeMm: 10,
    }
    const p2 = buildTuftPath(pattern).paths[0]
    const inside = (cx: number, cy: number) => {
      const gx = Math.floor(cx)
      const gy = Math.floor(cy)
      return (
        gx >= 0 &&
        gy >= 0 &&
        gx < cols &&
        gy < rows &&
        cells[gy * cols + gx] === 0
      )
    }
    for (const seg of p2.fill) {
      for (let i = 1; i < seg.length; i++) {
        const [ax, ay] = seg[i - 1]
        const [bx, by] = seg[i]
        for (let t = 0; t <= 1; t += 0.2) {
          // fill coords are cm; cellSizeMm 10 => 1 cm per cell
          expect(inside(ax + (bx - ax) * t, ay + (by - ay) * t)).toBe(true)
        }
      }
    }
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

describe('background regions', () => {
  const cols = 6
  const rows = 4
  const cells = new Int32Array(cols * rows)
  // region 1 = a 2x2 object in the middle, region 0 = everything else (border)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      cells[y * cols + x] = x >= 2 && x <= 3 && y >= 1 && y <= 2 ? 1 : 0
    }
  }
  const pattern: Pattern = {
    cols,
    rows,
    cells,
    regions: [
      region(0, 0, [0, 0, cols - 1, rows - 1], cols * rows - 4),
      region(1, 1, [2, 1, 3, 2], 4),
    ],
    palette: [
      { index: 0, hex: '#eeeeee', lab: [93, 0, 0], name: 'bg' },
      { index: 1, hex: '#993333', lab: [35, 30, 15], name: 'objekt' },
    ],
    cellSizeMm: 10,
  }

  it('borderColorIndex finds the colour on the edge', () => {
    expect(borderColorIndex(pattern, (rid) => pattern.regions[rid].colorIndex)).toBe(0)
  })

  it('skipRegion drops it from the path entirely', () => {
    const plan = buildTuftPath(pattern, {
      skipRegion: (rid) => pattern.regions[rid].colorIndex === 0,
    })
    expect(plan.paths).toHaveLength(1)
    expect(plan.paths[0].regionId).toBe(1)
    expect(plan.order).toEqual([1])
    expect(plan.totalTravelCm).toBeCloseTo(
      plan.paths[0].outlineLenCm + plan.paths[0].fillLenCm,
      5,
    )
  })
})
