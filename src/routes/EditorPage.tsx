import { useCallback, useEffect, useRef, useState } from 'react'
import { Stepper } from '../components/Stepper'
import { Button } from '../components/ui'
import { useEditor } from '../store/editorStore'
import { deleteProject, listProjects } from '../lib/db'
import type { Project } from '../types'
import { StepImage } from './steps/StepImage'
import { StepFreistellen } from './steps/StepFreistellen'
import { StepSize } from './steps/StepSize'
import { StepPattern } from './steps/StepPattern'
import { StepExport } from './steps/StepExport'

/** ask "resume?" at most once per app start */
let resumeChecked = false

export function EditorPage() {
  const step = useEditor((s) => s.step)
  const name = useEditor((s) => s.project.name)
  const setName = useEditor((s) => s.setName)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  const canUndo = useEditor((s) => s.history.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const autosave = useEditor((s) => s.autosave)
  const hasImage = useEditor((s) => !!s.project.imageDataUrl)
  const projectId = useEditor((s) => s.project.id)
  const updatedAt = useEditor((s) => s.project.updatedAt)
  const imageDataUrl = useEditor((s) => s.project.imageDataUrl)
  const hasSource = useEditor((s) => !!s.sourceImage)
  const rehydrateImage = useEditor((s) => s.rehydrateImage)
  const load = useEditor((s) => s.load)
  const maxStepReached = useEditor((s) => s.maxStepReached)

  const [resume, setResume] = useState<Project | null>(null)

  // scroll back to the top whenever the wizard step changes
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [step])

  // on a fresh start, offer to resume the newest unfinished project
  useEffect(() => {
    if (resumeChecked) return
    resumeChecked = true
    if (useEditor.getState().project.imageDataUrl) return
    void listProjects().then((all) => {
      const cand = all.find(
        (p) =>
          p.imageDataUrl &&
          (p.maxStep ?? (p.imageDataUrl ? 4 : 0)) < 4,
      )
      if (cand) setResume(cand)
    })
  }, [])

  // started a fresh project instead of resuming -> drop the stale one
  useEffect(() => {
    if (!resume || !imageDataUrl || imageDataUrl === resume.imageDataUrl) return
    void deleteProject(resume.id)
    setResume(null)
  }, [resume, imageDataUrl])

  // after loading a saved project the <img> element is gone — rebuild it
  useEffect(() => {
    if (!imageDataUrl || hasSource) return
    const img = new Image()
    img.onload = () => rehydrateImage(img)
    img.src = imageDataUrl
  }, [imageDataUrl, hasSource, rehydrateImage])

  // autosave (debounced) whenever the project changes
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!hasImage) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void autosave(), 1200)
    return () => window.clearTimeout(timer.current)
  }, [autosave, hasImage, projectId, updatedAt, name, maxStepReached])

  const savePoint = useCallback(() => void autosave(), [autosave])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const STEP_LABELS = ['Bild', 'Freistellen', 'Größe', 'Vorlage', 'Export']

  return (
    <div>
      {resume ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[10px] border border-line bg-accent-soft px-4 py-3 text-sm">
          <span>
            Unfertiges Projekt <b>{resume.name}</b> vom{' '}
            {new Date(resume.updatedAt).toLocaleDateString('de-DE')} — zuletzt
            bei Schritt „{STEP_LABELS[resume.maxStep ?? 0] ?? 'Bild'}".
            Fortsetzen?
          </span>
          <div className="ml-auto flex gap-2">
            <Button
              onClick={() => {
                load(resume)
                useEditor.getState().goStep(resume.maxStep ?? 0)
                setResume(null)
              }}
            >
              Fortsetzen
            </Button>
            <Button variant="ghost" onClick={() => setResume(null)}>
              Ignorieren
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mb-4 flex items-center gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 rounded-[10px] border border-transparent bg-transparent px-2 py-1 text-2xl font-bold tracking-tight outline-none hover:border-line focus:border-accent"
        />
        <div className="flex items-center gap-1">
          <Button variant="ghost" onClick={undo} disabled={!canUndo} title="Rückgängig (Strg+Z)">
            ↶
          </Button>
          <Button variant="ghost" onClick={redo} disabled={!canRedo} title="Wiederholen (Strg+Y)">
            ↷
          </Button>
          <Button variant="ghost" onClick={savePoint} disabled={!hasImage}>
            ✓ Speichern
          </Button>
        </div>
      </div>

      <Stepper />

      {step === 0 && <StepImage />}
      {step === 1 && <StepFreistellen />}
      {step === 2 && <StepSize />}
      {step === 3 && <StepPattern />}
      {step === 4 && <StepExport />}
    </div>
  )
}
