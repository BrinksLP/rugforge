/* ------------------------------------------------------------------ *
 * Iteration 3 — the tufting path.
 *
 * A rug is not tufted cell by cell but line by line: you outline each
 * colour area (the "fence" that holds the colour), then fill it with
 * back-and-forth passes. This module turns a Pattern's cell regions
 * into that path:
 *
 *   region cells
 *     -> (optional) upsample the region grid and snap the boundary band
 *        to the colour it actually matches in the ORIGINAL image, so the
 *        outline follows the photo edge to within ~1 stitch instead of
 *        the k-means-on-a-coarse-grid staircase
 *     -> boundary trace (unit edges) -> closed loops
 *     -> RDP simplify + Chaikin corner-cutting  (curvy outline, no stairs)
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
import { isLightHex, labDist2, rgbToLab, type Lab } from './color'

export type Pt = [number, number]

const EMPTY = -1

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

export interface RefineInput {
  /** rasterised source (crop + mask already applied), covering the same
   *  area as the stitch grid */
  source: ImageData
  /** effective Lab colour of a region id (honours recolours / merges) */
  colorLabOf: (regionId: number) => Lab
}

export interface TuftOptions {
  /** fill line spacing; defaults to ~4.5 mm, snapped to the cell grid */
  rowSpacingCm?: number
  /** regions for which this returns true are not tufted (e.g. background) */
  skipRegion?: (regionId: number) => boolean
  /** trace outlines from an image-refined boundary instead of the raw grid */
  refine?: RefineInput
  /** RDP tolerance for the outline, in stitches (default 2) */
  outlineEps?: number
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

/** default RDP tolerance in stitches — how far the smoothed outline may
 *  leave the traced boundary. With an image-resolution trace this only
 *  needs to absorb pixel aliasing, not stitch-sized bumps. */
const OUTLINE_EPS = 1.2
/** Chaikin passes (subdivide corners) then binomial low-pass passes */
const OUTLINE_CHAIKIN = 3
const OUTLINE_LOWPASS = 2

/** [1,2,1]/4 low-pass on a closed loop — flattens sub-stitch wobble
 *  without rounding real corners as hard as more Chaikin would */
function smoothLoop(loop: Pt[], passes: number): Pt[] {
  if (loop.length < 5) return loop
  let pts = loop
  for (let p = 0; p < passes; p++) {
    const n = pts.length
    const out: Pt[] = new Array(n)
    for (let i = 0; i < n; i++) {
      const a = pts[(i - 1 + n) % n]
      const b = pts[i]
      const c = pts[(i + 1) % n]
      out[i] = [(a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4]
    }
    pts = out
  }
  return pts
}

function perpDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy) || 1
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len
}

/** Ramer–Douglas–Peucker on an open polyline */
function rdp(points: Pt[], eps: number): Pt[] {
  if (points.length < 3) return points.slice()
  const a = points[0]
  const b = points[points.length - 1]
  let idx = -1
  let maxD = 0
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], a, b)
    if (d > maxD) {
      maxD = d
      idx = i
    }
  }
  if (maxD > eps && idx > 0) {
    const left = rdp(points.slice(0, idx + 1), eps)
    const right = rdp(points.slice(idx), eps)
    return [...left.slice(0, -1), ...right]
  }
  return [a, b]
}

function sliceWrap(loop: Pt[], from: number, to: number): Pt[] {
  const out: Pt[] = []
  let i = from
  while (true) {
    out.push(loop[i])
    if (i === to) break
    i = (i + 1) % loop.length
  }
  return out
}

/** RDP on a closed loop. Split it into two arcs between the two points
 *  that are farthest apart (never a zero-length base segment), simplify
 *  each as an open polyline, then stitch back together. */
