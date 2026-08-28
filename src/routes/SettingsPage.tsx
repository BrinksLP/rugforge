import { Card, Field, Info, NumberInput } from '../components/ui'
import {
  calibrationFactor,
  calibrationPlausible,
  makeCalibration,
} from '../lib/calc'
import { useEditor } from '../store/editorStore'

export function SettingsPage() {
  const setup = useEditor((s) => s.project.setupProfile)
  const biz = useEditor((s) => s.project.businessProfile)
  const setSetup = useEditor((s) => s.setSetupProfile)
  const setBiz = useEditor((s) => s.setBusinessProfile)

  const cal = setup.calibration

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight">Einstellungen</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Diese Werte gehören zum aktuell geöffneten Projekt. Eine gemeinsame
        Profil­bibliothek kommt in einer späteren Iteration.
      </p>

      {/* Setup profile */}
      <Card className="mt-6 p-6">
        <h2 className="text-sm font-bold">
          Setup-Profil <span className="text-ink-soft">· {setup.name}</span>
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Stichdichte" hint="Stiche pro cm.">
            <NumberInput
              value={setup.stitchesPerCm}
              onChange={(v) => setSetup({ stitchesPerCm: v })}
              min={1}
              max={6}
              step={0.5}
              suffix="/cm"
            />
          </Field>
          <Field label="Florhöhe" hint="Kurz 10 · Mittel 18 · Hoch 25 mm">
            <NumberInput
              value={setup.pileHeightMm}
              onChange={(v) => setSetup({ pileHeightMm: v })}
              min={4}
              max={40}
              suffix="mm"
            />
          </Field>
          <Field label="Florart">
            <select
              value={setup.pile}
              onChange={(e) =>
                setSetup({ pile: e.target.value as 'cut' | 'loop' })
              }
              className="w-40 rounded-[8px] border border-line bg-surface px-3 py-2 text-sm"
            >
              <option value="cut">geschnitten (cut)</option>
              <option value="loop">Schlinge (loop)</option>
            </select>
          </Field>
          <Field
            label="Lauflänge"
            hint="Meter Garn pro Gramm. Leer lassen, wenn unbekannt."
          >
            <NumberInput
              value={setup.runLengthMPerG ?? NaN}
              onChange={(v) => setSetup({ runLengthMPerG: v })}
              min={0}
              step={0.5}
              suffix="m/g"
            />
          </Field>
        </div>

        <hr className="my-5 border-line" />
        <h3 className="text-sm font-bold">
          Kalibriertest{' '}
          <Info text="Garn wiegen, ein 10×10 cm Feld normal tuften (inkl. Umranden), erneut wiegen. Die Differenz ist der Garnverbrauch." />
        </h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Field label="Feldbreite">
            <NumberInput
              value={cal?.patchWidthCm ?? 10}
              onChange={(v) =>
                setSetup({
                  calibration: makeCalibration({
                    patchWidthCm: v,
                    patchHeightCm: cal?.patchHeightCm ?? 10,
                    gramsUsed: cal?.gramsUsed ?? 0,
                    pileHeightMm: cal?.pileHeightMm ?? setup.pileHeightMm,
                  }),
                })
              }
              suffix="cm"
            />
          </Field>
          <Field label="Feldhöhe">
            <NumberInput
              value={cal?.patchHeightCm ?? 10}
              onChange={(v) =>
                setSetup({
                  calibration: makeCalibration({
                    patchWidthCm: cal?.patchWidthCm ?? 10,
                    patchHeightCm: v,
                    gramsUsed: cal?.gramsUsed ?? 0,
                    pileHeightMm: cal?.pileHeightMm ?? setup.pileHeightMm,
                  }),
                })
              }
              suffix="cm"
            />
          </Field>
          <Field label="Garn verbraucht">
            <NumberInput
              value={cal?.gramsUsed ?? NaN}
              onChange={(v) =>
                setSetup({
                  calibration: makeCalibration({
                    patchWidthCm: cal?.patchWidthCm ?? 10,
                    patchHeightCm: cal?.patchHeightCm ?? 10,
                    gramsUsed: v,
                    pileHeightMm: cal?.pileHeightMm ?? setup.pileHeightMm,
                  }),
                })
              }
              suffix="g"
            />
          </Field>
        </div>
        {cal && cal.gramsUsed > 0 ? (
          <p className="mt-3 text-sm">
            Faktor:{' '}
            <span className="is-user">
              {calibrationFactor(cal).toFixed(3)} g/cm²
            </span>{' '}
            {calibrationPlausible(calibrationFactor(cal)) ? (
              <span className="text-ok">· plausibel</span>
            ) : (
              <span className="text-warn">
                · außerhalb des üblichen Bereichs (0,03–0,4) — bitte prüfen
              </span>
            )}
            <br />
            <span className="text-xs text-ink-soft">
              Am genauesten in der Nähe von {cal.pileHeightMm} mm Florhöhe.
            </span>
          </p>
        ) : null}
      </Card>

      {/* Business profile */}
      <Card className="mt-6 p-6">
        <h2 className="text-sm font-bold">
          Business-Profil <span className="text-ink-soft">· {biz.name}</span>
        </h2>
        <p className="mt-1 text-xs text-ink-soft">
          Grundlage für die Kalkulation im Export-Schritt.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Garnpreis">
            <NumberInput
              value={biz.yarnPricePerKg}
              onChange={(v) => setBiz({ yarnPricePerKg: v })}
              suffix="€/kg"
            />
          </Field>
          <Field label="Trägerstoff">
            <NumberInput
              value={biz.primaryClothPricePerM}
              onChange={(v) => setBiz({ primaryClothPricePerM: v })}
              suffix="€/m"
            />
          </Field>
          <Field label="Rückseitenstoff">
            <NumberInput
              value={biz.backingPricePerM2}
              onChange={(v) => setBiz({ backingPricePerM2: v })}
              suffix="€/m²"
            />
          </Field>
          <Field label="Kleber">
            <NumberInput
              value={biz.gluePricePerKg}
              onChange={(v) => setBiz({ gluePricePerKg: v })}
              suffix="€/kg"
            />
          </Field>
          <Field label="Rollenbreite Stoff">
            <NumberInput
              value={biz.rollWidthCm}
              onChange={(v) => setBiz({ rollWidthCm: v })}
              suffix="cm"
            />
          </Field>
          <Field label="Stundensatz">
            <NumberInput
              value={biz.hourlyRate}
              onChange={(v) => setBiz({ hourlyRate: v })}
              suffix="€/h"
            />
          </Field>
          <Field
            label="Arbeitszeit"
            hint="Stunden pro m² fertiger Teppich (Tuften + Schnitzen + Kleben + Rückseite + Kanten + Trimmen)."
          >
            <NumberInput
              value={biz.hoursPerM2}
              onChange={(v) => setBiz({ hoursPerM2: v })}
              min={0}
              step={0.5}
              suffix="h/m²"
            />
          </Field>
          <Field label="Strom (pauschal)">
            <NumberInput
              value={biz.electricityFlat}
              onChange={(v) => setBiz({ electricityFlat: v })}
              min={0}
              step={0.1}
              suffix="€"
            />
          </Field>
        </div>

        <hr className="my-5 border-line" />
        <h3 className="text-sm font-bold">Marktplatz-Gebühren & Ziel</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Field label="Transaktion" hint="% vom Verkaufspreis">
            <NumberInput
              value={biz.feeTransactionPct}
              onChange={(v) => setBiz({ feeTransactionPct: v })}
              min={0}
              step={0.1}
              suffix="%"
            />
          </Field>
          <Field label="Zahlung" hint="% vom Verkaufspreis">
            <NumberInput
              value={biz.feePaymentPct}
              onChange={(v) => setBiz({ feePaymentPct: v })}
              min={0}
              step={0.1}
              suffix="%"
            />
          </Field>
          <Field label="Zahlung fix">
            <NumberInput
              value={biz.feePaymentFixed}
              onChange={(v) => setBiz({ feePaymentFixed: v })}
              min={0}
              step={0.05}
              suffix="€"
            />
          </Field>
          <Field label="Einstellgebühr">
            <NumberInput
              value={biz.feeListing}
              onChange={(v) => setBiz({ feeListing: v })}
              min={0}
              step={0.05}
              suffix="€"
            />
          </Field>
          <Field label="Zielmarge">
            <NumberInput
              value={biz.targetMarginPct}
              onChange={(v) => setBiz({ targetMarginPct: v })}
              min={0}
              max={90}
              suffix="%"
            />
          </Field>
          <Field label="Zielgewinn">
            <NumberInput
              value={biz.targetProfit}
              onChange={(v) => setBiz({ targetProfit: v })}
              min={0}
              suffix="€"
            />
          </Field>
        </div>
        <p className="mt-3 text-xs text-ink-soft">
          Ob Marge oder Gewinn als Ziel gilt, stellst du im Export-Schritt um.
        </p>
      </Card>
    </div>
  )
}
