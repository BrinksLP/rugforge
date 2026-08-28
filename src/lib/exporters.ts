/* ------------------------------------------------------------------ *
 * Template exports:
 *   - pattern PNG (grid / numbers / mirror toggles)
 *   - overview sheet (thumbnail + full legend) as PNG and PDF
 *   - tiled 1:1 PDF across A4 with overlap + registration marks
 * A4 only for now.
 * ------------------------------------------------------------------ */

import { jsPDF } from 'jspdf'
import { drawTuftPath, renderToCanvas, type RenderOpts } from './render'
import {
  areaByColor,
  effectiveColorIndex,
  resolveMergedColor,
  resolvedSet,
} from './pattern'
import { yarnEstimate, yarnFromTravel } from './calc'
import { buildTuftPath } from './tuftpath'
import { projectCost } from './projectCost'
import type { Pattern, Project } from '../types'

/** predicate + set for "colours not being tufted" (background) */
function bgFor(pattern: Pattern, project: Project) {
  const merges = project.colorMerges ?? {}
  const set = resolvedSet(project.bgColors, merges)
  const skipRegion = (rid: number) =>
    set.has(
      effectiveColorIndex(pattern.regions[rid], project.recolors, merges),
    )
  return { set, skipRegion }
}

/** image-refine options for the path outline, if a source raster is given */
function refineFor(
  pattern: Pattern,
  project: Project,
  sourceRaster?: ImageData | null,
) {
  if (!sourceRaster) return undefined
  const merges = project.colorMerges ?? {}
  return {
    source: sourceRaster,
    colorLabOf: (rid: number) => {
      const ci = effectiveColorIndex(
        pattern.regions[rid],
        project.recolors,
        merges,
      )
      return (pattern.palette[ci]?.lab ?? [0, 0, 0]) as [
        number,
        number,
        number,
      ]
    },
  }
}

