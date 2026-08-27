/* ------------------------------------------------------------------ *
 * The image -> pattern pipeline.
 *
 *   source image (already cropped + masked)
 *     -> downscale to the stitch grid          (1 cell = 1 stitch)
 *     -> Lab k-means colour reduction (<= 10)
 *     -> majority-filter smoothing
 *     -> connected-component regions
 *     -> small-area cleanup (merge islands into largest neighbour)
 *     -> palette + region list
 *
 * Honest limitation: the automatic result is only good for graphic
 * motifs. Photos need Iteration 2 (segmentation) + manual tools.
 * ------------------------------------------------------------------ */

import { labToHex, rgbToLab, type Lab } from './color'
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

/* ---- 1. downscale to the grid ----------------------------------- */

interface Grid {
  cols: number
  rows: number
  /** Lab per cell, flat triples; undefined where masked */
  lab: Float64Array
  /** 1 = real cell, 0 = masked out */
  present: Uint8Array
}

function downscale(src: ImageData, cols: number, rows: number): Grid {
  const { width: sw, height: sh, data } = src
  const lab = new Float64Array(cols * rows * 3)
  const present = new Uint8Array(cols * rows)

  for (let gy = 0; gy < rows; gy++) {
    const y0 = Math.floor((gy * sh) / rows)
    const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * sh) / rows))
    for (let gx = 0; gx < cols; gx++) {
      const x0 = Math.floor((gx * sw) / cols)
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * sw) / cols))

      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let n = 0
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * sw + x) * 4
          const alpha = data[i + 3]
          if (alpha < 128) continue
          r += data[i]
          g += data[i + 1]
          b += data[i + 2]
          a += alpha
          n++
        }
      }
      const gi = gy * cols + gx
      const boxArea = (x1 - x0) * (y1 - y0)
      if (n === 0 || n < boxArea * 0.4) {
        present[gi] = 0
        continue
      }
      present[gi] = 1
      const [L, aa, bb] = rgbToLab(r / n, g / n, b / n)
      lab[gi * 3] = L
      lab[gi * 3 + 1] = aa
      lab[gi * 3 + 2] = bb
      void a
    }
  }
  return { cols, rows, lab, present }
}

/* ---- 2. colour reduction -------------------------------------- */

function quantise(
  grid: Grid,
  k: number,
): { centers: Lab[]; cluster: Int32Array } {
  const total = grid.cols * grid.rows
  const idx: number[] = []
  for (let i = 0; i < total; i++) if (grid.present[i]) idx.push(i)

  // fit on a subsample when the grid is huge, then assign every cell
  const stride = Math.max(1, Math.ceil(idx.length / FIT_SAMPLE_CAP))
  const fitCount = Math.ceil(idx.length / stride)
  const samples = new Float64Array(fitCount * 3)
  for (let s = 0, j = 0; s < idx.length; s += stride, j++) {
    const gi = idx[s]
    samples[j * 3] = grid.lab[gi * 3]
    samples[j * 3 + 1] = grid.lab[gi * 3 + 1]
    samples[j * 3 + 2] = grid.lab[gi * 3 + 2]
  }

  const { centers } = kmeansLab(samples, k)

  const cluster = new Int32Array(total).fill(EMPTY)
  for (const gi of idx) {
    const p: Lab = [
      grid.lab[gi * 3],
      grid.lab[gi * 3 + 1],
      grid.lab[gi * 3 + 2],
    ]
    let best = 0
    let bestD = Infinity
    for (let c = 0; c < centers.length; c++) {
      const dL = p[0] - centers[c][0]
      const da = p[1] - centers[c][1]
      const db = p[2] - centers[c][2]
      const d = dL * dL + da * da + db * db
      if (d < bestD) {
        bestD = d
        best = c
      }
    }
    cluster[gi] = best
  }
  return { centers, cluster }
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

  const grid = downscale(source, cols, rows)
  const k = Math.max(2, Math.min(10, settings.colorCount))
  const { centers, cluster } = quantise(grid, k)

  smooth(cluster, cols, rows, settings.smoothing)
  cleanup(cluster, cols, rows, settings.minRegionStitches)
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

/** stitch count per palette colour, honouring recolour overrides */
export function areaByColor(
  pattern: Pattern,
  recolors: Record<number, number>,
): number[] {
  const out = new Array(pattern.palette.length).fill(0)
  for (const r of pattern.regions) {
    const ci = recolors[r.id] ?? r.colorIndex
    out[ci] = (out[ci] ?? 0) + r.cellCount
  }
  return out
}

export function effectiveColorIndex(
  region: Region,
  recolors: Record<number, number>,
): number {
  return recolors[region.id] ?? region.colorIndex
}
