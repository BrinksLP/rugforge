/* ------------------------------------------------------------------ *
 * Core data model.
 *
 * Design rule (from the spec): REGION and COLOUR are separate.
 * A region is a fixed piece of grid geometry. Its colour is just an
 * index into the palette and can be changed without touching the
 * geometry. For yarn/area maths, touching regions that share a colour
 * are treated as one "area" — computed on demand, never stored.
 * ------------------------------------------------------------------ */

export interface PaletteColor {
  index: number
  hex: string
  /** CIE Lab, kept so re-quantising / merging stays perceptually sane */
  lab: [number, number, number]
  /** short human label, e.g. "Farbe 3" — editable */
  name: string
}

export interface Region {
  id: number
  /** index into Pattern.palette */
  colorIndex: number
  cellCount: number
  /** inclusive grid bounds [minX, minY, maxX, maxY] */
  bbox: [number, number, number, number]
  /** true once the pipeline flagged it as below the min-area threshold */
  tooSmall: boolean
}

export interface Pattern {
  cols: number
  rows: number
  /** length cols*rows. Value = region id, or -1 for masked-out / empty. */
  cells: Int32Array
  regions: Region[]
  palette: PaletteColor[]
  /** mm per grid cell (1 cell = 1 stitch) */
  cellSizeMm: number
}

export type PatternPreset = 'simple' | 'medium' | 'detailed'

export interface PatternSettings {
  preset: PatternPreset
  colorCount: number
  /** islands smaller than this many stitches get merged into a neighbour */
  minRegionStitches: number
  /** 0 = off, 1 = light, 2 = strong */
  smoothing: 0 | 1 | 2
}

export const PRESETS: Record<PatternPreset, Omit<PatternSettings, 'preset'>> = {
  simple: { colorCount: 4, minRegionStitches: 12, smoothing: 2 },
  medium: { colorCount: 7, minRegionStitches: 6, smoothing: 1 },
  detailed: { colorCount: 10, minRegionStitches: 3, smoothing: 0 },
}

/* ---- geometry ----------------------------------------------------- */

/** a rectangle in original-image pixel coords */
export interface Crop {
  x: number
  y: number
  w: number
  h: number
}

/* ---- size / grid --------------------------------------------------- */

export interface RugSize {
  widthCm: number
  heightCm: number
  /** stitches per cm (spec example: 2/cm → 80 cm = 160 cols) */
  stitchesPerCm: number
}

/* ---- profiles ---------------------------------------------------- */

export interface Calibration {
  patchWidthCm: number
  patchHeightCm: number
  /** grams of yarn used for the calibration patch */
  gramsUsed: number
  pileHeightMm: number
  /** g/cm² — derived, stored for reference */
  factor: number
}

export interface SetupProfile {
  id: string
  name: string
  stitchesPerCm: number
  pileHeightMm: number
  pile: 'cut' | 'loop'
  /** metres of yarn per gram (run length); optional until the user knows it */
  runLengthMPerG?: number
  calibration?: Calibration
}

export interface BusinessProfile {
  id: string
  name: string
  yarnPricePerKg: number
  primaryClothPricePerM: number
  backingPricePerM2: number
  gluePricePerKg: number
  rollWidthCm: number
  hourlyRate: number
  /** working hours per m² of finished rug (tuft + carve + glue + back + bind + trim) */
  hoursPerM2: number
  electricityFlat: number
  /** Etsy / EU fee defaults */
  feeTransactionPct: number
  feePaymentPct: number
  feePaymentFixed: number
  feeListing: number
  shipping: 'buyer-pays' | 'free-shipping'
  targetMode: 'profit' | 'margin'
  targetProfit: number
  targetMarginPct: number
}

/* ---- project --------------------------------------------------- */

export interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  /** original upload as a data URL */
  imageDataUrl: string | null
  /** crop box in original-image pixel coords */
  crop: Crop | null
  size: RugSize
  settings: PatternSettings
  /** recolour overrides: regionId -> paletteIndex */
  recolors: Record<number, number>
  /**
   * palette merges: paletteIndex -> paletteIndex it is folded into.
   * Lets you quantise at a high colour count for clean edges, then
   * collapse near-duplicate swatches into one yarn. Chains are followed.
   */
  colorMerges: Record<number, number>
  /**
   * palette indices marked "not tufted" — e.g. the leftover image
   * background. Excluded from the path, the area/yarn totals and the
   * legend. Stored resolved-through-merges is not required; callers
   * resolve on read.
   */
  bgColors: number[]
  /** tufting-path outline smoothing (RDP tolerance) in stitches */
  pathSmoothing: number
  setupProfile: SetupProfile
  businessProfile: BusinessProfile
  /** schema version for future migrations */
  version: 1
}
