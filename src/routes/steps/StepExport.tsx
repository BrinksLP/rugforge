import { useMemo, useState } from 'react'
import { Button, Card, Info, NumberInput } from '../../components/ui'
import { useEditor } from '../../store/editorStore'
import {
  exportOverviewPdf,
  exportOverviewPng,
  exportPatternPng,
  exportTiledPdf,
} from '../../lib/exporters'
import { exportProjectFile } from '../../lib/projectFile'
import { projectCost } from '../../lib/projectCost'

const eur = (n: number) =>
  Number.isFinite(n) ? `${n.toFixed(2).replace('.', ',')} €` : '–'

export function StepExport() {
  const project = useEditor((s) => s.project)
  const pattern = useEditor((s) => s.pattern)
  const sourceRaster = useEditor((s) => s.sourceRaster)
  const stale = useEditor((s) => s.patternStale)
  const recompute = useEditor((s) => s.recompute)
  const setBiz = useEditor((s) => s.setBusinessProfile)

  const [grid, setGrid] = useState(true)
  const [numbers, setNumbers] = useState(true)
  const [mirror, setMirror] = useState(true) // tuft from the back → ON by default
  const [pathMode, setPathMode] = useState(false)

  const calc = useMemo(
    () => (pattern && !stale ? projectCost(pattern, project, sourceRaster) : null),
    [pattern, stale, project, sourceRaster],
  )

  if (!pattern || stale) {
    return (
      <Card className="p-8 text-sm text-ink-soft">
        <p>Die Vorlage ist noch nicht aktuell.</p>
        <div className="mt-3">
          <Button onClick={() => void recompute()}>Jetzt berechnen</Button>
        </div>
      </Card>
    )
  }

  const opts = { showGrid: grid, showNumbers: numbers, mirror }
  const pngOpts = { ...opts, pathMode, sourceRaster }

  return (
    <div className="grid gap-6 md:grid-cols-[300px_1fr]">
      <Card className="p-5">
        <h3 className="text-sm font-bold">Optionen</h3>
        <div className="mt-3 space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={grid}
              onChange={(e) => setGrid(e.target.checked)}
            />
            Raster
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={numbers}
              onChange={(e) => setNumbers(e.target.checked)}
            />
            Farbnummern
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={mirror}
              onChange={(e) => setMirror(e.target.checked)}
            />
            Gespiegelt
            <Info text="Beim Tuften arbeitest du von der Rückseite — Standard ist gespiegelt." />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={pathMode}
              onChange={(e) => setPathMode(e.target.checked)}
            />
            Tufting-Pfad
            <Info text="Zeigt Kontur + Füllbahnen mit Reihenfolge-Nummern statt des Rasters (nur im PNG)." />
          </label>
        </div>
        <p className="mt-4 text-xs text-ink-soft">
          Format: A4. Letter / A3 folgt später.
        </p>
      </Card>

      <div className="space-y-4">
        {calc ? (
          <Card className="p-5">
            <h3 className="text-sm font-bold">
              Kalkulation{' '}
              <Info text="Material aus getufteter Fläche + Pfadlänge, Arbeitszeit aus Fläche × Stunden/m². Preise, Gebühren und Ziel im Einstellungen-Tab." />
            </h3>

            <table className="mt-3 w-full text-sm">
              <tbody>
                {calc.cost.materials.map((l) => (
                  <tr key={l.key}>
                    <td className="py-0.5">{l.label}</td>
                    <td className="py-0.5 text-right text-ink-soft">
                      {l.qty.toFixed(l.unit === 'm²' ? 2 : l.qty < 10 ? 2 : 0)}{' '}
                      {l.unit}
                    </td>
                    <td className="py-0.5 text-right">{eur(l.cost)}</td>
                  </tr>
                ))}
                <tr className="border-t border-line font-medium">
                  <td className="py-0.5">Material</td>
                  <td />
                  <td className="py-0.5 text-right">
                    {eur(calc.cost.materialTotal)}
                  </td>
                </tr>
                <tr>
                  <td className="py-0.5">Arbeit</td>
                  <td className="py-0.5 text-right text-ink-soft">
                    {calc.cost.labourHours.toFixed(1)} h
                  </td>
                  <td className="py-0.5 text-right">
                    {eur(calc.cost.labourCost)}
                  </td>
                </tr>
                <tr>
                  <td className="py-0.5">Strom</td>
                  <td />
                  <td className="py-0.5 text-right">
                    {eur(calc.cost.electricity)}
                  </td>
                </tr>
                <tr className="border-t border-line font-bold">
                  <td className="py-1">Herstellkosten</td>
                  <td />
                  <td className="py-1 text-right">{eur(calc.cost.total)}</td>
                </tr>
              </tbody>
            </table>

            <hr className="my-4 border-line" />

            <div className="flex items-center gap-2">
              <span className="text-sm font-bold">Ziel</span>
              <div className="flex overflow-hidden rounded-[8px] border border-line text-sm">
                <button
                  className={`px-2 py-1 ${project.businessProfile.targetMode === 'margin' ? 'bg-accent text-white' : 'hover:bg-canvas'}`}
                  onClick={() => setBiz({ targetMode: 'margin' })}
                >
                  Marge %
                </button>
                <button
                  className={`px-2 py-1 ${project.businessProfile.targetMode === 'profit' ? 'bg-accent text-white' : 'hover:bg-canvas'}`}
                  onClick={() => setBiz({ targetMode: 'profit' })}
                >
                  Gewinn €
                </button>
              </div>
              {project.businessProfile.targetMode === 'margin' ? (
                <NumberInput
                  value={project.businessProfile.targetMarginPct}
                  onChange={(v) => setBiz({ targetMarginPct: v })}
                  min={0}
                  max={90}
                  suffix="%"
                />
              ) : (
                <NumberInput
                  value={project.businessProfile.targetProfit}
                  onChange={(v) => setBiz({ targetProfit: v })}
                  min={0}
                  suffix="€"
                />
              )}
            </div>

            <div className="mt-3 rounded-[10px] bg-accent-soft px-3 py-2">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-bold text-accent">
                  Preisvorschlag
                </span>
                <span className="text-xl font-bold text-accent">
                  {eur(calc.price.price)}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-ink-soft">
                nach Gebühren {eur(calc.price.fees)} · Gewinn{' '}
                {eur(calc.price.profit)} ·{' '}
                {Number.isFinite(calc.price.marginPct)
                  ? `${calc.price.marginPct.toFixed(0)} % Marge`
                  : 'Ziel nicht erreichbar'}
              </p>
            </div>

            <table className="mt-3 w-full text-xs text-ink-soft">
              <thead>
                <tr>
                  <th className="text-left font-medium">Marge</th>
                  <th className="text-right font-medium">Preis</th>
                  <th className="text-right font-medium">Gewinn</th>
                </tr>
              </thead>
              <tbody>
                {calc.scenarios.map((s) => (
                  <tr key={s.label}>
                    <td>{s.label}</td>
                    <td className="text-right">{eur(s.price)}</td>
                    <td className="text-right">{eur(s.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!calc.cost.yarnCalibrated ? (
              <p className="mt-3 text-xs text-warn">
                Garnmenge geschätzt (±30–50 %). Für einen belastbaren Preis den
                Kalibriertest in den Einstellungen ausfüllen.
              </p>
            ) : null}
          </Card>
        ) : null}

        <Card className="p-5">
          <h3 className="text-sm font-bold">Vorlage als Bild</h3>
          <p className="mt-1 text-sm text-ink-soft">
            PNG für Beamer oder Tablet — lange Seite ~2560 px. Farbnummern
            erscheinen nur, wenn die Zellen groß genug werden.
          </p>
          <div className="mt-3">
            <Button onClick={() => exportPatternPng(pattern, project, pngOpts)}>
              PNG herunterladen
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-bold">
            Übersichtsblatt{' '}
            <Info text="Miniatur + vollständige Farblegende mit HEX, Fläche und geschätzter Garnmenge." />
          </h3>
          <div className="mt-3 flex gap-2">
            <Button
              variant="ghost"
              onClick={() => exportOverviewPng(pattern, project, sourceRaster)}
            >
              PNG
            </Button>
            <Button
              variant="ghost"
              onClick={() => exportOverviewPdf(pattern, project, sourceRaster)}
            >
              PDF
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-bold">1:1 Druckvorlage (gekachelt)</h3>
          <p className="mt-1 text-sm text-ink-soft">
            Über mehrere A4-Seiten mit ~1 cm Überlappung, Passmarken,
            Seitenbeschriftung, Montageübersicht und einer „10 cm“-Kontrolllinie
            auf Seite 1.
          </p>
          <div className="mt-3">
            <Button onClick={() => exportTiledPdf(pattern, project, opts)}>
              PDF erstellen
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-bold">Projektdatei</h3>
          <p className="mt-1 text-sm text-ink-soft">
            <code>.rugforge.json</code> — Bild und Profile eingebettet, zum
            Sichern oder Weitergeben.
          </p>
          <div className="mt-3">
            <Button variant="ghost" onClick={() => exportProjectFile(project)}>
              Exportieren
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
