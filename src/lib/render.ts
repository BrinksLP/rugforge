/* ------------------------------------------------------------------ *
 * Draw a Pattern onto a canvas. Shared by the on-screen preview and
 * the PNG / PDF exporters so what you see is what you get.
 * ------------------------------------------------------------------ */

import { isLightHex } from './color'
import { effectiveColorIndex } from './pattern'
import type { TuftPlan } from './tuftpath'
import type { Pattern } from '../types'

export interface RenderOpts {
  cellPx: number
  showGrid: boolean
  showNumbers: boolean
  /** tuft-from-the-back: flip horizontally */
  mirror: boolean
  recolors: Record<number, number>
  /** palette merges: paletteIndex -> paletteIndex it is folded into */
  merges?: Record<number, number>
  /** resolved palette indices marked "not tufted" — drawn faint, no number */
  bgColors?: Set<number>
  /** palette index to spotlight; others dimmed */
  highlight?: number | null
}

export function patternPixelSize(p: Pattern, cellPx: number) {
  return { w: p.cols * cellPx, h: p.rows * cellPx }
}

export function drawPattern(
  ctx: CanvasRenderingContext2D,
  p: Pattern,
  opts: RenderOpts,
): void {
  const {
    cellPx,
    showGrid,
    showNumbers,
    mirror,
    recolors,
    merges,
    bgColors,
    highlight,
  } = opts
  const W = p.cols * cellPx
  const H = p.rows * cellPx

  ctx.save()
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  if (mirror) {
    ctx.translate(W, 0)
    ctx.scale(-1, 1)
  }

  // region-id lookup for effective colour
  const colorOf = new Int32Array(p.regions.length)
  for (const r of p.regions)
    colorOf[r.id] = effectiveColorIndex(r, recolors, merges)

  for (let y = 0; y < p.rows; y++) {
    for (let x = 0; x < p.cols; x++) {
      const rid = p.cells[y * p.cols + x]
      if (rid < 0) continue
      const ci = colorOf[rid]
      const col = p.palette[ci]
      if (!col) continue
      const isBg = bgColors?.has(ci) ?? false
      if (isBg) {
        ctx.globalAlpha = 0.1
      } else if (highlight != null && highlight >= 0 && ci !== highlight) {
        ctx.globalAlpha = 0.12
      } else {
        ctx.globalAlpha = 1
      }
      ctx.fillStyle = col.hex
      ctx.fillRect(x * cellPx, y * cellPx, cellPx, cellPx)
    }
  }
  ctx.globalAlpha = 1

  if (showGrid && cellPx >= 4) {
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = 0; x <= p.cols; x++) {
      const gx = Math.round(x * cellPx) + 0.5
      ctx.moveTo(gx, 0)
      ctx.lineTo(gx, H)
    }
    for (let y = 0; y <= p.rows; y++) {
      const gy = Math.round(y * cellPx) + 0.5
      ctx.moveTo(0, gy)
      ctx.lineTo(W, gy)
    }
    ctx.stroke()

    // heavier every 10 stitches
    ctx.strokeStyle = 'rgba(0,0,0,0.30)'
    ctx.beginPath()
    for (let x = 0; x <= p.cols; x += 10) {
      const gx = Math.round(x * cellPx) + 0.5
      ctx.moveTo(gx, 0)
      ctx.lineTo(gx, H)
    }
    for (let y = 0; y <= p.rows; y += 10) {
      const gy = Math.round(y * cellPx) + 0.5
      ctx.moveTo(0, gy)
      ctx.lineTo(W, gy)
    }
    ctx.stroke()
  }

  if (showNumbers && cellPx >= 12) {
    ctx.font = `${Math.floor(cellPx * 0.55)}px 'Inter', sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let y = 0; y < p.rows; y++) {
      for (let x = 0; x < p.cols; x++) {
        const rid = p.cells[y * p.cols + x]
        if (rid < 0) continue
        const ci = colorOf[rid]
        const col = p.palette[ci]
        if (!col || bgColors?.has(ci)) continue
        ctx.fillStyle = isLightHex(col.hex) ? '#00000099' : '#ffffffcc'
        ctx.fillText(
          String(ci + 1),
          x * cellPx + cellPx / 2,
          y * cellPx + cellPx / 2,
        )
      }
    }
  }

  ctx.restore()
}

/** render to a fresh canvas and return it */
export function renderToCanvas(p: Pattern, opts: RenderOpts): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = p.cols * opts.cellPx
  cv.height = p.rows * opts.cellPx
  drawPattern(cv.getContext('2d')!, p, opts)
  return cv
}

/* ---- tufting-path view (Iteration 3) ------------------------- */

export interface TuftDrawOpts {
  cellPx: number
  mirror: boolean
  recolors: Record<number, number>
  merges?: Record<number, number>
  /** resolved palette indices not being tufted — no zone tint drawn */
  bgColors?: Set<number>
  /** palette index to spotlight; others dimmed */
  highlight?: number | null
  /** number the regions in tufting order */
  showOrder?: boolean
}

/** slightly darken a #rrggbb hex so strokes read on their own fill */
function darken(hex: string, f = 0.72): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.round(((n >> 16) & 255) * f)
  const g = Math.round(((n >> 8) & 255) * f)
  const b = Math.round((n & 255) * f)
  return `rgb(${r},${g},${b})`
}

export function drawTuftPath(
  ctx: CanvasRenderingContext2D,
  p: Pattern,
  plan: TuftPlan,
  opts: TuftDrawOpts,
): void {
  const { cellPx, mirror, recolors, merges, bgColors, highlight } = opts
  const W = p.cols * cellPx
  const H = p.rows * cellPx
  const pxPerCm = cellPx / (p.cellSizeMm / 10)

  ctx.save()
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  if (mirror) {
    ctx.translate(W, 0)
    ctx.scale(-1, 1)
  }

  const colorOf = new Int32Array(p.regions.length)
  for (const r of p.regions) colorOf[r.id] = effectiveColorIndex(r, recolors, merges)

  // faint colour zones so you can still read the design
  for (let y = 0; y < p.rows; y++) {
    for (let x = 0; x < p.cols; x++) {
      const rid = p.cells[y * p.cols + x]
      if (rid < 0) continue
      const ci = colorOf[rid]
      const col = p.palette[ci]
      if (!col || bgColors?.has(ci)) continue
      ctx.globalAlpha = 0.16
      ctx.fillStyle = col.hex
      ctx.fillRect(x * cellPx, y * cellPx, cellPx, cellPx)
    }
  }
  ctx.globalAlpha = 1
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  const pathById = new Map(plan.paths.map((pp) => [pp.regionId, pp]))
  const labels: { x: number; y: number; n: number }[] = []
  let seq = 0
  for (const rid of plan.order) {
    const pp = pathById.get(rid)
    if (!pp) continue
    seq++
    const ci = colorOf[rid]
    const col = p.palette[ci]
    if (!col) continue
    const dim = highlight != null && highlight >= 0 && ci !== highlight
    ctx.globalAlpha = dim ? 0.1 : 1
    const stroke = darken(col.hex)

    // fill serpentine (thin)
    if (pp.fill.length > 1) {
      ctx.strokeStyle = stroke
      ctx.lineWidth = Math.max(1, cellPx * 0.16)
      ctx.beginPath()
      pp.fill.forEach(([cx, cy], i) => {
        const X = cx * pxPerCm
        const Y = cy * pxPerCm
        if (i === 0) ctx.moveTo(X, Y)
        else ctx.lineTo(X, Y)
      })
      ctx.stroke()
    }

    // outline (a bit thicker)
    ctx.strokeStyle = stroke
    ctx.lineWidth = Math.max(1.6, cellPx * 0.34)
    for (const loop of pp.outline) {
      if (loop.length < 2) continue
      ctx.beginPath()
      loop.forEach(([cx, cy], i) => {
        const X = cx * pxPerCm
        const Y = cy * pxPerCm
        if (i === 0) ctx.moveTo(X, Y)
        else ctx.lineTo(X, Y)
      })
      ctx.closePath()
      ctx.stroke()
    }

    if (opts.showOrder && cellPx >= 5 && !dim) {
      const [minX, minY, maxX, maxY] = p.regions[rid].bbox
      labels.push({
        x: ((minX + maxX + 1) / 2) * cellPx,
        y: ((minY + maxY + 1) / 2) * cellPx,
        n: seq,
      })
    }
  }

  ctx.globalAlpha = 1
  ctx.restore()

  // numbers on top, in screen space (never mirrored)
  if (labels.length) {
    ctx.save()
    ctx.font = `bold ${Math.max(10, Math.min(20, cellPx * 1.4))}px 'Inter', sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const l of labels) {
      const X = mirror ? W - l.x : l.x
      ctx.lineWidth = 3
      ctx.strokeStyle = '#ffffffcc'
      ctx.strokeText(String(l.n), X, l.y)
      ctx.fillStyle = '#1f2328'
      ctx.fillText(String(l.n), X, l.y)
    }
    ctx.restore()
  }
}
