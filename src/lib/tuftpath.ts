/* ------------------------------------------------------------------ *
 * Iteration 3 — the tufting path.
 *
 * A rug is not tufted cell by cell but line by line: you outline each
 * colour area (the "fence" that holds the colour), then fill it with
 * back-and-forth passes. This module turns a Pattern's cell regions
 * into that path:
 *
 *   region cells
 *     -> boundary trace (unit edges) -> closed loops
 *     -> Chaikin corner-cutting        (curvy outline, not a staircase)
 *     -> vertical scan-line fill in serpentine order, bottom pass first;
 *        connectors only where they stay inside the region (else pen up)
 *     -> outline length + fill length  = gun travel, in cm
 *
 * Yarn amount from travel lives in lib/calc.ts (yarnFromTravel); the
 * travel -> yarn factor gets replaced by a measured one in Iteration 4.
 *
 * Known v1 limits: very thin necks are covered by the outline only (no
 * angled/medial fill yet); the serpentine is greedy, not globally
 * optimal, so a deeply concave region can get a long repositioning
 * connector — which is real travel, just not the shortest.
 * ------------------------------------------------------------------ */

import type { Pattern } from '../types'
import { isLightHex } from './color'

export type Pt = [number, number]

export interface RegionPath {
  regionId: number
  colorIndex: number
  /** closed loops in cm, outer first */
  outline: Pt[][]
  /** fill strokes in cm — vertical passes plus the connectors that stay
   *  inside the region. Separate strokes = pen lifted between them. */
  fill: Pt[][]
  outlineLenCm: number
  fillLenCm: number
  /** covered by its outline alone — fill added little or nothing */
  thin: boolean
}

export interface TuftPlan {
  paths: RegionPath[]
  /** regionIds in suggested tufting order */
  order: number[]
  /** line spacing actually used, cm */
  rowSpacingCm: number
  totalTravelCm: number
}

export interface TuftOptions {
  /** fill line spacing; defaults to ~4.5 mm, snapped to the cell grid */
  rowSpacingCm?: number
  /** regions for which this returns true are not tufted (e.g. background) */
  skipRegion?: (regionId: number) => boolean
}

/* ---- geometry helpers ---------------------------------------- */

function polylineLen(pts: Pt[]): number {
  let s = 0
  for (let i = 1; i < pts.length; i++) {
    s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  }
  return s
}

function loopLen(loop: Pt[]): number {
  if (loop.length < 2) return 0
  return polylineLen([...loop, loop[0]])
}

/** Chaikin corner-cutting on a closed loop */
function chaikin(loop: Pt[], iterations: number): Pt[] {
  let pts = loop
  for (let it = 0; it < iterations && pts.length >= 3; it++) {
    const out: Pt[] = []
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25])
      out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75])
    }
    pts = out
  }
  return pts
}

/* ---- 1. outline: trace region boundary into closed loops ------ */

