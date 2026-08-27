import { Button, Card, Field, Info, NumberInput } from '../../components/ui'
import { gridResolution } from '../../lib/calc'
import { useEditor } from '../../store/editorStore'

export function StepSize() {
  const size = useEditor((s) => s.project.size)
  const crop = useEditor((s) => s.project.crop)
  const img = useEditor((s) => s.sourceImage)
  const setSize = useEditor((s) => s.setSize)
  const goStep = useEditor((s) => s.goStep)

  const { cols, rows } = gridResolution(size)

  const srcW = crop?.w ?? img?.naturalWidth ?? 0
  const srcH = crop?.h ?? img?.naturalHeight ?? 0
  const srcAspect = srcH > 0 ? srcW / srcH : 1
  const sizeAspect = size.heightCm > 0 ? size.widthCm / size.heightCm : 1
  const aspectOff = Math.abs(srcAspect - sizeAspect) / sizeAspect > 0.06

  function matchAspect() {
    setSize({ heightCm: Math.round((size.widthCm / srcAspect) * 10) / 10 })
  }

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_320px]">
      <Card className="p-6">
        <h3 className="text-sm font-bold">Teppichmaße</h3>
        <p className="mt-1 text-sm text-ink-soft">
          Ein Raster-Feld = ein Stich. Die Anzahl der Spalten ergibt sich aus
          Breite × Stichdichte.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Field label="Breite" hint="Fertige Teppichbreite in Zentimetern.">
            <NumberInput
              value={size.widthCm}
              onChange={(v) => setSize({ widthCm: v })}
              min={5}
              max={400}
              suffix="cm"
            />
          </Field>
          <Field label="Höhe" hint="Fertige Teppichhöhe in Zentimetern.">
            <NumberInput
              value={size.heightCm}
              onChange={(v) => setSize({ heightCm: v })}
              min={5}
              max={400}
              suffix="cm"
            />
          </Field>
          <Field
            label="Stichdichte"
            hint="Stiche pro Zentimeter. Übliche Tufting-Dichte ist ca. 2/cm (20 Stiche pro 10 cm)."
          >
            <NumberInput
              value={size.stitchesPerCm}
              onChange={(v) => setSize({ stitchesPerCm: v })}
              min={1}
              max={6}
              step={0.5}
              suffix="/cm"
            />
          </Field>
        </div>

        {aspectOff ? (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-[10px] border border-[#e9d8b6] bg-[#fdf6e7] px-3 py-2 text-sm text-warn">
            <span>
              Seitenverhältnis weicht vom Bildausschnitt ab — das Motiv wird
              verzerrt.
            </span>
            <Button variant="ghost" onClick={matchAspect}>
              Höhe anpassen
            </Button>
          </div>
        ) : null}

        <div className="mt-6">
          <Button onClick={() => goStep(3)}>Weiter → Vorlage</Button>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-sm font-bold">Ergebnis</h3>
        <dl className="mt-3 space-y-2 text-sm">
          <Row
            k={
              <>
                Raster <Info text="Spalten × Reihen = Stiche gesamt" />
              </>
            }
            v={`${cols} × ${rows}`}
          />
          <Row k="Stiche gesamt" v={(cols * rows).toLocaleString('de-DE')} />
          <Row
            k="Fläche"
            v={`${(size.widthCm * size.heightCm).toLocaleString('de-DE')} cm²`}
          />
          <Row
            k={
              <>
                Feldgröße <Info text="Kantenlänge eines Stichs" />
              </>
            }
            v={`${(10 / size.stitchesPerCm).toFixed(1)} mm`}
          />
        </dl>
        <p className="mt-4 text-xs text-ink-soft">
          Änderst du die Größe, wird die Vorlage neu berechnet.
        </p>
      </Card>
    </div>
  )
}

function Row({ k, v }: { k: React.ReactNode; v: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line pb-2">
      <dt className="text-ink-soft">{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </div>
  )
}
