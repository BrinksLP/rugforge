/* ------------------------------------------------------------------ *
 * Bundled example: a simple, bold, geometric motif drawn at runtime
 * (our own artwork, so no licensing question). 80 x 120 cm.
 * ------------------------------------------------------------------ */

import { newProject } from '../store/editorStore'
import type { Project } from '../types'

export function makeExampleImageDataUrl(): string {
  const w = 800
  const h = 1200
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const c = cv.getContext('2d')!

  c.fillStyle = '#f2ede3'
  c.fillRect(0, 0, w, h)

  // border band
  c.fillStyle = '#2e4a3f'
  c.fillRect(40, 40, w - 80, h - 80)
  c.fillStyle = '#f2ede3'
  c.fillRect(80, 80, w - 160, h - 160)

  // three stacked circles
  const cx = w / 2
  const palette = ['#c6462d', '#e8a13c', '#3d6b8e']
  const cys = [h * 0.28, h * 0.5, h * 0.72]
  cys.forEach((cy, i) => {
    c.fillStyle = palette[i]
    c.beginPath()
    c.arc(cx, cy, 150, 0, Math.PI * 2)
    c.fill()
  })

  // a bold diagonal
  c.strokeStyle = '#2e4a3f'
  c.lineWidth = 46
  c.beginPath()
  c.moveTo(110, 140)
  c.lineTo(w - 110, h - 140)
  c.stroke()

  return cv.toDataURL('image/png')
}

export function makeExampleProject(now: number): {
  project: Project
  dataUrl: string
} {
  const dataUrl = makeExampleImageDataUrl()
  const p = newProject(now)
  return {
    project: {
      ...p,
      name: 'Beispiel — Kreise & Diagonale',
      imageDataUrl: dataUrl,
      size: { widthCm: 80, heightCm: 120, stitchesPerCm: 2 },
      settings: {
        preset: 'simple',
        colorCount: 4,
        minRegionStitches: 12,
        smoothing: 2,
      },
    },
    dataUrl,
  }
}
