import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card, Field, Info } from '../../components/ui'
import { useEditor } from '../../store/editorStore'
import { drawPattern } from '../../lib/render'
import { areaByColor } from '../../lib/pattern'
import type { PatternPreset } from '../../types'

const PRESET_LABEL: Record<PatternPreset, string> = {
  simple: 'Einfach',
  medium: 'Mittel',
  detailed: 'Detailliert',
}

export function StepPattern() {
  const project = useEditor((s) => s.project)
  const pattern = useEditor((s) => s.pattern)
  const stale = useEditor((s) => s.patternStale)
  const computing = useEditor((s) => s.computing)
  const recompute = useEditor((s) => s.recompute)
  const setPreset = useEditor((s) => s.setPreset)
  const setSetting = useEditor((s) => s.setSetting)
  const recolor = useEditor((s) => s.recolor)
  const clearRecolor = useEditor((s) => s.clearRecolor)
  const goStep = useEditor((s) => s.goStep)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [highlight, setHighlight] = useState<number | null>(null)
  const [showGrid, setShowGrid] = useState(true)
  const [mirror, setMirror] = useState(false)
  const [selectedRegion, setSelectedRegion] = useState<number | null>(null)

  // auto-build on entering the step / after changes
  useEffect(() => {
    if (stale && !computing) void recompute()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stale])

  const tooSmall = useMemo(
    () => (pattern ? pattern.regions.filter((r) => r.tooSmall).length : 0),
    [pattern],
  )

  const areas = useMemo(
    () => (pattern ? areaByColor(pattern, project.recolors) : []),
    [pattern, project.recolors],
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
    drawPattern(cv.getContext('2d')!, pattern, {
      cellPx,
      showGrid,
      showNumbers: cellPx >= 12,
      mirror,
      recolors: project.recolors,
      highlight,
    })
  }, [pattern, showGrid, mirror, highlight, project.recolors])

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
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(e) => setShowGrid(e.target.checked)}
            />
            Raster
          </label>
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
            Flächen · {pattern.palette.length} Farben. Klicke eine Fläche an, um
            sie umzufärben.
          </p>
        ) : null}
      </Card>

      <div className="space-y-4">
        <Card className="p-5">
          <h3 className="text-sm font-bold">Feineinstellung</h3>
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
        ) : null}

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">
              Farblegende <Info text="Klick auf eine Farbe hebt ihre Flächen hervor." />
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
            {pattern?.palette.map((c) => {
              const stitches = areas[c.index] ?? 0
              const cm2 = stitches * cellCm * cellCm
              return (
                <li key={c.index}>
                  <button
                    onClick={() =>
                      setHighlight(highlight === c.index ? null : c.index)
                    }
                    className={`flex w-full items-center gap-3 rounded-[8px] px-2 py-1.5 text-left text-sm transition ${
                      highlight === c.index ? 'bg-accent-soft' : 'hover:bg-canvas'
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
                </li>
              )
            })}
          </ul>
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
              {pattern.palette.map((c) => (
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
