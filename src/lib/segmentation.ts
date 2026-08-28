/* ------------------------------------------------------------------ *
 * Offline foreground segmentation for photos (Iteration 2).
 *
 * Runs the small U^2-Net "portable" model (u2netp, ~4.6 MB) fully in
 * the browser via onnxruntime-web (single-thread WASM + SIMD). The
 * model and the WASM runtime are served from `<base>models/` and
 * `<base>ort/` — no network needed after the first load.
 *
 * The pure array maths (min-max normalise, threshold -> alpha) live at
 * the bottom and are the part covered by Vitest. Everything that
 * touches ort / the DOM is browser-only and loaded lazily.
 * ------------------------------------------------------------------ */

import type { InferenceSession } from 'onnxruntime-web'
import type { Crop } from '../types'

const MODEL_SIZE = 320
// ImageNet-ish normalisation u2netp was trained with (same as rembg).
const MEAN = [0.485, 0.456, 0.406] as const
const STD = [0.229, 0.224, 0.225] as const

type OrtModule = typeof import('onnxruntime-web/wasm')

let ortPromise: Promise<OrtModule> | null = null
let sessionPromise: Promise<InferenceSession> | null = null

async function getOrt(): Promise<OrtModule> {
  if (!ortPromise) ortPromise = import('onnxruntime-web/wasm')
  return ortPromise
}

/**
 * Kick off (and cache) loading of the ONNX runtime + model. Safe to
 * call repeatedly; the heavy work happens once. Call it early to warm
 * the cache, or just let `segmentForeground` trigger it.
 */
export function loadSegmentationModel(): Promise<InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = await getOrt()
      ort.env.wasm.numThreads = 1 // GitHub Pages sends no COOP/COEP headers
      ort.env.wasm.wasmPaths = `${import.meta.env.BASE_URL}ort/`
      const modelUrl = `${import.meta.env.BASE_URL}models/u2netp.onnx`
      return ort.InferenceSession.create(modelUrl, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      })
    })().catch((err) => {
      sessionPromise = null // let the next call retry
      throw err
    })
  }
  return sessionPromise
}

export interface SegmentOptions {
  /** 0..1 cut on the normalised saliency map. Higher = tighter cut-out. */
  threshold?: number
}

/**
 * Produce a freistell-mask for `img`: a canvas the same pixel size as
 * the source, white/opaque where the subject is, transparent where the
 * background was removed. Only the `crop` region is segmented; anything
 * outside stays "keep" so toggling the crop box doesn't fight the mask.
 */
export async function segmentForeground(
  img: HTMLImageElement,
  crop: Crop | null,
  opts: SegmentOptions = {},
): Promise<HTMLCanvasElement> {
  const threshold = opts.threshold ?? 0.5
  const session = await loadSegmentationModel()
  const ort = await getOrt()

  const iw = img.naturalWidth
  const ih = img.naturalHeight
  const sx = crop ? Math.round(crop.x) : 0
  const sy = crop ? Math.round(crop.y) : 0
  const sw = crop ? Math.round(crop.w) : iw
  const sh = crop ? Math.round(crop.h) : ih

  // --- crop region -> MODEL_SIZE square, read pixels ---
  const inCv = document.createElement('canvas')
  inCv.width = MODEL_SIZE
  inCv.height = MODEL_SIZE
  const inCtx = inCv.getContext('2d', { willReadFrequently: true })!
  inCtx.imageSmoothingEnabled = true
  inCtx.imageSmoothingQuality = 'high'
  inCtx.drawImage(img, sx, sy, sw, sh, 0, 0, MODEL_SIZE, MODEL_SIZE)
  const { data: px } = inCtx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE)

  // --- pack into a CHW float tensor with u2net normalisation ---
  const plane = MODEL_SIZE * MODEL_SIZE
  const input = new Float32Array(3 * plane)
  let maxVal = 1
  for (let i = 0; i < px.length; i += 4) {
    if (px[i] > maxVal) maxVal = px[i]
    if (px[i + 1] > maxVal) maxVal = px[i + 1]
    if (px[i + 2] > maxVal) maxVal = px[i + 2]
  }
  for (let p = 0, i = 0; p < plane; p++, i += 4) {
    input[p] = (px[i] / maxVal - MEAN[0]) / STD[0]
    input[p + plane] = (px[i + 1] / maxVal - MEAN[1]) / STD[1]
    input[p + 2 * plane] = (px[i + 2] / maxVal - MEAN[2]) / STD[2]
  }

  const tensor = new ort.Tensor('float32', input, [1, 3, MODEL_SIZE, MODEL_SIZE])
  const out = await session.run({ [session.inputNames[0]]: tensor })
  const scores = out[session.outputNames[0]].data as Float32Array

  // --- normalise + threshold into a small alpha canvas ---
  const norm = minMaxNormalise(scores)
  const alpha = thresholdToAlpha(norm, threshold)
  fillHoles(alpha, MODEL_SIZE, MODEL_SIZE)

  const smallCv = document.createElement('canvas')
  smallCv.width = MODEL_SIZE
  smallCv.height = MODEL_SIZE
  const smallImg = new ImageData(MODEL_SIZE, MODEL_SIZE)
  for (let p = 0, i = 0; p < plane; p++, i += 4) {
    smallImg.data[i] = 255
    smallImg.data[i + 1] = 255
    smallImg.data[i + 2] = 255
    smallImg.data[i + 3] = alpha[p]
  }
  smallCv.getContext('2d')!.putImageData(smallImg, 0, 0)

  // --- full-size mask: keep everything, then paint the crop region ---
  const mask = document.createElement('canvas')
  mask.width = iw
  mask.height = ih
  const mctx = mask.getContext('2d')!
  mctx.fillStyle = '#fff'
  mctx.fillRect(0, 0, iw, ih)
  mctx.clearRect(sx, sy, sw, sh)
  mctx.imageSmoothingEnabled = true
  mctx.imageSmoothingQuality = 'high'
  mctx.drawImage(smallCv, 0, 0, MODEL_SIZE, MODEL_SIZE, sx, sy, sw, sh)

  return mask
}

