import { describe, expect, it } from 'vitest'
import {
  areaByColor,
  effectiveColorIndex,
  resolveMergedColor,
  resolvedSet,
} from './pattern'
import type { Pattern, Region } from '../types'

function makePattern(
  regions: { c: number; n: number }[],
  paletteLen: number,
): Pattern {
  return {
    cols: 1,
    rows: 1,
    cells: new Int32Array(),
    regions: regions.map(
      (r, i): Region => ({
        id: i,
        colorIndex: r.c,
        cellCount: r.n,
        bbox: [0, 0, 0, 0],
        tooSmall: false,
      }),
    ),
    palette: Array.from({ length: paletteLen }, (_, index) => ({
      index,
      hex: '#000000',
      lab: [0, 0, 0] as [number, number, number],
      name: `Farbe ${index + 1}`,
    })),
    cellSizeMm: 5,
  }
}

describe('resolveMergedColor', () => {
  it('is identity with no merges', () => {
    expect(resolveMergedColor(3, {})).toBe(3)
    expect(resolveMergedColor(3)).toBe(3)
  })

  it('follows a single hop', () => {
    expect(resolveMergedColor(1, { 1: 2 })).toBe(2)
  })

  it('follows a chain to the root', () => {
    expect(resolveMergedColor(1, { 1: 2, 2: 0 })).toBe(0)
  })

  it('does not loop forever on a cycle', () => {
    const out = resolveMergedColor(1, { 1: 2, 2: 1 })
    expect([1, 2]).toContain(out)
  })
})

describe('areaByColor with merges', () => {
  const pattern = makePattern(
    [
      { c: 0, n: 10 },
      { c: 0, n: 5 },
      { c: 1, n: 20 },
      { c: 2, n: 7 },
    ],
    3,
  )

  it('folds a merged colour into its target', () => {
    const areas = areaByColor(pattern, {}, { 1: 2 })
    expect(areas[0]).toBe(15)
    expect(areas[1]).toBe(0)
    expect(areas[2]).toBe(27)
  })

  it('collapses a whole chain', () => {
    const areas = areaByColor(pattern, {}, { 1: 2, 2: 0 })
    expect(areas[0]).toBe(42)
    expect(areas[1]).toBe(0)
    expect(areas[2]).toBe(0)
  })

  it('matches the unmerged totals when there are no merges', () => {
    expect(areaByColor(pattern, {})).toEqual([15, 20, 7])
  })

  it('skip set (background) contributes zero', () => {
    const areas = areaByColor(pattern, {}, {}, new Set([0]))
    expect(areas[0]).toBe(0)
    expect(areas[1]).toBe(20)
    expect(areas[2]).toBe(7)
  })
})

describe('resolvedSet', () => {
  it('resolves indices through merges', () => {
    const s = resolvedSet([1, 3], { 1: 2 })
    expect(s.has(2)).toBe(true)
    expect(s.has(3)).toBe(true)
    expect(s.has(1)).toBe(false)
  })
  it('is empty for undefined', () => {
    expect(resolvedSet(undefined).size).toBe(0)
  })
})

describe('effectiveColorIndex', () => {
  const pattern = makePattern([{ c: 1, n: 4 }], 3)
  const region = pattern.regions[0] // id 0, colorIndex 1

  it('resolves the merge on the region colour', () => {
    expect(effectiveColorIndex(region, {}, { 1: 0 })).toBe(0)
  })

  it('applies the recolour first, then the merge on top of it', () => {
    // recolour region 0 -> palette 2 (no merge touches 2)
    expect(effectiveColorIndex(region, { 0: 2 }, { 1: 0 })).toBe(2)
    // recolour region 0 -> palette 1, which is merged into 0
    expect(effectiveColorIndex(region, { 0: 1 }, { 1: 0 })).toBe(0)
  })
})
