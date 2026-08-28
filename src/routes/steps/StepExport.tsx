import { useState } from 'react'
import { Button, Card, Info } from '../../components/ui'
import { useEditor } from '../../store/editorStore'
import {
  exportOverviewPdf,
  exportOverviewPng,
  exportPatternPng,
  exportTiledPdf,
} from '../../lib/exporters'
import { exportProjectFile } from '../../lib/projectFile'

export function StepExport() {
  const project = useEditor((s) => s.project)
  const pattern = useEditor((s) => s.pattern)
  const stale = useEditor((s) => s.patternStale)
  const recompute = useEditor((s) => s.recompute)

  const [grid, setGrid] = useState(true)
  const [numbers, setNumbers] = useState(true)
  const [mirror, setMirror] = useState(true) // tuft from the back → ON by default
  const [pathMode, setPathMode] = useState(false)

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
  const pngOpts = { ...opts, pathMode }

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
        <Card className="p-5">
          <h3 className="text-sm font-bold">Vorlage als Bild</h3>
          <p className="mt-1 text-sm text-ink-soft">
            PNG für Beamer oder Tablet.
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
              onClick={() => exportOverviewPng(pattern, project)}
            >
              PNG
            </Button>
            <Button
              variant="ghost"
              onClick={() => exportOverviewPdf(pattern, project)}
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
