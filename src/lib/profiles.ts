/* ------------------------------------------------------------------ *
 * Ship one conservative Standard of each profile type. Projects
 * reference a profile but keep local overrides (shown as "weicht ab").
 * ------------------------------------------------------------------ */

import type { BusinessProfile, SetupProfile } from '../types'

let seq = 0
export function id(prefix = 'id'): string {
  // no Date.now()/Math.random() dependency for determinism in tests;
  // fine for local uniqueness within a session.
  seq += 1
  return `${prefix}_${seq.toString(36)}_${(performance.now() | 0).toString(36)}`
}

export const STANDARD_SETUP: SetupProfile = {
  id: 'setup_standard',
  name: 'Standard (konservativ)',
  stitchesPerCm: 2, // ~20 stitches / 10 cm
  pileHeightMm: 18, // "medium" preset
  pile: 'cut',
  runLengthMPerG: undefined,
}

export const STANDARD_BUSINESS: BusinessProfile = {
  id: 'business_standard',
  name: 'Standard (EU / Etsy)',
  yarnPricePerKg: 25,
  primaryClothPricePerM: 6,
  backingPricePerM2: 4,
  gluePricePerKg: 9,
  rollWidthCm: 200,
  hourlyRate: 15,
  electricityFlat: 0.5,
  feeTransactionPct: 6.5,
  feePaymentPct: 4,
  feePaymentFixed: 0.3,
  feeListing: 0.2,
  shipping: 'buyer-pays',
  targetMode: 'margin',
  targetProfit: 40,
  targetMarginPct: 40,
}

export function cloneSetup(p: SetupProfile, name?: string): SetupProfile {
  return { ...p, id: id('setup'), name: name ?? `${p.name} (Kopie)` }
}

export function cloneBusiness(
  p: BusinessProfile,
  name?: string,
): BusinessProfile {
  return { ...p, id: id('business'), name: name ?? `${p.name} (Kopie)` }
}
