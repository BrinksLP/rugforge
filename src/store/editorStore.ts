/* ------------------------------------------------------------------ *
 * Editor state: the working project + transient bits (loaded image,
 * freistell-mask, computed pattern), step navigation, undo/redo and
 * autosave.
 * ------------------------------------------------------------------ */

import { create } from 'zustand'
import type { Pattern, PatternPreset, Project, RugSize } from '../types'
import { PRESETS } from '../types'
import { STANDARD_BUSINESS, STANDARD_SETUP, id } from '../lib/profiles'
import { gridResolution, cellSizeMm } from '../lib/calc'
import { buildPattern, resolveMergedColor } from '../lib/pattern'
import { saveProject } from '../lib/db'

export const STEPS = ['Bild', 'Freistellen', 'Größe', 'Vorlage', 'Export'] as const
export type StepKey = (typeof STEPS)[number]

type Snapshot = Pick<
  Project,
  'crop' | 'size' | 'settings' | 'recolors' | 'colorMerges' | 'bgColors'
>

function snap(p: Project): Snapshot {
  return {
    crop: p.crop,
    size: { ...p.size },
    settings: { ...p.settings },
    recolors: { ...p.recolors },
    colorMerges: { ...p.colorMerges },
    bgColors: [...p.bgColors],
  }
}

export function newProject(now: number): Project {
  return {
    id: id('proj'),
    name: 'Neues Projekt',
    createdAt: now,
    updatedAt: now,
    imageDataUrl: null,
    crop: null,
    size: { widthCm: 80, heightCm: 120, stitchesPerCm: 2 },
    settings: { preset: 'medium', ...PRESETS.medium },
    recolors: {},
    colorMerges: {},
    bgColors: [],
    setupProfile: { ...STANDARD_SETUP },
    businessProfile: { ...STANDARD_BUSINESS },
    version: 1,
  }
}

interface EditorState {
  project: Project
  step: number
  maxStepReached: number

  sourceImage: HTMLImageElement | null
  /** freistellen mask, same pixel size as sourceImage; white = keep */
  mask: HTMLCanvasElement | null

  pattern: Pattern | null
  /** the rasterised source (crop + mask) the current pattern was built
   *  from — reused to refine the tufting-path outlines against the image */
  sourceRaster: ImageData | null
  computing: boolean
  /** size / settings changed since the last pattern build */
  patternStale: boolean

  history: Snapshot[]
  future: Snapshot[]

  /* actions */
  load: (p: Project) => void
  rehydrateImage: (img: HTMLImageElement) => void
  reset: (now: number) => void
  goStep: (i: number) => void
  setName: (name: string) => void
  setImage: (dataUrl: string, img: HTMLImageElement) => void
  setMask: (c: HTMLCanvasElement) => void
  setCrop: (crop: Project['crop']) => void
  setSize: (patch: Partial<RugSize>) => void
  setPreset: (preset: PatternPreset) => void
  setSetting: <K extends keyof Project['settings']>(
    key: K,
    value: Project['settings'][K],
  ) => void
  setSetupProfile: (patch: Partial<Project['setupProfile']>) => void
  setBusinessProfile: (patch: Partial<Project['businessProfile']>) => void
  recolor: (regionId: number, paletteIndex: number) => void
  clearRecolor: (regionId: number) => void
  mergeColors: (from: number, into: number) => void
  unmergeColor: (index: number) => void
  /** mark / unmark a palette colour as "not tufted" (background) */
  setBackground: (index: number, on: boolean) => void
  /** back to a clean slate: preset defaults, no recolours, no merges */
  resetAdjustments: () => void
  recompute: () => Promise<void>
  undo: () => void
  redo: () => void
  autosave: () => Promise<void>
}

function pushHistory(state: EditorState): Partial<EditorState> {
  return {
    history: [...state.history.slice(-49), snap(state.project)],
    future: [],
  }
}

