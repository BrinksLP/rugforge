/* ------------------------------------------------------------------ *
 * .rugforge.json export / import. Everything is embedded (image as a
 * data URL, both profiles). `version` drives future migrations.
 * ------------------------------------------------------------------ */

import type { Project } from '../types'

const slug = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ||
  'projekt'

export function exportProjectFile(project: Project) {
  const blob = new Blob([JSON.stringify(project, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slug(project.name)}.rugforge.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function importProjectFile(file: File): Promise<Project> {
  const text = await file.text()
  const data = JSON.parse(text) as Partial<Project>
  if (!data || typeof data !== 'object' || !data.size || !data.settings) {
    throw new Error('Keine gültige RugForge-Datei.')
  }
  // shallow migration hook
  if (data.version !== 1) data.version = 1
  if (!data.colorMerges) data.colorMerges = {}
  if (!data.bgColors) data.bgColors = []
  if (typeof data.pathSmoothing !== 'number') data.pathSmoothing = 1.2
  if (data.businessProfile && data.businessProfile.hoursPerM2 == null) {
    data.businessProfile.hoursPerM2 = 4
  }
  if (typeof data.maxStep !== 'number') data.maxStep = data.imageDataUrl ? 4 : 0
  return data as Project
}
