import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card } from '../components/ui'
import {
  deleteProject,
  duplicateProject,
  listProjects,
  saveProject,
} from '../lib/db'
import { importProjectFile } from '../lib/projectFile'
import { newProject, useEditor } from '../store/editorStore'
import type { Project } from '../types'

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const load = useEditor((s) => s.load)
  const nav = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  async function refresh() {
    setProjects(await listProjects())
  }
  useEffect(() => {
    void refresh()
  }, [])

  function open(p: Project) {
    load(p)
    nav('/editor')
  }

  async function createNew() {
    const p = newProject(Date.now())
    load(p)
    nav('/editor')
  }

  async function onImport(file: File) {
    try {
      const p = await importProjectFile(file)
      p.id = newProject(Date.now()).id
      p.updatedAt = Date.now()
      await saveProject(p)
      await refresh()
    } catch (e) {
      alert((e as Error).message)
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Projekte</h1>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={() => fileRef.current?.click()}>
            Importieren (.rugforge.json)
          </Button>
          <Button onClick={createNew}>Neues Projekt</Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onImport(f)
          }}
        />
      </div>

      {projects.length === 0 ? (
        <Card className="p-10 text-center text-sm text-ink-soft">
          Noch keine gespeicherten Projekte. Lege im Editor eins an — es wird
          automatisch gespeichert.
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Card key={p.id} className="overflow-hidden">
              <button
                onClick={() => open(p)}
                className="block aspect-[4/3] w-full bg-canvas"
              >
                {p.imageDataUrl ? (
                  <img
                    src={p.imageDataUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="grid h-full place-items-center text-ink-soft">
                    kein Bild
                  </span>
                )}
              </button>
              <div className="p-3">
                <div className="truncate text-sm font-semibold">{p.name}</div>
                <div className="text-xs text-ink-soft">
                  {new Date(p.updatedAt).toLocaleString('de-DE')}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button variant="ghost" onClick={() => open(p)}>
                    Öffnen
                  </Button>
                  <button
                    className="text-xs text-ink-soft hover:text-ink"
                    onClick={async () => {
                      const name = prompt('Neuer Name', p.name)
                      if (name) {
                        await saveProject({ ...p, name, updatedAt: Date.now() })
                        await refresh()
                      }
                    }}
                  >
                    Umbenennen
                  </button>
                  <button
                    className="text-xs text-ink-soft hover:text-ink"
                    onClick={async () => {
                      await duplicateProject(
                        p,
                        newProject(Date.now()).id,
                        Date.now(),
                      )
                      await refresh()
                    }}
                  >
                    Duplizieren
                  </button>
                  <button
                    className="text-xs text-accent hover:brightness-90"
                    onClick={async () => {
                      if (confirm(`"${p.name}" löschen?`)) {
                        await deleteProject(p.id)
                        await refresh()
                      }
                    }}
                  >
                    Löschen
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
