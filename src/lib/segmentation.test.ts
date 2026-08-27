import { describe, expect, it } from 'vitest'
import { minMaxNormalise, thresholdToAlpha } from './segmentation'

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
