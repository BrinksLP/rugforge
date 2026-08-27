import { describe, expect, it } from 'vitest'
import { kmeansLab } from './kmeans'
import { rgbToLab, labToRgb } from './color'

function samplesFrom(rgbs: [number, number, number][]): Float64Array {
  const out = new Float64Array(rgbs.length * 3)
  rgbs.forEach(([r, g, b], i) => {
    const [L, a, bb] = rgbToLab(r, g, b)
    out[i * 3] = L
    out[i * 3 + 1] = a
    out[i * 3 + 2] = bb
  })
  return out
}

describe('kmeansLab', () => {
  it('separates three well-defined colour blobs', () => {
    const reds: [number, number, number][] = Array.from({ length: 30 }, () => [
      200,
      20,
      20,
    ])
    const greens: [number, number, number][] = Array.from({ length: 30 }, () => [
      20,
      200,
      20,
    ])
    const blues: [number, number, number][] = Array.from({ length: 30 }, () => [
      20,
      20,
      200,
    ])
    const { centers, assignments } = kmeansLab(
      samplesFrom([...reds, ...greens, ...blues]),
      3,
    )
    expect(centers).toHaveLength(3)
    // all members of a blob share a cluster
    const first = assignments.slice(0, 30)
    expect(new Set(first).size).toBe(1)
    expect(new Set(assignments.slice(30, 60)).size).toBe(1)
    expect(new Set(assignments.slice(60, 90)).size).toBe(1)
    // three distinct clusters used
    expect(new Set(assignments).size).toBe(3)
  })

  it('is deterministic for the same input', () => {
    const s = samplesFrom(
      Array.from({ length: 50 }, (_, i) => [i * 5, 255 - i * 5, (i * 13) % 255]),
    )
    const a = kmeansLab(s, 5)
    const b = kmeansLab(s, 5)
    expect(Array.from(a.assignments)).toEqual(Array.from(b.assignments))
  })

  it('clamps k to the sample count', () => {
    const s = samplesFrom([
      [0, 0, 0],
      [255, 255, 255],
    ])
    const { centers } = kmeansLab(s, 10)
    expect(centers.length).toBeLessThanOrEqual(2)
  })

  it('cluster centres round-trip back to plausible sRGB', () => {
    const { centers } = kmeansLab(samplesFrom([[128, 64, 32]]), 1)
    const [r, g, b] = labToRgb(centers[0][0], centers[0][1], centers[0][2])
    expect(r).toBeGreaterThanOrEqual(0)
    expect(r).toBeLessThanOrEqual(255)
    expect(g).toBeGreaterThanOrEqual(0)
    expect(b).toBeGreaterThanOrEqual(0)
  })
})