function simplifyLoop(loop: Pt[], eps: number): Pt[] {
  if (loop.length < 6) return loop.slice()

  // one extreme: farthest from the centroid
  let cx = 0
  let cy = 0
  for (const [x, y] of loop) {
    cx += x
    cy += y
  }
  cx /= loop.length
  cy /= loop.length
  let a = 0
  let far = -1
  for (let i = 0; i < loop.length; i++) {
    const d = Math.hypot(loop[i][0] - cx, loop[i][1] - cy)
    if (d > far) {
      far = d
      a = i
    }
  }
  // the other: farthest from `a`
  let b = a
  far = -1
  for (let i = 0; i < loop.length; i++) {
    const d = Math.hypot(loop[i][0] - loop[a][0], loop[i][1] - loop[a][1])
    if (d > far) {
      far = d
      b = i
    }
  }
  if (a === b) return loop.slice()

  const arc1 = rdp(sliceWrap(loop, a, b), eps)
  const arc2 = rdp(sliceWrap(loop, b, a), eps)
  // arc1 ends at b, arc2 starts at b and ends at a — drop both shared ends
  return [...arc1, ...arc2.slice(1, -1)]
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
  /** optional scan window [x0,y0,x1,y1] inclusive, to avoid scanning the
   *  whole (possibly huge) grid for one region */
  win?: [number, number, number, number],
): Pt[][] {
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < cols && y < rows && cells[y * cols + x] === regionId

  const x0 = win ? Math.max(0, win[0]) : 0
  const y0 = win ? Math.max(0, win[1]) : 0
  const x1 = win ? Math.min(cols - 1, win[2]) : cols - 1
  const y1 = win ? Math.min(rows - 1, win[3]) : rows - 1

  // undirected unit edges on the corner lattice, keyed with plain numbers
  // (string keys are far too slow at image resolution)
  const stride = (cols + 1) * (rows + 1) + 1
  const key = (x: number, y: number) => y * (cols + 1) + x
  const edgeKey = (a: number, b: number) =>
    a < b ? a * stride + b : b * stride + a
  const adj = new Map<number, number[]>()
  const link = (a: number, b: number) => {
    let list = adj.get(a)
    if (!list) {
      list = []
      adj.set(a, list)
    }
    list.push(b)
  }
  const seen = new Set<number>()
  const addEdge = (ax: number, ay: number, bx: number, by: number) => {
    const ka = key(ax, ay)
    const kb = key(bx, by)
    const ek = edgeKey(ka, kb)
    if (seen.has(ek)) return
    seen.add(ek)
    link(ka, kb)
    link(kb, ka)
  }

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!inside(x, y)) continue
      if (!inside(x - 1, y)) addEdge(x, y, x, y + 1)
      if (!inside(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1)
      if (!inside(x, y - 1)) addEdge(x, y, x + 1, y)
      if (!inside(x, y + 1)) addEdge(x, y + 1, x + 1, y + 1)
    }
  }

  const usedEdge = new Set<number>()
  const px = (k: number) => k % (cols + 1)
  const py = (k: number) => Math.floor(k / (cols + 1))

  const loops: Pt[][] = []
  for (const start of adj.keys()) {
    for (const first of adj.get(start)!) {
      if (usedEdge.has(edgeKey(start, first))) continue
      const loop: Pt[] = [[px(start), py(start)]]
      let prev = start
      let cur = first
      usedEdge.add(edgeKey(start, first))
      let guard = 0
      while (cur !== start && guard++ < 2_000_000) {
        loop.push([px(cur), py(cur)])
        const nexts = adj.get(cur) ?? []
        let step = -1
        for (const n of nexts) {
          if (n === prev) continue
          if (usedEdge.has(edgeKey(cur, n))) continue
          step = n
          break
        }
        if (step < 0) break
        usedEdge.add(edgeKey(cur, step))
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

/* ---- snap the coarse outline to the image edge --------------- *
 * Trace once on the stitch grid (cheap), then move every outline
 * vertex along its local normal to where the ORIGINAL image actually
 * changes colour — search ±SNAP_REACH stitches, ~0.2-stitch steps. No
 * fine grid: cost is ~(perimeter) samples, not (area · factor²).
 * The vertex can't move more than SNAP_REACH, so the outline still
 * matches the committed template to within ~1 stitch.
 * ------------------------------------------------------------------ */

const SNAP_REACH = 1.5

function snapLoopToImage(
  loop: Pt[], // stitch-corner coords
  regionId: number,
  cells: Int32Array,
  cols: number,
  rows: number,
  refine: RefineInput,
): Pt[] {
  const { data, width: sw, height: sh } = refine.source
  const spX = sw / cols
  const spY = sh / rows
  const ownLab = refine.colorLabOf(regionId)

  const regionAt = (cx: number, cy: number) =>
    cx >= 0 && cy >= 0 && cx < cols && cy < rows ? cells[cy * cols + cx] : EMPTY

  const labMemo = new Map<number, Lab>()
  const labOf = (rid: number) => {
    let v = labMemo.get(rid)
    if (v === undefined) {
      v = refine.colorLabOf(rid)
      labMemo.set(rid, v)
    }
    return v
  }

  const sampleLab = (stx: number, sty: number): Lab | null => {
    let ix = (stx * spX) | 0
    let iy = (sty * spY) | 0
    if (ix < 0) ix = 0
    else if (ix >= sw) ix = sw - 1
    if (iy < 0) iy = 0
    else if (iy >= sh) iy = sh - 1
    const p = (iy * sw + ix) * 4
    if (data[p + 3] < 128) return null
    return rgbToLab(data[p], data[p + 1], data[p + 2])
  }

  const n = loop.length
  const out: Pt[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const a = loop[(i - 1 + n) % n]
    const b = loop[i]
    const c = loop[(i + 1) % n]
    let tx = c[0] - a[0]
    let ty = c[1] - a[1]
    const tl = Math.hypot(tx, ty) || 1
    tx /= tl
    ty /= tl
    // normal, flipped so +m points OUT of the region
    let mx = ty
    let my = -tx
    if (regionAt((b[0] + mx * 0.7) | 0, (b[1] + my * 0.7) | 0) === regionId) {
      mx = -mx
      my = -my
    }
    const outRid = regionAt(
      Math.min(cols - 1, Math.max(0, (b[0] + mx * 0.9) | 0)),
      Math.min(rows - 1, Math.max(0, (b[1] + my * 0.9) | 0)),
    )
    const outLab = outRid >= 0 ? labOf(outRid) : null

    // walk the normal from inside to outside; the last still-inside
    // sample is the colour edge
    let edgeT = 0
    let found = false
    for (let k = -SNAP_REACH; k <= SNAP_REACH + 1e-6; k += 0.2) {
      const lab = sampleLab(b[0] + mx * k, b[1] + my * k)
      if (!lab) continue
      const dOwn = labDist2(lab, ownLab)
      const dOut = outLab ? labDist2(lab, outLab) : dOwn + 1
      if (dOwn <= dOut) {
        edgeT = k
        found = true
      }
    }
    out[i] = found ? [b[0] + mx * edgeT, b[1] + my * edgeT] : [b[0], b[1]]
  }
  return out
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
  const eps = Math.max(0.1, opts.outlineEps ?? OUTLINE_EPS)
  const refine = opts.refine

  const paths: RegionPath[] = []
  let totalTravelCm = 0

  for (const region of kept) {
    const [bx0, by0, bx1, by1] = region.bbox
    const rawOutline = traceOutline(cells, cols, rows, region.id, [
      bx0 - 1,
      by0 - 1,
      bx1 + 1,
      by1 + 1,
    ])
    const outline = rawOutline.map((loop) => {
      const snapped = refine
        ? snapLoopToImage(loop, region.id, cells, cols, rows, refine)
        : loop
      const simplified = simplifyLoop(snapped, eps)
      const rounded = chaikin(simplified, OUTLINE_CHAIKIN)
      const smooth = smoothLoop(rounded, OUTLINE_LOWPASS)
      return smooth.map(([x, y]): Pt => [x * cellCm, y * cellCm])
    })
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
