/* ------------------------------------------------------------------ *
 * Iteration 4 — material, cost and price calculator.
 *
 * All pure: takes the two numbers the pattern/path produce (tufted area
 * and gun travel) plus the profiles, and returns a material list, a
 * cost breakdown and a fee-aware suggested selling price. No DOM, no
 * pattern/tuftpath imports — easy to unit-test.
 * ------------------------------------------------------------------ */

import type { BusinessProfile, RugSize, SetupProfile } from '../types'
import { yarnFromTravel } from './calc'

/** rug glue is roughly this many kg per m² of backing */
const GLUE_KG_PER_M2 = 1.3
/** extra primary-cloth border needed to stretch on the frame, per side */
const FRAME_MARGIN_CM = 15
/** extra backing cloth past the rug edge, per side */
const BACKING_MARGIN_CM = 5

export interface RugInput {
  size: RugSize
  /** stitched area that actually gets tufted (background excluded), cm² */
  tuftedAreaCm2: number
  /** gun travel from the tufting path (outline + fill), cm */
  travelCm: number
}

export interface MaterialLine {
  key: 'yarn' | 'primary' | 'backing' | 'glue'
  label: string
  qty: number
  unit: string
  unitPrice: number
  cost: number
}

export interface CostBreakdown {
  materials: MaterialLine[]
  materialTotal: number
  labourHours: number
  labourCost: number
  electricity: number
  /** cost to make, before marketplace fees and profit */
  total: number
  yarnCalibrated: boolean
}

export interface PriceResult {
  cost: number
  fees: number
  profit: number
  /** suggested selling price */
  price: number
  marginPct: number
}

/* ---- materials ---------------------------------------------- */

export function estimateMaterials(
  rug: RugInput,
  setup: SetupProfile,
  biz: BusinessProfile,
): { lines: MaterialLine[]; total: number; yarnCalibrated: boolean } {
  const { widthCm, heightCm } = rug.size

  // yarn — reuse the calibration-aware estimate from calc.ts
  const yarn = yarnFromTravel({ travelCm: rug.travelCm, setup })
  const yarnKg = yarn.weightG / 1000

  // primary cloth: a piece FRAME_MARGIN_CM larger on every side, taken
  // from a roll of the given width
  const pieceW = widthCm + 2 * FRAME_MARGIN_CM
  const pieceH = heightCm + 2 * FRAME_MARGIN_CM
  let primaryM: number
  if (pieceW <= biz.rollWidthCm) primaryM = pieceH / 100
  else if (pieceH <= biz.rollWidthCm) primaryM = pieceW / 100
  else primaryM = (pieceW * pieceH) / biz.rollWidthCm / 100

  // backing: rug area plus a small border
  const backingM2 =
    ((widthCm + 2 * BACKING_MARGIN_CM) * (heightCm + 2 * BACKING_MARGIN_CM)) /
    10_000

  const glueKg = backingM2 * GLUE_KG_PER_M2

  const lines: MaterialLine[] = [
    {
      key: 'yarn',
      label: 'Garn',
      qty: yarnKg,
      unit: 'kg',
      unitPrice: biz.yarnPricePerKg,
      cost: yarnKg * biz.yarnPricePerKg,
    },
    {
      key: 'primary',
      label: 'Trägerstoff',
      qty: primaryM,
      unit: 'm',
      unitPrice: biz.primaryClothPricePerM,
      cost: primaryM * biz.primaryClothPricePerM,
    },
    {
      key: 'backing',
      label: 'Rückseitenstoff',
      qty: backingM2,
      unit: 'm²',
      unitPrice: biz.backingPricePerM2,
      cost: backingM2 * biz.backingPricePerM2,
    },
    {
      key: 'glue',
      label: 'Kleber',
      qty: glueKg,
      unit: 'kg',
      unitPrice: biz.gluePricePerKg,
      cost: glueKg * biz.gluePricePerKg,
    },
  ]
  const total = lines.reduce((s, l) => s + l.cost, 0)
  return { lines, total, yarnCalibrated: yarn.calibrated }
}

/* ---- cost to make ----------------------------------------- */

export function costBreakdown(
  rug: RugInput,
  setup: SetupProfile,
  biz: BusinessProfile,
): CostBreakdown {
  const { widthCm, heightCm } = rug.size
  const areaM2 = (widthCm * heightCm) / 10_000

  const mat = estimateMaterials(rug, setup, biz)
  const labourHours = areaM2 * biz.hoursPerM2
  const labourCost = labourHours * biz.hourlyRate
  const electricity = biz.electricityFlat

  return {
    materials: mat.lines,
    materialTotal: mat.total,
    labourHours,
    labourCost,
    electricity,
    total: mat.total + labourCost + electricity,
    yarnCalibrated: mat.yarnCalibrated,
  }
}

/* ---- suggested price (fee-aware) -------------------------- */

/**
 * Solve  price = cost + fees(price) + profit(price)  for `price`.
 *
 *   fees   = price · (feeTransactionPct + feePaymentPct)/100
 *          + feePaymentFixed + feeListing
 *   profit = targetProfit                    (mode "profit")
 *          | price · targetMarginPct/100     (mode "margin")
 */
export function suggestedPrice(
  cost: number,
  biz: BusinessProfile,
): PriceResult {
  const pctFees = (biz.feeTransactionPct + biz.feePaymentPct) / 100
  const fixedFees = biz.feePaymentFixed + biz.feeListing

  let price: number
  if (biz.targetMode === 'margin') {
    const m = biz.targetMarginPct / 100
    const denom = 1 - pctFees - m
    price = denom > 0.01 ? (cost + fixedFees) / denom : NaN
  } else {
    const denom = 1 - pctFees
    price = denom > 0.01 ? (cost + fixedFees + biz.targetProfit) / denom : NaN
  }

  const fees = Number.isFinite(price) ? price * pctFees + fixedFees : NaN
  const profit = Number.isFinite(price) ? price - cost - fees : NaN
  const marginPct =
    Number.isFinite(price) && price > 0 ? (profit / price) * 100 : NaN

  return { cost, fees, profit, price, marginPct }
}

export interface Scenario {
  label: string
  marginPct: number
  price: number
  profit: number
}

/** price at a spread of target margins, for a quick "what if" table */
export function marginScenarios(
  cost: number,
  biz: BusinessProfile,
  margins: number[] = [30, 40, 50, 60],
): Scenario[] {
  return margins.map((mPct) => {
    const r = suggestedPrice(cost, {
      ...biz,
      targetMode: 'margin',
      targetMarginPct: mPct,
    })
    return {
      label: `${mPct}%`,
      marginPct: mPct,
      price: r.price,
      profit: r.profit,
    }
  })
}
