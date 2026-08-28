import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card, Field, Info } from '../../components/ui'
import { useEditor } from '../../store/editorStore'
import { drawPattern, drawTuftPath } from '../../lib/render'
import {
  areaByColor,
  effectiveColorIndex,
  resolveMergedColor,
  resolvedSet,
} from '../../lib/pattern'
import {
  borderColorIndex,
  buildTuftPath,
  travelByColor,
} from '../../lib/tuftpath'
import { yarnFromTravel } from '../../lib/calc'
import type { PatternPreset } from '../../types'

const PRESET_LABEL: Record<PatternPreset, string> = {
  simple: 'Einfach',
  medium: 'Mittel',
  detailed: 'Detailliert',
}

export function StepPattern() {
  const project = useEditor((s) => s.project)
  const pattern = useEditor((s) => s.pattern)
  const sourceRaster = useEditor((s) => s.sourceRaster)
  const stale = useEditor((s) => s.patternStale)
  const computing = useEditor((s) => s.computing)
  const recompute = useEditor((s) => s.recompute)
  const setPreset = useEditor((s) => s.setPreset)
  const setSetting = useEditor((s) => s.setSetting)
  const recolor = useEditor((s) => s.recolor)
  const clearRecolor = useEditor((s) => s.clearRecolor)
  const mergeColors = useEditor((s) => s.mergeColors)
  const unmergeColor = useEditor((s) => s.unmergeColor)
  const setBackground = useEditor((s) => s.setBackground)
  const setPathSmoothing = useEditor((s) => s.setPathSmoothing)
  const resetAdjustments = useEditor((s) => s.resetAdjustments)
  const undo = useEditor((s) => s.undo)
  const lastSnapshot = useEditor((s) => s.history[s.history.length - 1])
  const goStep = useEditor((s) => s.goStep)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [highlight, setHighlight] = useState<number | null>(null)
  const [showGrid, setShowGrid] = useState(true)
  const [mirror, setMirror] = useState(false)
  const [selectedRegion, setSelectedRegion] = useState<number | null>(null)
  const [view, setView] = useState<'grid' | 'path'>('path')

  // auto-build on entering the step / after changes
  useEffect(() => {
    if (stale && !computing) void recompute()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stale])

  const tooSmall = useMemo(
    () => (pattern ? pattern.regions.filter((r) => r.tooSmall).length : 0),
    [pattern],
  )

  const merges = useMemo(
    () => project.colorMerges ?? {},
    [project.colorMerges],
  )

  const bgSet = useMemo(
    () => resolvedSet(project.bgColors, merges),
    [project.bgColors, merges],
  )

  const areas = useMemo(
    () =>
      pattern ? areaByColor(pattern, project.recolors, merges, bgSet) : [],
    [pattern, project.recolors, merges, bgSet],
  )

  // non-merged swatches, split into "will be tufted" and "background"
  const tuftPalette = useMemo(
    () =>
      pattern
        ? pattern.palette.filter(
            (c) =>
              resolveMergedColor(c.index, merges) === c.index &&
              !bgSet.has(c.index),
          )
        : [],
    [pattern, merges, bgSet],
  )
  const bgPalette = useMemo(
    () =>
      pattern
        ? pattern.palette.filter(
            (c) =>
              resolveMergedColor(c.index, merges) === c.index &&
              bgSet.has(c.index),
          )
        : [],
    [pattern, merges, bgSet],
  )
  const mergedPalette = useMemo(
    () =>
      pattern
        ? pattern.palette.filter(
            (c) => resolveMergedColor(c.index, merges) !== c.index,
          )
        : [],
    [pattern, merges],
  )

  const skipRegion = useMemo(
    () =>
      pattern
        ? (rid: number) =>
            bgSet.has(
              effectiveColorIndex(
                pattern.regions[rid],
                project.recolors,
                merges,
              ),
            )
        : () => false,
    [pattern, project.recolors, merges, bgSet],
  )

  const colorLabOf = useMemo(() => {
    const pal = pattern?.palette
    return (rid: number): [number, number, number] => {
      if (!pattern || !pal) return [0, 0, 0]
      const ci = effectiveColorIndex(
        pattern.regions[rid],
        project.recolors,
        merges,
      )
      return (pal[ci]?.lab ?? [0, 0, 0]) as [number, number, number]
    }
  }, [pattern, project.recolors, merges])

  const plan = useMemo(
    () =>
      pattern && view === 'path'
        ? buildTuftPath(pattern, {
            skipRegion,
            outlineEps: project.pathSmoothing,
            refine: sourceRaster
              ? { source: sourceRaster, colorLabOf }
              : undefined,
          })
        : null,
    [pattern, view, skipRegion, sourceRaster, colorLabOf, project.pathSmoothing],
  )

  const effIndex = useMemo(
    () =>
      pattern
        ? (rid: number) =>
            effectiveColorIndex(pattern.regions[rid], project.recolors, merges)
        : () => 0,
    [pattern, project.recolors, merges],
  )

  const travel = useMemo(
    () => (plan && pattern ? travelByColor(plan, pattern, effIndex) : []),
    [plan, pattern, effIndex],
  )

  // draw
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !pattern) return
    const wrapW = wrapRef.current?.clientWidth ?? 720
    const cellPx = Math.max(1, Math.floor((wrapW / pattern.cols) * 2) / 2)
    cv.width = pattern.cols * cellPx
    cv.height = pattern.rows * cellPx
    cv.style.width = '100%'
    cv.style.height = 'auto'
    const ctx = cv.getContext('2d')!
    if (view === 'path' && plan) {
      drawTuftPath(ctx, pattern, plan, {
        cellPx,
        mirror,
        recolors: project.recolors,
        merges,
        bgColors: bgSet,
        highlight,
        showOrder: true,
      })
    } else {
      drawPattern(ctx, pattern, {
        cellPx,
        showGrid,
        showNumbers: cellPx >= 12,
        mirror,
        recolors: project.recolors,
        merges,
        bgColors: bgSet,
        highlight,
      })
    }
  }, [
    pattern,
    plan,
    view,
    showGrid,
    mirror,
    highlight,
    project.recolors,
    merges,
    bgSet,
  ])

  function onCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!pattern) return
    const cv = canvasRef.current!
    const r = cv.getBoundingClientRect()
    let gx = Math.floor(((e.clientX - r.left) / r.width) * pattern.cols)
    const gy = Math.floor(((e.clientY - r.top) / r.height) * pattern.rows)
    if (mirror) gx = pattern.cols - 1 - gx
    if (gx < 0 || gy < 0 || gx >= pattern.cols || gy >= pattern.rows) return
    const rid = pattern.cells[gy * pattern.cols + gx]
    setSelectedRegion(rid >= 0 ? rid : null)
  }

  const cellCm = pattern ? pattern.cellSizeMm / 10 : 0

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {(['simple', 'medium', 'detailed'] as const).map((p) => (
            <Button
              key={p}
              variant={project.settings.preset === p ? 'primary' : 'ghost'}
              onClick={() => setPreset(p)}
            >
              {PRESET_LABEL[p]}
            </Button>
          ))}
          <span className="mx-1 h-5 w-px bg-line" />
          <div className="flex overflow-hidden rounded-[8px] border border-line text-sm">
            <button
              className={`px-3 py-1 ${view === 'grid' ? 'bg-accent text-white' : 'hover:bg-canvas'}`}
              onClick={() => setView('grid')}
            >
              Raster
            </button>
            <button
              className={`px-3 py-1 ${view === 'path' ? 'bg-accent text-white' : 'hover:bg-canvas'}`}
              onClick={() => setView('path')}
            >
              Pfad
            </button>
          </div>
          {view === 'grid' ? (
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
              />
              Gitter
            </label>
          ) : null}
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={mirror}
              onChange={(e) => setMirror(e.target.checked)}
            />
            Gespiegelt
          </label>
          <Button
            variant="ghost"
            onClick={() => void recompute()}
            disabled={computing}
          >
            {computing ? 'Rechnet…' : 'Neu berechnen'}
          </Button>
        </div>

        <div
          ref={wrapRef}
          className="relative overflow-hidden rounded-[10px] border border-line bg-[#fff]"
        >
          {computing ? (
            <div className="absolute inset-0 z-10 grid place-items-center bg-white/70 text-sm font-medium text-ink-soft">
              Vorlage wird berechnet…
            </div>
          ) : null}
          {pattern ? (
            <canvas
              ref={canvasRef}
              onClick={onCanvasClick}
              className="block cursor-pointer"
            />
          ) : (
            <div className="grid h-64 place-items-center text-sm text-ink-soft">
              Noch keine Vorlage.
            </div>
          )}
        </div>

        {pattern ? (
          <p className="mt-2 text-xs text-ink-soft">
            {pattern.cols} × {pattern.rows} Stiche · {pattern.regions.length}{' '}
            Flächen · {tuftPalette.length} Farben
            {mergedPalette.length ? ` (${mergedPalette.length} verschmolzen)` : ''}.
            Klicke eine Fläche an, um sie umzufärben.
          </p>
        ) : null}
      </Card>

      <div className="space-y-4">
        {view === 'path' && plan && pattern ? (
          <Card className="p-5">
            <h3 className="text-sm font-bold">
              Tufting-Pfad{' '}
              <Info text="Kontur zuerst als Zaun, dann Füllbahnen von unten nach oben als durchgehende Serpentine. Zahlen = vorgeschlagene Reihenfolge, hell vor dunkel." />
            </h3>
            <p className="mt-1 text-xs text-ink-soft">
              Bahnabstand {(plan.rowSpacingCm * 10).toFixed(0)} mm · Weg = Kontur +
              Füllung. Garn ist eine Schätzung aus Florhöhe (genauer mit dem
              Kalibriertest in Iteration 4).
            </p>

            <div className="mt-3">
              <Field
                label={`Kontur glätten: ${project.pathSmoothing.toFixed(1)} Stiche`}
                hint="Wie stark die Kontur begradigt wird. Höher = glattere Kurve, sitzt lockerer am Stichraster."
              >
                <input
                  type="range"
                  min={0.5}
                  max={5}
                  step={0.5}
                  value={project.pathSmoothing}
                  onChange={(e) => setPathSmoothing(+e.target.value)}
                />
              </Field>
            </div>

            <ul className="mt-3 space-y-1.5 text-sm">
              {tuftPalette.map((c) => {
                const cm = travel[c.index] ?? 0
                const { lengthM, weightG } = yarnFromTravel({
                  travelCm: cm,
                  setup: project.setupProfile,
                })
                return (
                  <li key={c.index} className="flex items-center gap-3">
                    <span
                      className="h-5 w-5 shrink-0 rounded-[5px] border border-black/10"
                      style={{ background: c.hex }}
                    />
                    <span className="font-semibold">{c.index + 1}</span>
                    <span className="ml-auto text-ink-soft">
                      {(cm / 100).toFixed(1)} m Weg
                    </span>
                    <span className="w-24 text-right text-ink-soft">
                      ~{Number.isFinite(lengthM) ? lengthM.toFixed(0) : '–'} m ·{' '}
                      {weightG.toFixed(0)} g
                    </span>
                  </li>
                )
              })}
            </ul>
            <div className="mt-2 flex items-center gap-3 border-t border-line pt-2 text-sm font-bold">
              <span>Summe</span>
              <span className="ml-auto">
                {(plan.totalTravelCm / 100).toFixed(1)} m Weg
              </span>
              <span className="w-24 text-right">
                {tuftPalette
                  .reduce(
                    (s, c) =>
                      s +
                      yarnFromTravel({
                        travelCm: travel[c.index] ?? 0,
                        setup: project.setupProfile,
                      }).weightG,
                    0,
                  )
                  .toFixed(0)}{' '}
                g
              </span>
            </div>
            {plan.paths.some((p) => p.thin) ? (
              <p className="mt-2 text-xs text-ink-soft">
                {plan.paths.filter((p) => p.thin).length} sehr schmale Fläche(n)
                werden nur von der Kontur abgedeckt (keine eigenen Füllbahnen).
              </p>
            ) : null}
          </Card>
        ) : null}

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">Feineinstellung</h3>
            <button
              className="text-xs text-accent"
              onClick={resetAdjustments}
              title="Regler auf das Preset, alle Umfärbungen und Verschmelzungen zurück"
            >
              Alles zurücksetzen
            </button>
          </div>
          <div className="mt-3 space-y-4">
            <Field
              label={`Farben: ${project.settings.colorCount}`}
              hint="Wie viele Garnfarben die Vorlage benutzen darf (max. 10)."
            >
              <input
                type="range"
                min={2}
                max={10}
                value={project.settings.colorCount}
                onChange={(e) => setSetting('colorCount', +e.target.value)}
              />
            </Field>
            <Field
              label={`Kleinste Fläche: ${project.settings.minRegionStitches} Stiche`}
              hint="Inseln mit weniger Stichen werden in die größte Nachbarfläche eingeschmolzen."
            >
              <input
                type="range"
                min={1}
                max={40}
                value={project.settings.minRegionStitches}
                onChange={(e) =>
                  setSetting('minRegionStitches', +e.target.value)
                }
              />
            </Field>
            <Field
              label={`Kanten glätten: ${['aus', 'leicht', 'stark'][project.settings.smoothing]}`}
              hint="Entfernt ausgefranste Ränder und einzelne Störpixel."
            >
              <input
                type="range"
                min={0}
                max={2}
                value={project.settings.smoothing}
                onChange={(e) =>
                  setSetting('smoothing', +e.target.value as 0 | 1 | 2)
                }
              />
            </Field>
          </div>
        </Card>

        {tooSmall > 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-[10px] border border-[#e9d8b6] bg-[#fdf6e7] px-3 py-2 text-sm text-warn">
            <span>{tooSmall} sehr kleine Fläche(n) übrig.</span>
            <div className="flex shrink-0 gap-1">
              {lastSnapshot &&
              lastSnapshot.settings.minRegionStitches <
                project.settings.minRegionStitches ? (
                <Button
                  variant="ghost"
                  onClick={undo}
                  title="Letztes Zusammenführen rückgängig machen"
                >
                  Rückgängig
                </Button>
              ) : null}
              <Button
                variant="ghost"
                onClick={() =>
                  setSetting(
                    'minRegionStitches',
                    Math.min(40, project.settings.minRegionStitches + 6),
                  )
                }
              >
                Zusammenführen
              </Button>
            </div>
          </div>
        ) : null}

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">
              Farblegende{' '}
              <Info text="Klick auf eine Farbe hebt ihre Flächen hervor — dann kannst du sie mit einer anderen verschmelzen." />
            </h3>
            {highlight != null ? (
              <button
                className="text-xs text-accent"
                onClick={() => setHighlight(null)}
              >
                Hervorhebung aus
              </button>
            ) : null}
          </div>
          <ul className="mt-3 space-y-1.5">
            {tuftPalette.map((c) => {
              const stitches = areas[c.index] ?? 0
              const cm2 = stitches * cellCm * cellCm
              const selected = highlight === c.index
              return (
                <li key={c.index}>
                  <button
                    onClick={() => setHighlight(selected ? null : c.index)}
                    className={`flex w-full items-center gap-3 rounded-[8px] px-2 py-1.5 text-left text-sm transition ${
                      selected ? 'bg-accent-soft' : 'hover:bg-canvas'
                    }`}
                  >
                    <span
                      className="h-6 w-6 rounded-[6px] border border-black/10"
                      style={{ background: c.hex }}
                    />
                    <span className="font-semibold">{c.index + 1}</span>
                    <span className="text-ink-soft">{c.hex}</span>
                    <span className="ml-auto text-ink-soft">
                      {cm2.toFixed(0)} cm²
                    </span>
                  </button>

                  {selected ? (
                    <div className="mt-1.5 space-y-2 rounded-[8px] bg-canvas px-2 py-2">
                      {tuftPalette.length > 1 ? (
                        <>
                          <p className="text-xs text-ink-soft">
                            Farbe {c.index + 1} verschmelzen mit:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {tuftPalette
                              .filter((t) => t.index !== c.index)
                              .map((t) => (
                                <button
                                  key={t.index}
                                  onClick={() => {
                                    mergeColors(c.index, t.index)
                                    setHighlight(null)
                                  }}
                                  className="flex items-center gap-1 rounded-[6px] border border-line bg-white px-1.5 py-1 text-xs hover:border-accent"
                                  title={`In Farbe ${t.index + 1} verschmelzen`}
                                >
                                  <span
                                    className="h-4 w-4 rounded-[4px] border border-black/10"
                                    style={{ background: t.hex }}
                                  />
                                  {t.index + 1}
                                </button>
                              ))}
                          </div>
                        </>
                      ) : null}
                      <button
                        onClick={() => {
                          setBackground(c.index, true)
                          setHighlight(null)
                        }}
                        className="text-xs text-accent"
                      >
                        Als Hintergrund markieren (nicht tuften)
                      </button>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>

          {mergedPalette.length ? (
            <div className="mt-3 border-t border-line pt-3">
              <p className="mb-1.5 text-xs font-medium text-ink-soft">
                Verschmolzen
              </p>
              <ul className="space-y-1">
                {mergedPalette.map((c) => {
                  const into = resolveMergedColor(c.index, merges)
                  const target = pattern?.palette[into]
                  return (
                    <li
                      key={c.index}
                      className="flex items-center gap-2 px-2 text-sm text-ink-soft"
                    >
                      <span
                        className="h-4 w-4 shrink-0 rounded-[4px] border border-black/10 opacity-60"
                        style={{ background: c.hex }}
                      />
                      <span className="line-through">{c.index + 1}</span>
                      <span aria-hidden>→</span>
                      <span
                        className="h-4 w-4 shrink-0 rounded-[4px] border border-black/10"
                        style={{ background: target?.hex }}
                      />
                      <span>{into + 1}</span>
                      <button
                        className="ml-auto text-xs text-accent"
                        onClick={() => unmergeColor(c.index)}
                      >
                        lösen
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}

          <div className="mt-3 border-t border-line pt-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-ink-soft">
                Hintergrund (nicht getuftet)
              </p>
              {pattern && bgPalette.length === 0 ? (
                <button
                  className="text-xs text-accent"
                  onClick={() => {
                    const bi = borderColorIndex(pattern, effIndex)
                    if (bi != null) setBackground(bi, true)
                  }}
                >
                  Randfläche erkennen
                </button>
              ) : null}
            </div>
            {bgPalette.length ? (
              <ul className="mt-1.5 space-y-1">
                {bgPalette.map((c) => (
                  <li
                    key={c.index}
                    className="flex items-center gap-2 px-2 text-sm text-ink-soft"
                  >
                    <span
                      className="h-4 w-4 shrink-0 rounded-[4px] border border-black/10 opacity-60"
                      style={{ background: c.hex }}
                    />
                    <span>{c.index + 1}</span>
                    <span className="text-xs">— wird nicht getuftet</span>
                    <button
                      className="ml-auto text-xs text-accent"
                      onClick={() => setBackground(c.index, false)}
                    >
                      wieder tuften
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-ink-soft">
                Leerer Rand um das Motiv? Farbe anklicken → „Als Hintergrund",
                oder oben „Randfläche erkennen". Besser noch: im Schritt
                Freistellen den Hintergrund entfernen.
              </p>
            )}
          </div>
        </Card>

        {selectedRegion != null && pattern ? (
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Fläche umfärben</h3>
              <button
                className="text-xs text-ink-soft"
                onClick={() => setSelectedRegion(null)}
              >
                schließen
              </button>
            </div>
            <p className="mt-1 text-xs text-ink-soft">
              Fläche #{selectedRegion} ·{' '}
              {pattern.regions[selectedRegion]?.cellCount} Stiche. Die Geometrie
              bleibt, nur die Farbe ändert sich.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {tuftPalette.map((c) => (
                <button
                  key={c.index}
                  onClick={() => recolor(selectedRegion, c.index)}
                  className="h-8 w-8 rounded-[6px] border border-black/10"
                  style={{ background: c.hex }}
                  title={`Farbe ${c.index + 1}`}
                />
              ))}
              {project.recolors[selectedRegion] != null ? (
                <Button
                  variant="ghost"
                  onClick={() => clearRecolor(selectedRegion)}
                >
                  Zurücksetzen
                </Button>
              ) : null}
            </div>
          </Card>
        ) : null}

        <Button onClick={() => goStep(4)}>Weiter → Export</Button>
      </div>
    </div>
  )
}
