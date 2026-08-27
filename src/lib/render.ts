/* ------------------------------------------------------------------ *
 * Draw a Pattern onto a canvas. Shared by the on-screen preview and
 * the PNG / PDF exporters so what you see is what you get.
 * ------------------------------------------------------------------ */

import { isLightHex } from './color'
import { effectiveColorIndex } from './pattern'
import type { Pattern } from '../types'

export interface RenderOpts {
  cellPx: number
  showGrid: boolean
  showNumbers: boolean
  /** tuft-from-the-back: flip horizontally */
  mirror: boolean
  recolors: Record<number, number>
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
  const { cellPx, showGrid, showNumbers, mirror, recolors, highlight } = opts
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
  for (const r of p.regions) colorOf[r.id] = effectiveColorIndex(r, recolors)

  for (let y = 0; y < p.rows; y++) {
    for (let x = 0; x < p.cols; x++) {
      const rid = p.cells[y * p.cols + x]
      if (rid < 0) continue
      const ci = colorOf[rid]
      const col = p.palette[ci]
      if (!col) continue
      if (highlight != null && highlight >= 0 && ci !== highlight) {
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
        if (!col) continue
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