function triggerDownload(dataUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

const slug = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ||
  'rugforge'

/* ---- pattern PNG ------------------------------------------------ */

/** cap the exported PNG's longer side (fits a 1080p/1440p projector
 *  with zoom headroom without becoming a giant file) */
const MAX_PNG_SIDE = 2560

export function exportPatternPng(
  pattern: Pattern,
  project: Project,
  opts: Omit<RenderOpts, 'cellPx' | 'recolors' | 'merges'> & {
    cellPx?: number
    /** draw the tufting path instead of the stitch grid */
    pathMode?: boolean
    /** rasterised source for image-refined path outlines */
    sourceRaster?: ImageData | null
  },
) {
  const cellPx =
    opts.cellPx ??
    Math.max(
      1,
      Math.min(
        22,
        Math.floor(MAX_PNG_SIDE / Math.max(pattern.cols, pattern.rows)),
      ),
    )
  const bg = bgFor(pattern, project)

  if (opts.pathMode) {
    const plan = buildTuftPath(pattern, {
      skipRegion: bg.skipRegion,
      outlineEps: project.pathSmoothing,
      refine: refineFor(pattern, project, opts.sourceRaster),
    })
    const cv = document.createElement('canvas')
    cv.width = pattern.cols * cellPx
    cv.height = pattern.rows * cellPx
    drawTuftPath(cv.getContext('2d')!, pattern, plan, {
      cellPx,
      mirror: opts.mirror,
      recolors: project.recolors,
      merges: project.colorMerges,
      bgColors: bg.set,
      highlight: null,
      showOrder: true,
    })
    triggerDownload(cv.toDataURL('image/png'), `${slug(project.name)}-pfad.png`)
    return
  }

  const cv = renderToCanvas(pattern, {
    cellPx,
    showGrid: opts.showGrid,
    showNumbers: opts.showNumbers,
    mirror: opts.mirror,
    recolors: project.recolors,
    merges: project.colorMerges,
    bgColors: bg.set,
    highlight: null,
  })
  triggerDownload(cv.toDataURL('image/png'), `${slug(project.name)}-vorlage.png`)
}

/* ---- legend rows (shared) ------------------------------------- */

export interface LegendRow {
  no: number
  hex: string
  stitches: number
  areaCm2: number
  yarnG: number
}

export function legendRows(pattern: Pattern, project: Project): LegendRow[] {
  const cellCm = pattern.cellSizeMm / 10
  const merges = project.colorMerges ?? {}
  const bgSet = resolvedSet(project.bgColors, merges)
  const areas = areaByColor(pattern, project.recolors, merges, bgSet)
  return pattern.palette
    // drop swatches merged into another colour, or marked as background
    .filter(
      (c) =>
        resolveMergedColor(c.index, merges) === c.index && !bgSet.has(c.index),
    )
    .map((c) => {
      const stitches = areas[c.index] ?? 0
      const areaCm2 = stitches * cellCm * cellCm
      const { weightG } = yarnEstimate({ areaCm2, setup: project.setupProfile })
      return {
        no: c.index + 1,
        hex: c.hex,
        stitches,
        areaCm2,
        yarnG: weightG,
      }
    })
}

/* ---- overview sheet ---------------------------------------- */

function drawOverview(
  pattern: Pattern,
  project: Project,
  sourceRaster?: ImageData | null,
): HTMLCanvasElement {
  const W = 1240 // ~A4 @ 150dpi
  const H = 1754
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#1f2328'
  ctx.font = "bold 44px 'Inter', sans-serif"
  ctx.fillText(project.name, 60, 90)

  ctx.font = "22px 'Inter', sans-serif"
  ctx.fillStyle = '#5b6470'
  const { widthCm, heightCm, stitchesPerCm } = project.size
  const colorCount = legendRows(pattern, project).length
  ctx.fillText(
    `${widthCm} × ${heightCm} cm  ·  ${stitchesPerCm} Stiche/cm  ·  ${pattern.cols} × ${pattern.rows} Stiche  ·  ${colorCount} Farben`,
    60,
    128,
  )
  ctx.fillText(
    `Setup: ${project.setupProfile.name} · Flor ${project.setupProfile.pileHeightMm} mm · ${project.setupProfile.pile === 'cut' ? 'geschnitten' : 'Schlinge'}`,
    60,
    158,
  )

  const bg = bgFor(pattern, project)

  // thumbnail
  const thumb = renderToCanvas(pattern, {
    cellPx: 6,
    showGrid: false,
    showNumbers: false,
    mirror: false,
    recolors: project.recolors,
    merges: project.colorMerges,
    bgColors: bg.set,
    highlight: null,
  })
  const maxW = W - 120
  const maxH = 600
  const s = Math.min(maxW / thumb.width, maxH / thumb.height)
  const tw = thumb.width * s
  const th = thumb.height * s
  ctx.drawImage(thumb, 60, 200, tw, th)
  ctx.strokeStyle = '#e6e6e3'
  ctx.strokeRect(60, 200, tw, th)

  // legend table
  let y = 200 + th + 60
  ctx.fillStyle = '#1f2328'
  ctx.font = "bold 26px 'Inter', sans-serif"
  ctx.fillText('Farblegende', 60, y)
  y += 20
  ctx.font = "20px 'Inter', sans-serif"
  ctx.fillStyle = '#5b6470'
  ctx.fillText('Nr.        HEX            Fläche            Garn (Schätzung)', 110, y + 26)
  y += 40

  const rows = legendRows(pattern, project)
  for (const row of rows) {
    ctx.fillStyle = row.hex
    ctx.fillRect(60, y, 34, 34)
    ctx.strokeStyle = '#00000022'
    ctx.strokeRect(60, y, 34, 34)
    ctx.fillStyle = '#1f2328'
    ctx.font = "20px 'Inter', sans-serif"
    ctx.fillText(String(row.no), 112, y + 24)
    ctx.fillText(row.hex, 180, y + 24)
    ctx.fillText(`${row.areaCm2.toFixed(0)} cm²`, 360, y + 24)
    ctx.fillText(
      Number.isFinite(row.yarnG) ? `~ ${row.yarnG.toFixed(0)} g` : '—',
      560,
      y + 24,
    )
    y += 46
  }

  // totals row
  const totalArea = rows.reduce((s, r) => s + r.areaCm2, 0)
  const totalYarnG = rows.reduce(
    (s, r) => s + (Number.isFinite(r.yarnG) ? r.yarnG : 0),
    0,
  )
  ctx.strokeStyle = '#d9d9d6'
  ctx.beginPath()
  ctx.moveTo(60, y + 2)
  ctx.lineTo(760, y + 2)
  ctx.stroke()
  y += 12
  ctx.fillStyle = '#1f2328'
  ctx.font = "bold 20px 'Inter', sans-serif"
  ctx.fillText('Summe', 112, y + 24)
  ctx.fillText(`${totalArea.toFixed(0)} cm²`, 360, y + 24)
  ctx.fillText(`~ ${totalYarnG.toFixed(0)} g`, 560, y + 24)
  y += 40

  const runM = project.setupProfile.runLengthMPerG
  if (runM) {
    ctx.font = "18px 'Inter', sans-serif"
    ctx.fillStyle = '#5b6470'
    ctx.fillText(
      `Garnlänge gesamt: ~ ${(totalYarnG * runM).toFixed(0)} m  ` +
        `(bei ${runM} m/g)`,
      112,
      y + 20,
    )
    y += 34
  }

  // tufting path length + yarn-from-travel estimate
  const plan = buildTuftPath(pattern, {
    skipRegion: bg.skipRegion,
      outlineEps: project.pathSmoothing,
    refine: refineFor(pattern, project, sourceRaster),
  })
  const travelM = plan.totalTravelCm / 100
  const travelYarn = yarnFromTravel({
    travelCm: plan.totalTravelCm,
    setup: project.setupProfile,
  })
  y += 6
  ctx.fillStyle = '#1f2328'
  ctx.font = "bold 20px 'Inter', sans-serif"
  ctx.fillText('Tufting-Weg', 112, y + 22)
  ctx.font = "18px 'Inter', sans-serif"
  ctx.fillStyle = '#5b6470'
  ctx.fillText(
    `Gesamtstrecke (Kontur + Füllung): ~ ${travelM.toFixed(1)} m  ·  ` +
      `Bahnabstand ${(plan.rowSpacingCm * 10).toFixed(0)} mm`,
    112,
    y + 48,
  )
  ctx.fillText(
    `Garn nach Weg: ~ ${travelYarn.weightG.toFixed(0)} g` +
      (Number.isFinite(travelYarn.lengthM)
        ? `  ·  ~ ${travelYarn.lengthM.toFixed(0)} m`
        : ''),
    112,
    y + 74,
  )
  y += 96

  // calculation
  const pc = projectCost(pattern, project, sourceRaster)
  const eur = (n: number) =>
    Number.isFinite(n) ? `${n.toFixed(2)} €`.replace('.', ',') : '–'
  y += 6
  ctx.fillStyle = '#1f2328'
  ctx.font = "bold 20px 'Inter', sans-serif"
  ctx.fillText('Kalkulation', 112, y + 22)
  ctx.font = "18px 'Inter', sans-serif"
  ctx.fillStyle = '#5b6470'
  ctx.fillText(
    `Material ${eur(pc.cost.materialTotal)}  ·  Arbeit ${pc.cost.labourHours.toFixed(1)} h ` +
      `${eur(pc.cost.labourCost)}  ·  Herstellkosten ${eur(pc.cost.total)}`,
    112,
    y + 48,
  )
  ctx.fillStyle = '#1f2328'
  ctx.font = "bold 18px 'Inter', sans-serif"
  ctx.fillText(
    `Preisvorschlag ${eur(pc.price.price)}  ` +
      (Number.isFinite(pc.price.marginPct)
        ? `(${pc.price.marginPct.toFixed(0)} % Marge, Gewinn ${eur(pc.price.profit)})`
        : '(Ziel nicht erreichbar)'),
    112,
    y + 74,
  )
  y += 96

  y += 10
  ctx.fillStyle = '#5b6470'
  ctx.font = "italic 16px 'Inter', sans-serif"
  ctx.fillText(
    'Garn-/Kostenschätzung ±30–50 % ohne Kalibriertest. Preise & Ziel im Profil.',
    60,
    y,
  )
  return cv
}

export function exportOverviewPng(
  pattern: Pattern,
  project: Project,
  sourceRaster?: ImageData | null,
) {
  const cv = drawOverview(pattern, project, sourceRaster)
  triggerDownload(cv.toDataURL('image/png'), `${slug(project.name)}-uebersicht.png`)
}

export function exportOverviewPdf(
  pattern: Pattern,
  project: Project,
  sourceRaster?: ImageData | null,
) {
  const cv = drawOverview(pattern, project, sourceRaster)
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  pdf.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297)
  pdf.save(`${slug(project.name)}-uebersicht.pdf`)
}

