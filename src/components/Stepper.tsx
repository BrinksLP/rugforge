import { STEPS, useEditor } from '../store/editorStore'

export function Stepper() {
  const step = useEditor((s) => s.step)
  const maxStep = useEditor((s) => s.maxStepReached)
  const hasImage = useEditor((s) => !!s.project.imageDataUrl)
  const stale = useEditor((s) => s.patternStale)
  const goStep = useEditor((s) => s.goStep)

  return (
    <div className="sticky top-[57px] z-10 -mx-6 mb-6 border-b border-line bg-canvas/95 px-6 py-3 backdrop-blur">
      <ol className="flex items-center gap-2">
        {STEPS.map((label, i) => {
          const reachable = i === 0 || (hasImage && i <= maxStep + 1)
          const active = i === step
          const done = i < maxStep && (i > 0 ? hasImage : true)
          return (
            <li key={label} className="flex flex-1 items-center gap-2">
              <button
                disabled={!reachable}
                onClick={() => reachable && goStep(i)}
                className={`flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-sm transition ${
                  active
                    ? 'bg-accent text-white'
                    : done
                      ? 'bg-accent-soft text-accent'
                      : 'text-ink-soft'
                } ${reachable ? 'hover:opacity-90' : 'cursor-not-allowed opacity-50'}`}
              >
                <span
                  className={`grid h-5 w-5 place-items-center rounded-full border text-xs ${
                    active
                      ? 'border-white'
                      : done
                        ? 'border-accent'
                        : 'border-line'
                  }`}
                >
                  {i + 1}
                </span>
                <span className="font-semibold">{label}</span>
                {label === 'Vorlage' && stale && hasImage ? (
                  <span className="ml-auto rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-medium text-warn">
                    wird neu berechnet
                  </span>
                ) : null}
              </button>
              {i < STEPS.length - 1 ? (
                <span className="hidden h-px w-4 bg-line sm:block" />
              ) : null}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