function traceOutline(
  cells: Int32Array,
  cols: number,
  rows: number,
  regionId: number,
): Pt[][] {
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < cols && y < rows && cells[y * cols + x] === regionId

  // undirected unit edges on the corner lattice, keyed so duplicates merge
  const key = (x: number, y: number) => y * (cols + 1) + x
  const adj = new Map<number, number[]>()
  const link = (a: number, b: number) => {
    let list = adj.get(a)
    if (!list) {
      list = []
      adj.set(a, list)
    }
    list.push(b)
  }
  const seen = new Set<string>()
  const addEdge = (ax: number, ay: number, bx: number, by: number) => {
    const ka = key(ax, ay)
    const kb = key(bx, by)
    const ek = ka < kb ? `${ka}_${kb}` : `${kb}_${ka}`
    if (seen.has(ek)) return
    seen.add(ek)
    link(ka, kb)
    link(kb, ka)
  }

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!inside(x, y)) continue
      if (!inside(x - 1, y)) addEdge(x, y, x, y + 1)
      if (!inside(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1)
      if (!inside(x, y - 1)) addEdge(x, y, x + 1, y)
      if (!inside(x, y + 1)) addEdge(x, y + 1, x + 1, y + 1)
    }
  }

  const usedEdge = new Set<string>()
  const ekey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`)
  const px = (k: number) => k % (cols + 1)
  const py = (k: number) => Math.floor(k / (cols + 1))

  const loops: Pt[][] = []
  for (const start of adj.keys()) {
    for (const first of adj.get(start)!) {
      if (usedEdge.has(ekey(start, first))) continue
      const loop: Pt[] = [[px(start), py(start)]]
      let prev = start
      let cur = first
      usedEdge.add(ekey(start, first))
      let guard = 0
      while (cur !== start && guard++ < 200000) {
        loop.push([px(cur), py(cur)])
        const nexts = adj.get(cur) ?? []
        let step = -1
        for (const n of nexts) {
          if (n === prev) continue
          if (usedEdge.has(ekey(cur, n))) continue
          step = n
          break
        }
        if (step < 0) break
        usedEdge.add(ekey(cur, step))
        prev = cur
        cur = step
      }
      if (loop.length >= 4) loops.push(loop)
    }
  }

  // outer loop (largest bbox) first
  loops.sort((a, b) => bboxArea(b) - bboxArea(a))
  return loops
}

function bboxArea(loop: Pt[]): number {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of loop) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return (maxX - minX) * (maxY - minY)
}

/* ---- 2. fill: vertical scan lines -> serpentine strokes ------- *
 * Each maximal run of region cells in a scan column is one vertical
 * pass. Consecutive passes (serpentine order) are joined by a connector
 * ONLY when the straight connector stays inside the region — otherwise
 * the pen lifts (a new stroke starts), so a fill line never crosses a
 * gap, a concave notch or a neighbouring colour.
 * ------------------------------------------------------------------ */

function serpentineFill(
  cells: Int32Array,
  cols: number,
  rows: number,
  regionId: number,
  spacingCells: number,
): Pt[][] {
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < cols && y < rows && cells[y * cols + x] === regionId
  const insideAt = (px: number, py: number) =>
    inside(Math.floor(px), Math.floor(py))
  const connectorInside = (a: Pt, b: Pt) => {
    const steps = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 3))
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      if (!insideAt(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
        return false
    }
    return true
  }

  const columns: { cx: number; segs: [number, number][] }[] = []
  const start = Math.floor(spacingCells / 2)
  for (let cx = start; cx < cols; cx += spacingCells) {
    const segs: [number, number][] = []
    let y = 0
    while (y < rows) {
      if (inside(cx, y)) {
        const y0 = y
        while (y < rows && inside(cx, y)) y++
        segs.push([y0, y - 1])
      } else {
        y++
      }
    }
    if (segs.length) columns.push({ cx, segs })
  }

  const strokes: Pt[][] = []
  let up = true // first pass runs bottom -> top
  let prevExit: Pt | null = null
  for (const col of columns) {
    const ordered = [...col.segs].sort((a, b) =>
      up ? b[1] - a[1] : a[0] - b[0],
    )
    for (const [s0, s1] of ordered) {
      const top: Pt = [col.cx + 0.5, s0 + 0.5]
      const bot: Pt = [col.cx + 0.5, s1 + 0.5]
      const enter = up ? bot : top
      const exit = up ? top : bot
      if (prevExit && connectorInside(prevExit, enter)) {
        strokes.push([prevExit, enter])
      }
      strokes.push([enter, exit])
      prevExit = exit
    }
    up = !up
  }
  return strokes
}

/* ---- assemble ---------------------------------------------- */

export function buildTuftPath(
  pattern: Pattern,
  opts: TuftOptions = {},
): TuftPlan {
  const { cols, rows, cells, cellSizeMm, regions, palette } = pattern
  const cellCm = cellSizeMm / 10

  const wantCm = opts.rowSpacingCm ?? 0.45
  const spacingCells = Math.max(1, Math.round(wantCm / cellCm))
  const rowSpacingCm = spacingCells * cellCm

  const skip = opts.skipRegion ?? (() => false)
  const kept = regions.filter((r) => !skip(r.id))

  const paths: RegionPath[] = []
  let totalTravelCm = 0

  for (const region of kept) {
    const rawOutline = traceOutline(cells, cols, rows, region.id)
    const outline = rawOutline.map((loop) =>
      chaikin(loop, 2).map(([x, y]): Pt => [x * cellCm, y * cellCm]),
    )
    const outlineLenCm = outline.reduce((s, l) => s + loopLen(l), 0)

    const rawFill = serpentineFill(cells, cols, rows, region.id, spacingCells)
    const fill = rawFill.map((stroke) =>
      stroke.map(([x, y]): Pt => [x * cellCm, y * cellCm]),
    )
    const fillLenCm = fill.reduce((acc, s) => acc + polylineLen(s), 0)

    const thin = fillLenCm < outlineLenCm * 0.5
    totalTravelCm += outlineLenCm + fillLenCm

    paths.push({
      regionId: region.id,
      colorIndex: region.colorIndex,
      outline,
      fill,
      outlineLenCm,
      fillLenCm,
      thin,
    })
  }

  // suggested order: light colours before dark (dark laid later hides
  // the seams), larger regions before small detail within a colour.
  const lightRank = palette.map((c) => (isLightHex(c.hex) ? 0 : 1))
  const order = [...kept]
    .sort((a, b) => {
      const lr = lightRank[a.colorIndex] - lightRank[b.colorIndex]
      if (lr !== 0) return lr
      if (a.colorIndex !== b.colorIndex) return a.colorIndex - b.colorIndex
      return b.cellCount - a.cellCount
    })
    .map((r) => r.id)

  return { paths, order, rowSpacingCm, totalTravelCm }
}

/** palette colour covering the most border cells — the background guess */
export function borderColorIndex(
  pattern: Pattern,
  effIndex: (regionId: number) => number,
): number | null {
  const { cols, rows, cells } = pattern
  const count = new Map<number, number>()
  const bump = (rid: number) => {
    if (rid < 0) return
    const ci = effIndex(rid)
    count.set(ci, (count.get(ci) ?? 0) + 1)
  }
  for (let x = 0; x < cols; x++) {
    bump(cells[x])
    bump(cells[(rows - 1) * cols + x])
  }
  for (let y = 0; y < rows; y++) {
    bump(cells[y * cols])
    bump(cells[y * cols + cols - 1])
  }
  let best: number | null = null
  let bn = 0
  for (const [ci, n] of count) {
    if (n > bn) {
      bn = n
      best = ci
    }
  }
  return best
}

/** travel (outline + fill) per palette colour, honouring recolours + merges */
export function travelByColor(
  plan: TuftPlan,
  pattern: Pattern,
  effectiveIndex: (regionId: number) => number,
): number[] {
  const out = new Array(pattern.palette.length).fill(0)
  for (const p of plan.paths) {
    const ci = effectiveIndex(p.regionId)
    out[ci] = (out[ci] ?? 0) + p.outlineLenCm + p.fillLenCm
  }
  return out
}
