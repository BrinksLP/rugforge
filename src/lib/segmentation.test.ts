import { describe, expect, it } from 'vitest'
import { fillHoles, minMaxNormalise, thresholdToAlpha } from './segmentation'

describe('minMaxNormalise', () => {
  it('maps min to 0 and max to 1', () => {
    const out = minMaxNormalise([2, 4, 6])
    expect(out[0]).toBeCloseTo(0)
    expect(out[1]).toBeCloseTo(0.5)
    expect(out[2]).toBeCloseTo(1)
  })

  it('handles negative model logits', () => {
    const out = minMaxNormalise([-3, -1, 1])
    expect(out[0]).toBeCloseTo(0)
    expect(out[2]).toBeCloseTo(1)
  })

  it('returns all zero for a flat map (nothing salient)', () => {
    const out = minMaxNormalise([0.7, 0.7, 0.7])
    expect([...out]).toEqual([0, 0, 0])
  })

  it('preserves length', () => {
    expect(minMaxNormalise(new Float32Array(1024)).length).toBe(1024)
  })
})

describe('thresholdToAlpha', () => {
  it('is fully transparent well below the cut and opaque well above', () => {
    const out = thresholdToAlpha([0, 0.2, 0.8, 1], 0.5)
    expect(out[0]).toBe(0)
    expect(out[1]).toBe(0)
    expect(out[2]).toBe(255)
    expect(out[3]).toBe(255)
  })

  it('feathers a narrow band around the threshold', () => {
    const out = thresholdToAlpha([0.45, 0.5, 0.55], 0.5)
    expect(out[0]).toBeGreaterThan(0)
    expect(out[0]).toBeLessThan(255)
    expect(out[1]).toBe(128)
    expect(out[2]).toBeGreaterThan(out[1])
  })

  it('a higher threshold keeps less', () => {
    const mid = [0.55]
    expect(thresholdToAlpha(mid, 0.4)[0]).toBe(255)
    expect(thresholdToAlpha(mid, 0.7)[0]).toBe(0)
  })
})

describe('fillHoles', () => {
  it('fills an enclosed gap but leaves the outside alone', () => {
    const w = 7
    const h = 7
    const a = new Uint8ClampedArray(w * h)
    for (let y = 1; y <= 5; y++)
      for (let x = 1; x <= 5; x++) a[y * w + x] = 255
    a[3 * w + 3] = 0 // hole in the middle of the block

    fillHoles(a, w, h)

    expect(a[3 * w + 3]).toBe(255) // hole filled
    expect(a[0]).toBe(0) // outside corner untouched
    expect(a[3 * w + 0]).toBe(0) // outside edge untouched
  })

  it('leaves a hole that touches the border open', () => {
    const w = 6
    const h = 6
    const a = new Uint8ClampedArray(w * h).fill(255)
    // a transparent notch cut in from the top edge
    a[2] = 0
    a[w + 2] = 0

    fillHoles(a, w, h)

    expect(a[2]).toBe(0)
    expect(a[w + 2]).toBe(0)
  })
})
