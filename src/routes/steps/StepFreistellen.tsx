import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card, Field } from '../../components/ui'
import { useEditor } from '../../store/editorStore'
import { loadSegmentationModel, segmentForeground } from '../../lib/segmentation'

type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se' | null

export function StepFreistellen() {
  const img = useEditor((s) => s.sourceImage)
  const crop = useEditor((s) => s.project.crop)
  const setCrop = useEditor((s) => s.setCrop)
  const setMask = useEditor((s) => s.setMask)
  const goStep = useEditor((s) => s.goStep)

  const wrapRef = useRef<HTMLDivElement>(null)
  const maskRef = useRef<HTMLCanvasElement | null>(null)
  const dragRef = useRef<{
    h: Handle
    startX: number
    startY: number
    box: { x: number; y: number; w: number; h: number }
  } | null>(null)
  const painting = useRef(false)
  const [brush, setBrush] = useState(false)
  const [erase, setErase] = useState(true)
  const [brushSize, setBrushSize] = useState(40)
  const [, force] = useState(0)

  const [segBusy, setSegBusy] = useState<null | 'loading' | 'running'>(null)
  const [segError, setSegError] = useState<string | null>(null)
  const [threshold, setThreshold] = useState(0.5)

  const natural = img
    ? { w: img.naturalWidth, h: img.naturalHeight }
    : { w: 1, h: 1 }

  const box = useMemo(
    () => crop ?? { x: 0, y: 0, w: natural.w, h: natural.h },
    [crop, natural.w, natural.h],
  )

  // (re)create the mask canvas when the image changes
  useEffect(() => {
    if (!img) return
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, c.width, c.height)
    maskRef.current = c
    setSegError(null)
    force((n) => n + 1)
  }, [img])

  if (!img) {
    return (
      <Card className="p-8 text-sm text-ink-soft">
        Zuerst ein Bild laden.
      </Card>
    )
  }

  const displayW = 640
  const scale = displayW / natural.w
  const displayH = natural.h * scale

  function toNat(clientX: number, clientY: number) {
    const r = wrapRef.current!.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(natural.w, (clientX - r.left) / scale)),
      y: Math.max(0, Math.min(natural.h, (clientY - r.top) / scale)),
    }
  }

  /* ---- crop dragging ---- */
  function onCropPointerDown(h: Handle, e: React.PointerEvent) {
    if (brush) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = toNat(e.clientX, e.clientY)
    dragRef.current = { h, startX: p.x, startY: p.y, box: { ...box } }
  }
  function onCropPointerMove(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d || !d.h) return
    const p = toNat(e.clientX, e.clientY)
    const dx = p.x - d.startX
    const dy = p.y - d.startY
    let { x, y, w, h } = d.box
    if (d.h === 'move') {
      x = Math.max(0, Math.min(natural.w - w, x + dx))
      y = Math.max(0, Math.min(natural.h - h, y + dy))
    } else {
      if (d.h.includes('w')) {
        x = d.box.x + dx
        w = d.box.w - dx
      }
      if (d.h.includes('e')) w = d.box.w + dx
      if (d.h.includes('n')) {
        y = d.box.y + dy
        h = d.box.h - dy
      }
      if (d.h.includes('s')) h = d.box.h + dy
    }
    w = Math.max(20, w)
    h = Math.max(20, h)
    x = Math.max(0, Math.min(natural.w - w, x))
    y = Math.max(0, Math.min(natural.h - h, y))
    setCrop({ x, y, w, h })
  }
  function onCropPointerUp() {
    dragRef.current = null
  }

  /* ---- brush ---- */
  function paintAt(clientX: number, clientY: number) {
    const c = maskRef.current
    if (!c) return
    const p = toNat(clientX, clientY)
    const ctx = c.getContext('2d')!
    ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over'
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(p.x, p.y, brushSize / scale, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
    setMask(c)
    force((n) => n + 1)
  }

  function resetMask() {
    const c = maskRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, c.width, c.height)
    setMask(c)
    setSegError(null)
    force((n) => n + 1)
  }

  async function autoMask() {
    if (!img || segBusy) return
    setSegError(null)
    try {
      setSegBusy('loading')
      await loadSegmentationModel()
      setSegBusy('running')
      const result = await segmentForeground(img, crop ?? null, { threshold })
      const c = maskRef.current
      if (!c) return
      const ctx = c.getContext('2d')!
      ctx.globalCompositeOperation = 'source-over'
      ctx.clearRect(0, 0, c.width, c.height)
      ctx.drawImage(result, 0, 0)
      setMask(c)
      setBrush(true)
      force((n) => n + 1)
    } catch (e) {
      console.error('auto mask failed', e)
      setSegError(
        'Automatische Freistellung fehlgeschlagen. Modell konnte nicht geladen ' +
          'oder ausgeführt werden — du kannst die Maske von Hand pinseln.',
      )
    } finally {
      setSegBusy(null)
    }
  }

  function bakeFromAlpha() {
    const c = maskRef.current
    if (!c) return
    const tmp = document.createElement('canvas')
    tmp.width = c.width
    tmp.height = c.height
    const tctx = tmp.getContext('2d')!
    tctx.drawImage(img!, 0, 0)
    const d = tctx.getImageData(0, 0, c.width, c.height)
    const ctx = c.getContext('2d')!
    const md = ctx.getImageData(0, 0, c.width, c.height)
    for (let i = 0; i < d.data.length; i += 4) {
      const keep = d.data[i + 3] > 20
      md.data[i] = 255
      md.data[i + 1] = 255
      md.data[i + 2] = 255
      md.data[i + 3] = keep ? 255 : 0
    }
    ctx.putImageData(md, 0, 0)
    setMask(c)
    force((n) => n + 1)
  }

  const segLabel =
    segBusy === 'loading'
      ? 'Modell wird geladen …'
      : segBusy === 'running'
        ? 'Wird freigestellt …'
        : 'Automatisch freistellen'

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_300px]">
      <Card className="p-6">
        <div
          ref={wrapRef}
          className="relative select-none"
          style={{ width: displayW, height: displayH }}
          onPointerMove={(e) => {
            onCropPointerMove(e)
            if (brush && painting.current) paintAt(e.clientX, e.clientY)
          }}
          onPointerUp={() => {
            onCropPointerUp()
            painting.current = false
          }}
          onPointerLeave={() => {
            onCropPointerUp()
            painting.current = false
          }}
        >
          <img
            src={img.src}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full"
            style={{
              background:
                'repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 50%/16px 16px',
            }}
          />
          {maskRef.current ? (
            <MaskPreview canvas={maskRef.current} w={displayW} h={displayH} />
          ) : null}

          {brush ? (
            <div
              className="absolute inset-0 cursor-crosshair"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId)
                painting.current = true
                paintAt(e.clientX, e.clientY)
              }}
            />
          ) : (
            <div
              className="absolute border-2 border-accent"
              style={{
                left: box.x * scale,
                top: box.y * scale,
                width: box.w * scale,
                height: box.h * scale,
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
              }}
              onPointerDown={(e) => onCropPointerDown('move', e)}
            >
              {(['nw', 'ne', 'sw', 'se'] as const).map((h) => (
                <span
                  key={h}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    onCropPointerDown(h, e)
                  }}
                  className="absolute h-3 w-3 rounded-full border border-white bg-accent"
                  style={{
                    left: h.includes('w') ? -6 : undefined,
                    right: h.includes('e') ? -6 : undefined,
                    top: h.includes('n') ? -6 : undefined,
                    bottom: h.includes('s') ? -6 : undefined,
                    cursor: `${h}-resize`,
                  }}
                />
              ))}
            </div>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="ghost" onClick={() => setCrop(null)}>
            Ganzes Bild
          </Button>
          <Button onClick={() => goStep(2)}>Weiter → Größe</Button>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-sm font-bold">Zuschneiden</h3>
        <p className="mt-1 text-sm text-ink-soft">
          Ziehe den Rahmen auf das Motiv. Der gewählte Bereich bestimmt später
          die Maße des Teppichs — leerer Rand wird nicht mitgezählt.
        </p>

        <hr className="my-4 border-line" />

        <h3 className="text-sm font-bold">Hintergrund entfernen</h3>
        <p className="mt-1 text-sm text-ink-soft">
          Stellt das Motiv im gewählten Rahmen automatisch frei. Läuft komplett
          offline; der erste Aufruf lädt einmalig ein ~5 MB Modell.
        </p>
        <div className="mt-3 space-y-3">
          <Button onClick={autoMask} disabled={!!segBusy}>
            {segLabel}
          </Button>
          <Field label={`Feinheit des Schnitts: ${threshold.toFixed(2)}`}>
            <input
              type="range"
              min={0.3}
              max={0.7}
              step={0.05}
              value={threshold}
              disabled={!!segBusy}
              onChange={(e) => setThreshold(+e.target.value)}
            />
          </Field>
          <p className="text-xs text-ink-soft">
            Höher = enger am Motiv, mehr Hintergrund weg. Danach mit dem Pinsel
            nachbessern.
          </p>
          {segError ? (
            <p className="rounded-[8px] bg-warn/15 px-3 py-2 text-xs text-warn">
              {segError}
            </p>
          ) : null}
        </div>

        <hr className="my-4 border-line" />

        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={brush}
            onChange={(e) => setBrush(e.target.checked)}
          />
          Maske von Hand bearbeiten
        </label>

        {brush ? (
          <div className="mt-3 space-y-3">
            <div className="flex gap-2">
              <Button
                variant={erase ? 'primary' : 'ghost'}
                onClick={() => setErase(true)}
              >
                Entfernen
              </Button>
              <Button
                variant={!erase ? 'primary' : 'ghost'}
                onClick={() => setErase(false)}
              >
                Wiederherstellen
              </Button>
            </div>
            <Field label={`Pinselgröße: ${brushSize} px`}>
              <input
                type="range"
                min={8}
                max={120}
                value={brushSize}
                onChange={(e) => setBrushSize(+e.target.value)}
              />
            </Field>
            <Button variant="ghost" onClick={bakeFromAlpha}>
              Aus Transparenz übernehmen
            </Button>
          </div>
        ) : null}

        <hr className="my-4 border-line" />
        <Button variant="ghost" onClick={resetMask}>
          Maske zurücksetzen
        </Button>
      </Card>
    </div>
  )
}

