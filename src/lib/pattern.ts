/* ------------------------------------------------------------------ *
 * The image -> pattern pipeline.
 *
 *   source image (already cropped + masked)
 *     -> fit a Lab k-means palette (<= 10) on a pixel subsample
 *     -> per stitch cell: majority vote of its source footprint against
 *        that palette   (1 cell = 1 stitch; majority, not average, so
 *        edges stay crisp instead of blending into a mis-classified band)
 *     -> majority-filter smoothing + single-cell staircase removal
 *     -> connected-component regions
 *     -> small-area cleanup (merge islands into largest neighbour)
 *     -> palette + region list
 *
 * The automatic colour reduction is happiest with graphic motifs.
 * Photos work once their background is removed in the Freistellen step
 * (offline u2netp segmentation, see lib/segmentation.ts) and the palette
 * is nudged down.
 * ------------------------------------------------------------------ */

import { labDist2, labToHex, rgbToLab, type Lab } from './color'
import { kmeansLab } from './kmeans'
import type { Pattern, PaletteColor, PatternSettings, Region } from '../types'

const EMPTY = -1
const FIT_SAMPLE_CAP = 40_000

export interface BuildInput {
  /** RGBA pixels of the source (any size) */
  source: ImageData
  cols: number
  rows: number
  cellSizeMm: number
  settings: PatternSettings
}

/* ---- 1. fit palette, then assign each cell by majority vote ----- *
 * One k-means fit on a subsample of source pixels, then every stitch
 * cell takes the *majority* palette colour over its source footprint.
 * Majority instead of average is what keeps edges crisp: a cell that is
 * 70% frame / 30% background becomes solidly "frame" rather than a
 * blend that lands between two centres and flips cell-to-cell along the
 * edge — the ragged-border effect at low colour counts.
 *
 * k-means always runs at a FIXED high k (seed depends only on the
 * sample count, not the target), then centres are agglomeratively
 * merged down to `k`. So lowering the "Farben" slider *merges the two
 * closest colours* step by step instead of re-rolling the whole
 * clustering — the colour count moves monotonically and predictably.
 * ------------------------------------------------------------------ */

const KFIT = 10

function fitPalette(src: ImageData, k: number): Lab[] {
  const { width: sw, height: sh, data } = src
  const stride = Math.max(1, Math.round(Math.sqrt((sw * sh) / FIT_SAMPLE_CAP)))
  const samples: number[] = []
  for (let y = 0; y < sh; y += stride) {
    for (let x = 0; x < sw; x += stride) {
      const i = (y * sw + x) * 4
      if (data[i + 3] < 128) continue
      const [L, a, b] = rgbToLab(data[i], data[i + 1], data[i + 2])
      samples.push(L, a, b)
    }
  }
  if (samples.length < 3) return [[0, 0, 0]]

  const target = Math.max(1, Math.min(KFIT, k))
  const { centers, assignments } = kmeansLab(Float64Array.from(samples), KFIT)
  const pop = new Array(centers.length).fill(0)
  for (const a of assignments) pop[a]++
  return mergeCentres(centers, pop, target)
}

// centres closer than this in Lab (~ΔE 3) are the same colour for
// tufting purposes — always fused, even above the target count, so the
// legend never shows near-duplicate swatches.
const DUP_DIST2 = 9

/** repeatedly fuse the two nearest centres (population-weighted mean)
 *  until `target` remain AND no pair is a near-duplicate.
 *  Deterministic; O(KFIT^3). */
function mergeCentres(centres: Lab[], pop: number[], target: number): Lab[] {
  const cs = centres.map((c) => [c[0], c[1], c[2]] as Lab)
  const ps = pop.slice()
  for (;;) {
    let bi = 0
    let bj = 1
    let best = Infinity
    for (let i = 0; i < cs.length; i++) {
      for (let j = i + 1; j < cs.length; j++) {
        const d = labDist2(cs[i], cs[j])
        if (d < best) {
          best = d
          bi = i
          bj = j
        }
      }
    }
    if (cs.length <= target && best > DUP_DIST2) break
    if (cs.length <= 1) break
    const wi = ps[bi] || 1
    const wj = ps[bj] || 1
    const w = wi + wj
    cs[bi] = [
      (cs[bi][0] * wi + cs[bj][0] * wj) / w,
      (cs[bi][1] * wi + cs[bj][1] * wj) / w,
      (cs[bi][2] * wi + cs[bj][2] * wj) / w,
    ]
    ps[bi] = ps[bi] + ps[bj]
    cs.splice(bj, 1)
    ps.splice(bj, 1)
  }
  return cs
}

