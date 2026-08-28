import { useEffect } from 'react'
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
  const srcAspect = srcW > 0 && srcH > 0 ? srcW / srcH : 0

  const derivedH =
    srcAspect > 0 ? Math.round((size.widthCm / srcAspect) * 10) / 10 : null

  // keep the height locked to the crop's aspect ratio
  useEffect(() => {
    if (derivedH != null && Math.abs(derivedH - size.heightCm) > 0.05) {
      setSize({ heightCm: derivedH })
    }
  }, [derivedH, size.heightCm, setSize])

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
          <Field
            label="Höhe"
            hint={
              srcAspect > 0
                ? 'Folgt automatisch aus Breite × Seitenverhältnis des Ausschnitts.'
                : 'Fertige Teppichhöhe in Zentimetern.'
            }
          >
            <NumberInput
              value={size.heightCm}
              onChange={(v) => setSize({ heightCm: v })}
              min={5}
              max={400}
              suffix="cm"
              disabled={srcAspect > 0}
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