function MaskPreview({
  canvas,
  w,
  h,
}: {
  canvas: HTMLCanvasElement
  w: number
  h: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const dst = ref.current
    if (!dst) return
    dst.width = w
    dst.height = h
    const ctx = dst.getContext('2d')!
    ctx.clearRect(0, 0, w, h)

    // turquoise wash over the area that will be KEPT (mask = opaque)
    ctx.fillStyle = 'rgba(45, 212, 191, 0.22)'
    ctx.fillRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(canvas, 0, 0, w, h)
    ctx.globalCompositeOperation = 'source-over'

    // darker contour: dilate the mask silhouette, subtract the original
    const ring = document.createElement('canvas')
    ring.width = w
    ring.height = h
    const rc = ring.getContext('2d')!
    const r = 2
    for (let a = 0; a < 8; a++) {
      rc.drawImage(
        canvas,
        Math.round(r * Math.cos((a * Math.PI) / 4)),
        Math.round(r * Math.sin((a * Math.PI) / 4)),
        w,
        h,
      )
    }
    rc.globalCompositeOperation = 'destination-out'
    rc.drawImage(canvas, 0, 0, w, h)
    rc.globalCompositeOperation = 'source-in'
    rc.fillStyle = 'rgba(13, 148, 136, 0.9)'
    rc.fillRect(0, 0, w, h)
    ctx.drawImage(ring, 0, 0)
  })
  return (
    <canvas
      ref={ref}
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  )
}
