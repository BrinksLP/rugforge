/* ------------------------------------------------------------------ *
 * Pure calculation helpers. These are the functions covered by Vitest
 * (see src/lib/calc.test.ts). No DOM, no side effects.
 * ------------------------------------------------------------------ */

import type { Calibration, RugSize, SetupProfile } from '../types'

/** grid columns/rows for a rug size. 1 cell = 1 stitch. */
export function gridResolution(size: RugSize): { cols: number; rows: number } {
  const cols = Math.max(1, Math.round(size.widthCm * size.stitchesPerCm))
  const rows = Math.max(1, Math.round(size.heightCm * size.stitchesPerCm))
  return { cols, rows }
}

export function rugAreaCm2(size: RugSize): number {
  return size.widthCm * size.heightCm
}

/** mm covered by one stitch cell, from stitch density */
export function cellSizeMm(stitchesPerCm: number): number {
  return 10 / stitchesPerCm
}

/**
 * Area-based yarn estimate (spec, Iteration 4 formula, used early as a
 * rough number in the legend).
 *
 * yarn_length_cm = area_cm² · stitches_per_cm² · 2 · pile_height_cm · (1 + waste)
 * weight_g       = length_cm / run_length_cm_per_g
 *
 * Everything here is an estimate: ±30–50 % without calibration.
 */
export function yarnEstimate(params: {
  areaCm2: number
  setup: SetupProfile
  wasteFactor?: number
}): { lengthM: number; weightG: number; calibrated: boolean } {
  const { areaCm2, setup } = params
  const waste = params.wasteFactor ?? 0.15
  const spc = setup.stitchesPerCm
  const pileCm = setup.pileHeightMm / 10

  // calibrated path: g/cm², scaled ~linearly with pile height
  if (setup.calibration) {
    const c = setup.calibration
    const scale = c.pileHeightMm > 0 ? setup.pileHeightMm / c.pileHeightMm : 1
    const weightG = areaCm2 * c.factor * scale * (1 + waste)
    const lengthM = setup.runLengthMPerG
      ? weightG * setup.runLengthMPerG
      : NaN
    return { lengthM, weightG, calibrated: true }
  }

  const lengthCm = areaCm2 * spc * spc * 2 * pileCm * (1 + waste)
  const lengthM = lengthCm / 100
  // fall back to a typical acrylic rug yarn run length if unknown: ~8 m/g
  const runLengthMPerG = setup.runLengthMPerG ?? 8
  const weightG = lengthM / runLengthMPerG
  return { lengthM, weightG, calibrated: false }
}

/**
 * Yarn from actual gun travel (outline + fill path length) — Iteration 3.
 *
 * Along 1 cm of travel the gun makes ~stitches_per_cm penetrations, each
 * pulling roughly 2 · pile_height of yarn into the backing; plus ~1 cm
 * of yarn carried along the path itself.
 *
 *   yarn_length_cm = travel_cm · (1 + 2 · pile_cm · stitches_per_cm) · (1 + waste)
 *
 * The "2 ·" constant is the crude part; Iteration 4's calibration test
 * replaces it with a measured value. Still an estimate: ±30–50 %.
 */
export function yarnFromTravel(params: {
  travelCm: number
  setup: SetupProfile
  wasteFactor?: number
}): { lengthM: number; weightG: number; calibrated: boolean } {
  const { travelCm, setup } = params
  const waste = params.wasteFactor ?? 0.15
  const spc = setup.stitchesPerCm
  const pileCm = setup.pileHeightMm / 10

  if (setup.calibration) {
    const c = setup.calibration
    const scale = c.pileHeightMm > 0 ? setup.pileHeightMm / c.pileHeightMm : 1
    // calibration factor is g/cm²; cm² covered per cm of travel ≈ row spacing = 1/spc
    const gPerTravelCm = (c.factor / spc) * scale
    const weightG = travelCm * gPerTravelCm * (1 + waste)
    const lengthM = setup.runLengthMPerG ? weightG * setup.runLengthMPerG : NaN
    return { lengthM, weightG, calibrated: true }
  }

  const yarnPerTravelCm = 1 + 2 * pileCm * spc
  const lengthM = (travelCm * yarnPerTravelCm * (1 + waste)) / 100
  const runLengthMPerG = setup.runLengthMPerG ?? 8
  const weightG = lengthM / runLengthMPerG
  return { lengthM, weightG, calibrated: false }
}

/** g/cm² from a calibration patch. */
export function calibrationFactor(input: {
  patchWidthCm: number
  patchHeightCm: number
  gramsUsed: number
}): number {
  const area = input.patchWidthCm * input.patchHeightCm
  if (area <= 0) return 0
  return input.gramsUsed / area
}

/** true when a calibration factor is within a sane tufting range */
export function calibrationPlausible(factor: number): boolean {
  return factor >= 0.03 && factor <= 0.4
}

export function makeCalibration(input: {
  patchWidthCm: number
  patchHeightCm: number
  gramsUsed: number
  pileHeightMm: number
}): Calibration {
  return {
    ...input,
    factor: calibrationFactor(input),
  }
}