/* ---- tiled 1:1 PDF ---------------------------------------- */

export function exportTiledPdf(
  pattern: Pattern,
  project: Project,
  opts: { showGrid: boolean; showNumbers: boolean; mirror: boolean },
) {
  const pageW = 210
  const pageH = 297
  const margin = 10
  const overlap = 10
  const printW = pageW - margin * 2
  const printH = pageH - margin * 2

  const cellMm = pattern.cellSizeMm
  const totalW = pattern.cols * cellMm
  const totalH = pattern.rows * cellMm

  const stepX = printW - overlap
  const stepY = printH - overlap
  const nx = Math.max(1, Math.ceil((totalW - overlap) / stepX))
  const ny = Math.max(1, Math.ceil((totalH - overlap) / stepY))

  // one high-res render of the whole pattern, then slice it per tile
  const dpi = 200
  const pxPerMm = dpi / 25.4
  const cellPx = Math.max(4, Math.round(cellMm * pxPerMm))
  const full = renderToCanvas(pattern, {
    cellPx,
    showGrid: opts.showGrid,
    showNumbers: opts.showNumbers,
    mirror: opts.mirror,
    recolors: project.recolors,
    merges: project.colorMerges,
    bgColors: bgFor(pattern, project).set,
    highlight: null,
  })
  const fullPxPerMm = cellPx / cellMm

  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })

  // page 1 header: assembly overview + "measure me" line
  pdf.setFontSize(16)
  pdf.text(`${project.name} — 1:1 Druckvorlage`, margin, margin + 4)
  pdf.setFontSize(10)
  pdf.text(
    `${project.size.widthCm} × ${project.size.heightCm} cm  ·  ${nx} × ${ny} Seiten  ·  ${overlap} mm Überlappung`,
    margin,
    margin + 11,
  )
  // 100 mm check line
  pdf.setLineWidth(0.5)
  pdf.line(margin, margin + 20, margin + 100, margin + 20)
  pdf.line(margin, margin + 18, margin, margin + 22)
  pdf.line(margin + 100, margin + 18, margin + 100, margin + 22)
  pdf.setFontSize(9)
  pdf.text('10 cm — nachmessen! Wenn diese Linie nicht 10 cm lang ist, Druck-Skalierung auf 100 % stellen.', margin, margin + 27)

  // mini assembly map
  const mapX = margin
  const mapY = margin + 34
  const mapW = 60
  const mapH = (mapW * totalH) / totalW
  pdf.rect(mapX, mapY, mapW, Math.min(mapH, 80))
  for (let r = 0; r < ny; r++) {
    for (let c = 0; c < nx; c++) {
      const cx = mapX + (c * mapW) / nx
      const cy = mapY + (r * Math.min(mapH, 80)) / ny
      pdf.rect(cx, cy, mapW / nx, Math.min(mapH, 80) / ny)
      pdf.setFontSize(7)
      pdf.text(`${r + 1}-${c + 1}`, cx + 1, cy + 4)
    }
  }

  // tiles
  const sub = document.createElement('canvas')
  const sctx = sub.getContext('2d')!
  for (let r = 0; r < ny; r++) {
    for (let c = 0; c < nx; c++) {
      pdf.addPage()
      const originMmX = c * stepX
      const originMmY = r * stepY
      const tileMmW = Math.min(printW, totalW - originMmX)
      const tileMmH = Math.min(printH, totalH - originMmY)

      const sxPx = Math.round(originMmX * fullPxPerMm)
      const syPx = Math.round(originMmY * fullPxPerMm)
      const swPx = Math.round(tileMmW * fullPxPerMm)
      const shPx = Math.round(tileMmH * fullPxPerMm)
      sub.width = swPx
      sub.height = shPx
      sctx.fillStyle = '#ffffff'
      sctx.fillRect(0, 0, swPx, shPx)
      sctx.drawImage(full, sxPx, syPx, swPx, shPx, 0, 0, swPx, shPx)

      pdf.addImage(
        sub.toDataURL('image/jpeg', 0.9),
        'JPEG',
        margin,
        margin,
        tileMmW,
        tileMmH,
      )

      // registration marks at the printable corners
      const mark = 4
      const corners: [number, number][] = [
        [margin, margin],
        [margin + printW, margin],
        [margin, margin + printH],
        [margin + printW, margin + printH],
      ]
      pdf.setLineWidth(0.3)
      for (const [x, y] of corners) {
        pdf.line(x - mark, y, x + mark, y)
        pdf.line(x, y - mark, x, y + mark)
      }
      pdf.setFontSize(9)
      pdf.text(
        `Seite ${r + 1}-${c + 1}  (Reihe ${r + 1} / Spalte ${c + 1})`,
        margin,
        pageH - 4,
      )
    }
  }

  pdf.save(`${slug(project.name)}-1zu1.pdf`)
}
