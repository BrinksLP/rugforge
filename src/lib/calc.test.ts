import { describe, expect, it } from 'vitest'
import {
  calibrationFactor,
  calibrationPlausible,
  cellSizeMm,
  gridResolution,
  rugAreaCm2,
  yarnEstimate,
  yarnFromTravel,
} from './calc'
import type { SetupProfile } from '../types'

const setup: SetupProfile = {
  id: 's',
  name: 't',
  stitchesPerCm: 2,
  pileHeightMm: 18,
  pile: 'cut',
}

describe('gridResolution', () => {
  it('spec example: 80 cm at 2 stitches/cm = 160 columns', () => {
    expect(gridResolution({ widthCm: 80, heightCm: 120, stitchesPerCm: 2 })).toEqual(
      { cols: 160, rows: 240 },
    )
  })
  it('rounds fractional stitch counts', () => {
    expect(
      gridResolution({ widthCm: 33.3, heightCm: 10, stitchesPerCm: 2 }).cols,
    ).toBe(67)
  })
  it('never returns below 1', () => {
    expect(gridResolution({ widthCm: 0, heightCm: 0, stitchesPerCm: 2 })).toEqual(
      { cols: 1, rows: 1 },
    )
  })
})

describe('rugAreaCm2 / cellSizeMm', () => {
  it('area is width*height', () => {
    expect(rugAreaCm2({ widthCm: 80, heightCm: 120, stitchesPerCm: 2 })).toBe(9600)
  })
  it('cell size is 10mm / density', () => {
    expect(cellSizeMm(2)).toBe(5)
    expect(cellSizeMm(4)).toBe(2.5)
  })
})

describe('yarnEstimate (uncalibrated)', () => {
  it('is positive and marked uncalibrated', () => {
    const r = yarnEstimate({ areaCm2: 9600, setup })
    expect(r.calibrated).toBe(false)
    expect(r.lengthM).toBeGreaterThan(0)
    expect(r.weightG).toBeGreaterThan(0)
  })
  it('scales with area', () => {
    const a = yarnEstimate({ areaCm2: 1000, setup }).weightG
    const b = yarnEstimate({ areaCm2: 2000, setup }).weightG
    expect(b / a).toBeCloseTo(2, 5)
  })
  it('grows with pile height', () => {
    const short = yarnEstimate({
      areaCm2: 1000,
      setup: { ...setup, pileHeightMm: 10 },
    }).weightG
    const tall = yarnEstimate({
      areaCm2: 1000,
      setup: { ...setup, pileHeightMm: 25 },
    }).weightG
    expect(tall).toBeGreaterThan(short)
  })
})

describe('yarnFromTravel', () => {
  it('zero travel is zero yarn', () => {
    const r = yarnFromTravel({ travelCm: 0, setup })
    expect(r.lengthM).toBe(0)
    expect(r.weightG).toBe(0)
    expect(r.calibrated).toBe(false)
  })

  it('scales linearly with travel', () => {
    const a = yarnFromTravel({ travelCm: 1000, setup }).weightG
    const b = yarnFromTravel({ travelCm: 2000, setup }).weightG
    expect(b / a).toBeCloseTo(2, 5)
  })

  it('grows with pile height', () => {
    const short = yarnFromTravel({
      travelCm: 1000,
      setup: { ...setup, pileHeightMm: 8 },
    }).weightG
    const tall = yarnFromTravel({
      travelCm: 1000,
      setup: { ...setup, pileHeightMm: 25 },
    }).weightG
    expect(tall).toBeGreaterThan(short)
  })

  it('is in the same ballpark as the area estimate for a solid area', () => {
    // a solid area: fill travel ~= area * stitchesPerCm
    const areaCm2 = 2000
    const travelCm = areaCm2 * setup.stitchesPerCm
    const viaArea = yarnEstimate({ areaCm2, setup }).lengthM
    const viaTravel = yarnFromTravel({ travelCm, setup }).lengthM
    expect(viaTravel).toBeGreaterThan(viaArea * 0.6)
    expect(viaTravel).toBeLessThan(viaArea * 2)
  })

  it('uses the calibration factor when present', () => {
    const s: SetupProfile = {
      ...setup,
      calibration: {
        patchWidthCm: 10,
        patchHeightCm: 10,
        gramsUsed: 12,
        pileHeightMm: 18,
        factor: 0.12,
      },
    }
    const r = yarnFromTravel({ travelCm: 500, setup: s, wasteFactor: 0 })
    expect(r.calibrated).toBe(true)
    expect(r.weightG).toBeGreaterThan(0)
  })
})

describe('yarnEstimate (calibrated)', () => {
  it('uses the calibration factor and scales linearly with pile height', () => {
    const s: SetupProfile = {
      ...setup,
      calibration: {
        patchWidthCm: 10,
        patchHeightCm: 10,
        gramsUsed: 12,
        pileHeightMm: 18,
        factor: 0.12,
      },
    }
    const base = yarnEstimate({ areaCm2: 100, setup: s, wasteFactor: 0 })
    expect(base.calibrated).toBe(true)
    expect(base.weightG).toBeCloseTo(12, 5) // 100 cm² * 0.12

    const taller = yarnEstimate({
      areaCm2: 100,
      setup: { ...s, pileHeightMm: 36 },
      wasteFactor: 0,
    })
    expect(taller.weightG).toBeCloseTo(24, 5)
  })
})

describe('calibration', () => {
  it('factor is grams / area', () => {
    expect(
      calibrationFactor({ patchWidthCm: 10, patchHeightCm: 10, gramsUsed: 12 }),
    ).toBeCloseTo(0.12, 6)
  })
  it('plausibility guard', () => {
    expect(calibrationPlausible(0.12)).toBe(true)
    expect(calibrationPlausible(0.01)).toBe(false)
    expect(calibrationPlausible(0.9)).toBe(false)
  })
})
