/* ------------------------------------------------------------------ *
 * Glue between a computed Pattern + Project and the pure pricing maths
 * in lib/pricing.ts: derives the tufted area and the path travel, then
 * runs the cost + price calculation. Shared by the Export step and the
 * overview-sheet exporter so both show the same numbers.
 * ------------------------------------------------------------------ */

import { areaByColor, effectiveColorIndex, resolvedSet } from './pattern'
import { buildTuftPath } from './tuftpath'
import {
  costBreakdown,
  marginScenarios,
  suggestedPrice,
  type CostBreakdown,
  type PriceResult,
  type RugInput,
  type Scenario,
} from './pricing'
import type { Pattern, Project } from '../types'

export interface ProjectCost {
  rug: RugInput
  cost: CostBreakdown
  price: PriceResult
  scenarios: Scenario[]
}

export function projectCost(
  pattern: Pattern,
  project: Project,
  sourceRaster?: ImageData | null,
): ProjectCost {
  const merges = project.colorMerges ?? {}
  const bgSet = resolvedSet(project.bgColors, merges)
  const cellCm = pattern.cellSizeMm / 10

  const stitches = areaByColor(
    pattern,
    project.recolors,
    merges,
    bgSet,
  ).reduce((s, n) => s + n, 0)
  const tuftedAreaCm2 = stitches * cellCm * cellCm

  const eff = (rid: number) =>
    effectiveColorIndex(pattern.regions[rid], project.recolors, merges)

  const plan = buildTuftPath(pattern, {
    skipRegion: (rid) => bgSet.has(eff(rid)),
    outlineEps: project.pathSmoothing,
    refine: sourceRaster
      ? {
          source: sourceRaster,
          colorLabOf: (rid) =>
            (pattern.palette[eff(rid)]?.lab ?? [0, 0, 0]) as [
              number,
              number,
              number,
            ],
        }
      : undefined,
  })

  const rug: RugInput = {
    size: project.size,
    tuftedAreaCm2,
    travelCm: plan.totalTravelCm,
  }
  const cost = costBreakdown(rug, project.setupProfile, project.businessProfile)
  const price = suggestedPrice(cost.total, project.businessProfile)
  const scenarios = marginScenarios(cost.total, project.businessProfile)
  return { rug, cost, price, scenarios }
}