/**
 * Fill enclosed background holes: flood "outside" from the borders over
 * transparent cells; any transparent cell not reached sits inside the
 * subject, so make it opaque. Fixes u2netp leaving gaps in a flat/light
 * region of the motif.
 */
export function fillHoles(alpha: Uint8ClampedArray, w: number, h: number) {
  const outside = new Uint8Array(w * h)
  const stack: number[] = []
  const push = (i: number) => {
    if (i >= 0 && i < w * h && !outside[i] && alpha[i] < 128) {
      outside[i] = 1
      stack.push(i)
    }
  }
  for (let x = 0; x < w; x++) {
    push(x)
    push((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    push(y * w)
    push(y * w + w - 1)
  }
  while (stack.length) {
    const i = stack.pop()!
    const x = i % w
    if (x > 0) push(i - 1)
    if (x < w - 1) push(i + 1)
    if (i >= w) push(i - w)
    if (i < w * (h - 1)) push(i + w)
  }
  for (let i = 0; i < w * h; i++) {
    if (alpha[i] < 128 && !outside[i]) alpha[i] = 255
  }
}

/* ---- pure helpers (unit-tested) --------------------------------- */

/** Scale an array to 0..1 by its own min/max. Flat (all equal) -> all 0. */
export function minMaxNormalise(scores: ArrayLike<number>): Float32Array {
  const n = scores.length
  const out = new Float32Array(n)
  let mi = Infinity
  let ma = -Infinity
  for (let i = 0; i < n; i++) {
    const v = scores[i]
    if (v < mi) mi = v
    if (v > ma) ma = v
  }
  const range = ma - mi
  if (range <= 1e-9) return out // nothing salient
  for (let i = 0; i < n; i++) out[i] = (scores[i] - mi) / range
  return out
}

/**
 * Turn a normalised (0..1) saliency map into 0/255 alpha values with a
 * one-step feather: values within 0.1 of the cut get a mid alpha so the
 * scaled-up edge isn't a hard staircase.
 */
export function thresholdToAlpha(
  norm: ArrayLike<number>,
  threshold: number,
): Uint8ClampedArray {
  const n = norm.length
  const out = new Uint8ClampedArray(n)
  const lo = threshold - 0.1
  const hi = threshold + 0.1
  for (let i = 0; i < n; i++) {
    const v = norm[i]
    if (v <= lo) out[i] = 0
    else if (v >= hi) out[i] = 255
    else out[i] = Math.round(((v - lo) / (hi - lo)) * 255)
  }
  return out
}