function assignCells(
  src: ImageData,
  cols: number,
  rows: number,
  centers: Lab[],
): Int32Array {
  const { width: sw, height: sh, data } = src
  const cluster = new Int32Array(cols * rows).fill(EMPTY)
  const votes = new Int32Array(centers.length)

  for (let gy = 0; gy < rows; gy++) {
    const y0 = Math.floor((gy * sh) / rows)
    const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * sh) / rows))
    for (let gx = 0; gx < cols; gx++) {
      const x0 = Math.floor((gx * sw) / cols)
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * sw) / cols))

      // sub-sample the footprint: at most ~6x6 lookups per cell
      const sx = Math.max(1, Math.floor((x1 - x0) / 6))
      const sy = Math.max(1, Math.floor((y1 - y0) / 6))

      votes.fill(0)
      let opaque = 0
      let total = 0
      for (let y = y0; y < y1; y += sy) {
        for (let x = x0; x < x1; x += sx) {
          total++
          const i = (y * sw + x) * 4
          if (data[i + 3] < 128) continue
          opaque++
          const p = rgbToLab(data[i], data[i + 1], data[i + 2])
          let best = 0
          let bestD = Infinity
          for (let c = 0; c < centers.length; c++) {
            const d = labDist2(p, centers[c])
            if (d < bestD) {
              bestD = d
              best = c
            }
          }
          votes[best]++
        }
      }
      if (opaque === 0 || opaque < total * 0.4) continue

      let best = 0
      let bestN = -1
      for (let c = 0; c < centers.length; c++) {
        if (votes[c] > bestN) {
          bestN = votes[c]
          best = c
        }
      }
      cluster[gy * cols + gx] = best
    }
  }
  return cluster
}

/* ---- 3. smoothing (majority filter) ---------------------------- */

function smooth(
  cluster: Int32Array,
  cols: number,
  rows: number,
  passes: number,
): void {
  if (passes <= 0) return
  const counts = new Int32Array(16)
  for (let p = 0; p < passes; p++) {
    const next = cluster.slice()
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        if (cluster[i] === EMPTY) continue
        counts.fill(0)
        let bestC = cluster[i]
        let bestN = -1
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
            const c = cluster[ny * cols + nx]
            if (c === EMPTY) continue
            counts[c]++
            if (counts[c] > bestN) {
              bestN = counts[c]
              bestC = c
            }
          }
        }
        next[i] = bestC
      }
    }
    cluster.set(next)
  }
}

/* ---- 3b. staircase removal ----------------------------------- *
 * Flip a cell only when 3+ of its 4 orthogonal neighbours agree on one
 * other colour. That erases single-cell steps and notches along an
 * edge without rounding corners or eroding anything thicker than one
 * cell (a 4-cell-wide frame keeps its edges; its outer cells see just
 * one differing neighbour). This is what actually straightens the
 * ragged borders you get at low colour counts.
 * ------------------------------------------------------------------ */

function antiJag(
  cluster: Int32Array,
  cols: number,
  rows: number,
  passes: number,
): void {
  for (let p = 0; p < passes; p++) {
    const next = cluster.slice()
    let changed = 0
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        const cur = cluster[i]
        if (cur === EMPTY) continue
        let other = EMPTY
        let agree = 0
        let differ = 0
        const ns = [
          y > 0 ? cluster[i - cols] : EMPTY,
          y < rows - 1 ? cluster[i + cols] : EMPTY,
          x > 0 ? cluster[i - 1] : EMPTY,
          x < cols - 1 ? cluster[i + 1] : EMPTY,
        ]
        for (const n of ns) {
          if (n === EMPTY || n === cur) continue
          differ++
          if (other === EMPTY || n === other) {
            other = n
            agree++
          }
        }
        if (agree >= 3 && differ === agree) {
          next[i] = other
          changed++
        }
      }
    }
    cluster.set(next)
    if (changed === 0) break
  }
}

/* ---- 4. connected components -------------------------------- */

function label(
  cluster: Int32Array,
  cols: number,
  rows: number,
): { cells: Int32Array; regions: Region[] } {
  const cells = new Int32Array(cols * rows).fill(EMPTY)
  const regions: Region[] = []
  const stack: number[] = []

  for (let start = 0; start < cluster.length; start++) {
    if (cluster[start] === EMPTY || cells[start] !== EMPTY) continue
    const colorIndex = cluster[start]
    const id = regions.length
    let count = 0
    let minX = cols
    let minY = rows
    let maxX = 0
    let maxY = 0

    stack.push(start)
    cells[start] = id
    while (stack.length) {
      const p = stack.pop()!
      const x = p % cols
      const y = (p / cols) | 0
      count++
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y

      if (x > 0) {
        const q = p - 1
        if (cells[q] === EMPTY && cluster[q] === colorIndex) {
          cells[q] = id
          stack.push(q)
        }
      }
      if (x < cols - 1) {
        const q = p + 1
        if (cells[q] === EMPTY && cluster[q] === colorIndex) {
          cells[q] = id
          stack.push(q)
        }
      }
      if (y > 0) {
        const q = p - cols
        if (cells[q] === EMPTY && cluster[q] === colorIndex) {
          cells[q] = id
          stack.push(q)
        }
      }
      if (y < rows - 1) {
        const q = p + cols
        if (cells[q] === EMPTY && cluster[q] === colorIndex) {
          cells[q] = id
          stack.push(q)
        }
      }
    }

    regions.push({
      id,
      colorIndex,
      cellCount: count,
      bbox: [minX, minY, maxX, maxY],
      tooSmall: false,
    })
  }
  return { cells, regions }
}

