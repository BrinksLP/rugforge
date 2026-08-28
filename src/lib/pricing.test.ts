import { describe, expect, it } from 'vitest'
import {
  costBreakdown,
  estimateMaterials,
  marginScenarios,
  suggestedPrice,
} from './pricing'
import { STANDARD_BUSINESS, STANDARD_SETUP } from './profiles'
import type { RugInput } from './pricing'

const rug: RugInput = {
  size: { widthCm: 80, heightCm: 120, stitchesPerCm: 2 },
  tuftedAreaCm2: 80 * 120 * 0.85, // 15% is background
  travelCm: 80 * 120 * 2, // ~ area * stitchesPerCm
}

describe('estimateMaterials', () => {
  const m = estimateMaterials(rug, STANDARD_SETUP, STANDARD_BUSINESS)

  it('lists yarn, primary, backing and glue, all with a positive cost', () => {
    expect(m.lines.map((l) => l.key)).toEqual([
      'yarn',
      'primary',
      'backing',
      'glue',
    ])
    for (const l of m.lines) expect(l.cost).toBeGreaterThan(0)
  })

  it('total is the sum of the lines', () => {
    expect(m.total).toBeCloseTo(
      m.lines.reduce((s, l) => s + l.cost, 0),
      6,
    )
  })

  it('primary cloth length is the rug height plus a frame margin (fits the roll)', () => {
    const primary = m.lines.find((l) => l.key === 'primary')!
    expect(primary.qty).toBeCloseTo((120 + 30) / 100, 6) // 1.5 m
  })

  it('is marked uncalibrated without a calibration patch', () => {
    expect(m.yarnCalibrated).toBe(false)
  })
})

describe('costBreakdown', () => {
  const c = costBreakdown(rug, STANDARD_SETUP, STANDARD_BUSINESS)

  it('labour hours scale with the full rug area and hoursPerM2', () => {
    expect(c.labourHours).toBeCloseTo(0.96 * STANDARD_BUSINESS.hoursPerM2, 6)
  })

  it('total = materials + labour + electricity', () => {
    expect(c.total).toBeCloseTo(
      c.materialTotal + c.labourCost + c.electricity,
      6,
    )
  })
})

describe('suggestedPrice', () => {
  const cost = 100

  it('margin mode hits the target margin after fees', () => {
    const biz = { ...STANDARD_BUSINESS, targetMode: 'margin' as const, targetMarginPct: 45 }
    const r = suggestedPrice(cost, biz)
    expect(r.marginPct).toBeCloseTo(45, 4)
    expect(r.price).toBeCloseTo(r.cost + r.fees + r.profit, 4)
  })

  it('profit mode hits the target profit after fees', () => {
    const biz = { ...STANDARD_BUSINESS, targetMode: 'profit' as const, targetProfit: 80 }
    const r = suggestedPrice(cost, biz)
    expect(r.profit).toBeCloseTo(80, 4)
    expect(r.price).toBeCloseTo(r.cost + r.fees + r.profit, 4)
  })

  it('accounts for marketplace fees (price above the fee-free target)', () => {
    const biz = { ...STANDARD_BUSINESS, targetMode: 'margin' as const, targetMarginPct: 40 }
    const feeFree = cost / (1 - 0.4)
    expect(suggestedPrice(cost, biz).price).toBeGreaterThan(feeFree)
  })

  it('returns NaN when the target is impossible (fees + margin >= 100%)', () => {
    const biz = { ...STANDARD_BUSINESS, targetMode: 'margin' as const, targetMarginPct: 99 }
    expect(Number.isNaN(suggestedPrice(cost, biz).price)).toBe(true)
  })
})

describe('marginScenarios', () => {
  it('price rises with the target margin', () => {
    const rows = marginScenarios(120, STANDARD_BUSINESS)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].price).toBeGreaterThan(rows[i - 1].price)
    }
    expect(rows[0].marginPct).toBe(30)
  })
})