export const useEditor = create<EditorState>((set, get) => ({
  project: newProject(0),
  step: 0,
  maxStepReached: 0,
  sourceImage: null,
  mask: null,
  pattern: null,
  sourceRaster: null,
  computing: false,
  patternStale: true,
  history: [],
  future: [],

  load: (p) =>
    set({
      project: {
        ...p,
        colorMerges: p.colorMerges ?? {},
        bgColors: p.bgColors ?? [],
      },
      step: 0,
      maxStepReached: p.imageDataUrl ? 4 : 0,
      pattern: null,
      sourceRaster: null,
      patternStale: true,
      history: [],
      future: [],
      sourceImage: null,
      mask: null,
    }),

  rehydrateImage: (img) => set({ sourceImage: img, patternStale: true }),

  reset: (now) =>
    set({
      project: newProject(now),
      step: 0,
      maxStepReached: 0,
      sourceImage: null,
      mask: null,
      pattern: null,
      sourceRaster: null,
      patternStale: true,
      history: [],
      future: [],
    }),

  goStep: (i) =>
    set((s) => ({
      step: Math.max(0, Math.min(STEPS.length - 1, i)),
      maxStepReached: Math.max(s.maxStepReached, i),
    })),

  setName: (name) =>
    set((s) => ({ project: { ...s.project, name } })),

  setImage: (dataUrl, img) =>
    set((s) => ({
      ...pushHistory(s),
      project: {
        ...s.project,
        imageDataUrl: dataUrl,
        crop: null,
        recolors: {},
        colorMerges: {},
        bgColors: [],
      },
      sourceImage: img,
      mask: null,
      pattern: null,
      patternStale: true,
      maxStepReached: Math.max(s.maxStepReached, 1),
    })),

  setMask: (c) => set({ mask: c, patternStale: true }),

  setCrop: (crop) =>
    set((s) => ({
      ...pushHistory(s),
      project: { ...s.project, crop },
      patternStale: true,
    })),

  setSize: (patch) =>
    set((s) => ({
      ...pushHistory(s),
      project: { ...s.project, size: { ...s.project.size, ...patch } },
      patternStale: true,
    })),

  setPreset: (preset) =>
    set((s) => ({
      ...pushHistory(s),
      project: {
        ...s.project,
        settings: { preset, ...PRESETS[preset] },
        // palette gets rebuilt with a different colour count -> old merges /
        // background marks would point at the wrong swatches
        colorMerges: {},
        bgColors: [],
      },
      patternStale: true,
    })),

  setSetting: (key, value) =>
    set((s) => ({
      ...pushHistory(s),
      project: {
        ...s.project,
        settings: { ...s.project.settings, [key]: value },
        colorMerges: key === 'colorCount' ? {} : s.project.colorMerges,
        bgColors: key === 'colorCount' ? [] : s.project.bgColors,
      },
      patternStale: true,
    })),

  setSetupProfile: (patch) =>
    set((s) => ({
      project: {
        ...s.project,
        setupProfile: { ...s.project.setupProfile, ...patch },
      },
      patternStale: true,
    })),

  setBusinessProfile: (patch) =>
    set((s) => ({
      project: {
        ...s.project,
        businessProfile: { ...s.project.businessProfile, ...patch },
      },
    })),

  recolor: (regionId, paletteIndex) =>
    set((s) => ({
      ...pushHistory(s),
      project: {
        ...s.project,
        recolors: { ...s.project.recolors, [regionId]: paletteIndex },
      },
    })),

  clearRecolor: (regionId) =>
    set((s) => {
      const next = { ...s.project.recolors }
      delete next[regionId]
      return { ...pushHistory(s), project: { ...s.project, recolors: next } }
    }),

  mergeColors: (from, into) =>
    set((s) => {
      if (from === into) return {}
      const merges = s.project.colorMerges ?? {}
      const root = resolveMergedColor(into, merges)
      if (root === from) return {} // don't close a loop
      // point `from`, plus anything already pointing at `from`, at the root
      const next: Record<number, number> = { [from]: root }
      for (const [k, v] of Object.entries(merges)) {
        next[+k] = v === from ? root : v
      }
      return { ...pushHistory(s), project: { ...s.project, colorMerges: next } }
    }),

  unmergeColor: (index) =>
    set((s) => {
      const merges = s.project.colorMerges ?? {}
      if (merges[index] == null) return {}
      const next = { ...merges }
      delete next[index]
      return { ...pushHistory(s), project: { ...s.project, colorMerges: next } }
    }),

  setBackground: (index, on) =>
    set((s) => {
      const cur = s.project.bgColors ?? []
      const has = cur.includes(index)
      if (on === has) return {}
      const next = on ? [...cur, index] : cur.filter((i) => i !== index)
      return { ...pushHistory(s), project: { ...s.project, bgColors: next } }
    }),

  resetAdjustments: () =>
    set((s) => {
      const preset = s.project.settings.preset
      return {
        ...pushHistory(s),
        project: {
          ...s.project,
          settings: { preset, ...PRESETS[preset] },
          recolors: {},
          colorMerges: {},
          bgColors: [],
        },
        patternStale: true,
      }
    }),

  recompute: async () => {
    const { sourceImage, project, mask } = get()
    if (!sourceImage) return
    set({ computing: true })
    // let the UI paint the "wird neu berechnet" state first
    await new Promise((r) => setTimeout(r, 0))
    try {
      const src = rasterise(sourceImage, project.crop, mask)
      const { cols, rows } = gridResolution(project.size)
      const pattern = buildPattern({
        source: src,
        cols,
        rows,
        cellSizeMm: cellSizeMm(project.size.stitchesPerCm),
        settings: project.settings,
      })
      // drop any merges / background marks that no longer fit the palette
      const merges = project.colorMerges ?? {}
      const pruned: Record<number, number> = {}
      for (const [k, v] of Object.entries(merges)) {
        if (+k < pattern.palette.length && v < pattern.palette.length)
          pruned[+k] = v
      }
      const bg = (project.bgColors ?? []).filter(
        (i) => i < pattern.palette.length,
      )
      const changed =
        Object.keys(pruned).length !== Object.keys(merges).length ||
        bg.length !== (project.bgColors ?? []).length
      set({
        pattern,
        sourceRaster: src,
        patternStale: false,
        computing: false,
        ...(changed
          ? {
              project: {
                ...get().project,
                colorMerges: pruned,
                bgColors: bg,
              },
            }
          : {}),
      })
    } catch (e) {
      console.error('pattern build failed', e)
      set({ computing: false })
    }
  },

  undo: () =>
    set((s) => {
      const prev = s.history[s.history.length - 1]
      if (!prev) return {}
      return {
        history: s.history.slice(0, -1),
        future: [snap(s.project), ...s.future].slice(0, 50),
        project: { ...s.project, ...prev },
        patternStale: true,
      }
    }),

  redo: () =>
    set((s) => {
      const next = s.future[0]
      if (!next) return {}
      return {
        future: s.future.slice(1),
        history: [...s.history, snap(s.project)],
        project: { ...s.project, ...next },
        patternStale: true,
      }
    }),

  autosave: async () => {
    const { project } = get()
    if (!project.imageDataUrl) return
    const stamped = { ...project, updatedAt: nowMs() }
    set({ project: stamped })
    await saveProject(stamped)
  },
}))

/* ---- helpers ------------------------------------------------- */

function nowMs(): number {
  return Date.now()
}

/** draw the (optionally cropped + masked) source into an offscreen canvas */
function rasterise(
  img: HTMLImageElement,
  crop: Project['crop'],
  mask: HTMLCanvasElement | null,
): ImageData {
  const sx = crop?.x ?? 0
  const sy = crop?.y ?? 0
  const sw = crop?.w ?? img.naturalWidth
  const sh = crop?.h ?? img.naturalHeight

  // cap the working resolution so the pipeline stays fast
  const maxDim = 1400
  const scale = Math.min(1, maxDim / Math.max(sw, sh))
  const w = Math.max(1, Math.round(sw * scale))
  const h = Math.max(1, Math.round(sh * scale))

  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const ctx = cv.getContext('2d')!
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h)

  if (mask) {
    ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(mask, sx, sy, sw, sh, 0, 0, w, h)
    ctx.globalCompositeOperation = 'source-over'
  }
  return ctx.getImageData(0, 0, w, h)
}