/* ---- 5. small-area cleanup -------------------------------- */

/**
 * Repeatedly dissolve the smallest region that is below the threshold
 * into the neighbouring colour it shares the longest border with.
 * Operates on the cluster grid, then components are rebuilt.
 */
function cleanup(
  cluster: Int32Array,
  cols: number,
  rows: number,
  minStitches: number,
): void {
  const maxPasses = 40
  for (let pass = 0; pass < maxPasses; pass++) {
    const { cells, regions } = label(cluster, cols, rows)
    if (regions.length <= 1) return

    let victim: Region | null = null
    for (const r of regions) {
      if (r.cellCount < minStitches && (!victim || r.cellCount < victim.cellCount))
        victim = r
    }
    if (!victim) return

    // tally shared border by neighbouring colour
    const border = new Map<number, number>()
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        if (cells[i] !== victim.id) continue
        const neigh = [
          x > 0 ? i - 1 : -1,
          x < cols - 1 ? i + 1 : -1,
          y > 0 ? i - cols : -1,
          y < rows - 1 ? i + cols : -1,
        ]
        for (const q of neigh) {
          if (q < 0) continue
          const rc = cells[q]
          if (rc === EMPTY || rc === victim.id) continue
          const col = cluster[q]
          border.set(col, (border.get(col) ?? 0) + 1)
        }
      }
    }

    let targetColor = -1
    let bestLen = -1
    for (const [col, len] of border) {
      if (len > bestLen) {
        bestLen = len
        targetColor = col
      }
    }
    if (targetColor < 0) {
      // fully enclosed by empty space — leave it, mark handled by exiting
      return
    }
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === victim.id) cluster[i] = targetColor
    }
  }
}

/* ---- assemble ------------------------------------------------ */

export function buildPattern(input: BuildInput): Pattern {
  const { source, cols, rows, cellSizeMm, settings } = input

  const k = Math.max(2, Math.min(10, settings.colorCount))
  const centers = fitPalette(source, k)
  const cluster = assignCells(source, cols, rows, centers)

  smooth(cluster, cols, rows, settings.smoothing)
  cleanup(cluster, cols, rows, settings.minRegionStitches)
  antiJag(cluster, cols, rows, settings.smoothing > 0 ? 2 : 1)
  smooth(cluster, cols, rows, settings.smoothing > 0 ? 1 : 0)

  const { cells, regions } = label(cluster, cols, rows)

  // usage per colour, to order the legend
  const usage = new Array(centers.length).fill(0)
  for (const r of regions) usage[r.colorIndex] += r.cellCount

  const order = centers
    .map((_, i) => i)
    .filter((i) => usage[i] > 0)
    .sort((a, b) => usage[b] - usage[a])
  const remap = new Map<number, number>()
  order.forEach((oldIdx, newIdx) => remap.set(oldIdx, newIdx))

  const palette: PaletteColor[] = order.map((oldIdx, newIdx) => {
    const lab = centers[oldIdx] as Lab
    return {
      index: newIdx,
      hex: labToHex(lab),
      lab: [lab[0], lab[1], lab[2]],
      name: `Farbe ${newIdx + 1}`,
    }
  })

  const finalRegions: Region[] = regions.map((r) => ({
    ...r,
    colorIndex: remap.get(r.colorIndex) ?? 0,
    tooSmall: r.cellCount < settings.minRegionStitches,
  }))

  return {
    cols,
    rows,
    cells,
    regions: finalRegions,
    palette,
    cellSizeMm,
  }
}

/* ---- derived helpers (region vs colour) ---------------------- */

/** follow a palette merge chain to the colour it ultimately resolves to */
export function resolveMergedColor(
  index: number,
  merges: Record<number, number> = {},
): number {
  let i = index
  const seen = new Set<number>()
  while (merges[i] != null && merges[i] !== i && !seen.has(i)) {
    seen.add(i)
    i = merges[i]
  }
  return i
}

/** resolve palette indices through merges into a Set of root indices */
export function resolvedSet(
  indices: readonly number[] | undefined,
  merges: Record<number, number> = {},
): Set<number> {
  const s = new Set<number>()
  for (const i of indices ?? []) s.add(resolveMergedColor(i, merges))
  return s
}

/** stitch count per palette colour, honouring recolours + merges.
 *  `skip` (resolved indices, e.g. background) contribute 0. */
export function areaByColor(
  pattern: Pattern,
  recolors: Record<number, number>,
  merges: Record<number, number> = {},
  skip?: Set<number>,
): number[] {
  const out = new Array(pattern.palette.length).fill(0)
  for (const r of pattern.regions) {
    const ci = effectiveColorIndex(r, recolors, merges)
    if (skip?.has(ci)) continue
    out[ci] = (out[ci] ?? 0) + r.cellCount
  }
  return out
}

export function effectiveColorIndex(
  region: Region,
  recolors: Record<number, number>,
  merges: Record<number, number> = {},
): number {
  return resolveMergedColor(recolors[region.id] ?? region.colorIndex, merges)
}
