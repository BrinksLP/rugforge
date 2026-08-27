/* ------------------------------------------------------------------ *
 * IndexedDB store for saved projects (via `idb`).
 * Autosave + manual save points both write here.
 * ------------------------------------------------------------------ */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Project } from '../types'

interface RugForgeDB extends DBSchema {
  projects: {
    key: string
    value: Project
    indexes: { updatedAt: number }
  }
}

let dbp: Promise<IDBPDatabase<RugForgeDB>> | null = null

function db() {
  if (!dbp) {
    dbp = openDB<RugForgeDB>('rugforge', 1, {
      upgrade(d) {
        const store = d.createObjectStore('projects', { keyPath: 'id' })
        store.createIndex('updatedAt', 'updatedAt')
      },
    })
  }
  return dbp
}

export async function listProjects(): Promise<Project[]> {
  const all = await (await db()).getAllFromIndex('projects', 'updatedAt')
  return all.reverse() // newest first
}

export async function getProject(pid: string): Promise<Project | undefined> {
  return (await db()).get('projects', pid)
}

export async function saveProject(p: Project): Promise<void> {
  await (await db()).put('projects', p)
}

export async function deleteProject(pid: string): Promise<void> {
  await (await db()).delete('projects', pid)
}

export async function duplicateProject(
  p: Project,
  newId: string,
  now: number,
): Promise<Project> {
  const copy: Project = {
    ...p,
    id: newId,
    name: `${p.name} (Kopie)`,
    createdAt: now,
    updatedAt: now,
  }
  await saveProject(copy)
  return copy
}
