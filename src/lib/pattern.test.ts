import { describe, expect, it } from 'vitest'
import { buildPattern } from './pattern'
import type { Pattern, PatternSettings } from '../types'

/** build a fake RGBA ImageData (buildPattern only reads width/height/data) */
function img(
  w: number,
  h: number,
  paint: (x: number, y: number) => [number, number, number],
): ImageData {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y)
      const i = (y * w + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
  return { width: w, height: h, data } as ImageData
}

const DARK: [number, number, number] = [40, 80, 70]
const LIGHT: [number, number, number] = [235, 230, 215]

function settings(over: Partial<PatternSettings> = {}): PatternSettings {
  return {
    preset: 'medium',
    colorCount: 2,
    minRegionStitches: 1,
    smoothing: 0,
    ...over,
  }
}

/** effective colour index of a grid cell */
function colorAt(p: Pattern, x: number, y: number): number {
  const rid = p.cells[y * p.cols + x]
  return rid < 0 ? -1 : p.regions[rid].colorIndex
}

describe('buildPattern edge quality', () => {
  it('reduces a two-tone image to exactly two colours', () => {
    const src = img(64, 64, (x) => (x >= 32 ? DARK : LIGHT))
    const p = buildPattern({
      source: src,
      cols: 32,
      rows: 32,
      cellSizeMm: 5,
      settings: settings(),
    })
    expect(p.palette.length).toBe(2)
  })

  it('keeps a straight edge straight despite cell-sized teeth (antiJag)', () => {
    // vertical border at source x=32 (grid col 16), with 2x2-px teeth
    // poking across it on a few rows -> one-cell jags in the grid
    const teethRows = (y: number) =>
      (y >= 8 && y < 10) || (y >= 20 && y < 22) || (y >= 40 && y < 42)
    const src = img(64, 64, (x, y) => {
      let dark = x >= 32
      if (teethRows(y)) {
        if (x >= 32 && x < 34) dark = false // light pokes into the dark side
        if (x >= 30 && x < 32) dark = true // dark pokes into the light side
      }
      return dark ? DARK : LIGHT
    })

    const p = buildPattern({
      source: src,
      cols: 32,
      rows: 32,
      cellSizeMm: 5,
      settings: settings(),
    })

    // every row must switch colour at the same column -> no jag
    const transitions = new Set<number>()
    for (let y = 0; y < p.rows; y++) {
      let t = -1
      for (let x = 1; x < p.cols; x++) {
        if (colorAt(p, x - 1, y) !== colorAt(p, x, y)) {
          t = x
          break
        }
      }
      transitions.add(t)
    }
    expect([...transitions]).toEqual([16])
  })

  it('does not erode a frame that is several cells thick', () => {
    // 8px (4-cell) dark border around a light middle
    const src = img(80, 80, (x, y) => {
      const edge = x < 8 || x >= 72 || y < 8 || y >= 72
      return edge ? DARK : LIGHT
    })
    const p = buildPattern({
      source: src,
      cols: 40,
      rows: 40,
      cellSizeMm: 5,
      settings: settings(),
    })

    const counts = [0, 0]
    for (let i = 0; i < p.cells.length; i++) {
      const c = colorAt(p, i % p.cols, (i / p.cols) | 0)
      if (c >= 0) counts[c]++
    }
    // frame ~= 40*40 - 32*32 = 576 cells; assert it survived roughly intact
    const frame = Math.min(...counts)
    expect(frame).toBeGreaterThan(500)
  })
})
