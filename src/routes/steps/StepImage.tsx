import { useRef, useState } from 'react'
import { Button, Card } from '../../components/ui'
import { useEditor } from '../../store/editorStore'
import { makeExampleProject } from '../../lib/example'

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = rej
    img.src = dataUrl
  })
}

export function StepImage() {
  const setImage = useEditor((s) => s.setImage)
  const load = useEditor((s) => s.load)
  const goStep = useEditor((s) => s.goStep)
  const imageDataUrl = useEditor((s) => s.project.imageDataUrl)
  const inputRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)

  async function accept(file: File) {
    if (!file.type.startsWith('image/')) return
    const dataUrl = await new Promise<string>((res) => {
      const r = new FileReader()
      r.onload = () => res(r.result as string)
      r.readAsDataURL(file)
    })
    const img = await loadImage(dataUrl)
    setImage(dataUrl, img)
    goStep(1)
  }

  async function useExample() {
    const now = Date.now()
    const { project, dataUrl } = makeExampleProject(now)
    load(project)
    const img = await loadImage(dataUrl)
    setImage(dataUrl, img)
    goStep(1)
  }

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_320px]">
      <Card className="p-8">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            const f = e.dataTransfer.files[0]
            if (f) void accept(f)
          }}
          className={`grid place-items-center rounded-[12px] border-2 border-dashed px-6 py-16 text-center transition ${
            drag ? 'border-accent bg-accent-soft' : 'border-line'
          }`}
        >
          <div className="text-4xl">🖼️</div>
          <p className="mt-3 text-lg font-semibold">Bild hierher ziehen</p>
          <p className="mt-1 text-sm text-ink-soft">
            PNG oder JPG. Am besten ein grafisches Motiv — Logo, Illustration,
            klare Flächen.
          </p>
          <div className="mt-5">
            <Button onClick={() => inputRef.current?.click()}>Bild auswählen</Button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void accept(f)
            }}
          />
        </div>

        {imageDataUrl ? (
          <div className="mt-6 flex items-center gap-4">
            <img
              src={imageDataUrl}
              alt="Aktuelles Bild"
              className="h-24 w-24 rounded-[10px] border border-line object-cover"
            />
            <div className="text-sm text-ink-soft">
              Bild geladen. Weiter mit <b>Freistellen</b>.
            </div>
            <Button variant="ghost" onClick={() => goStep(1)}>
              Weiter →
            </Button>
          </div>
        ) : null}
      </Card>

      <Card className="p-6">
        <h3 className="text-sm font-bold">Zum Ausprobieren</h3>
        <p className="mt-2 text-sm text-ink-soft">
          Ein fertiges Beispielprojekt (80 × 120 cm) mit einem einfachen
          grafischen Motiv.
        </p>
        <div className="mt-4">
          <Button variant="ghost" onClick={useExample}>
            Beispielprojekt laden
          </Button>
        </div>
        <hr className="my-5 border-line" />
        <h3 className="text-sm font-bold">Was gut funktioniert</h3>
        <ul className="mt-2 space-y-1 text-sm text-ink-soft">
          <li>• Grafiken mit klaren Farbflächen</li>
          <li>• Logos, Schriftzüge, Illustrationen</li>
        </ul>
        <h3 className="mt-4 text-sm font-bold">Noch nicht</h3>
        <ul className="mt-2 space-y-1 text-sm text-ink-soft">
          <li>• Fotos (kommt in Iteration 2)</li>
        </ul>
      </Card>
    </div>
  )
}
