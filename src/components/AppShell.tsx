import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/editor', label: 'Editor', icon: '✎' },
  { to: '/projects', label: 'Projekte', icon: '▤' },
  { to: '/settings', label: 'Einstellungen', icon: '⚙' },
]

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-[8px] bg-accent text-white text-sm font-bold">
              R
            </span>
            <span className="text-[15px] font-bold tracking-tight">RugForge</span>
          </div>
          <nav className="flex items-center gap-1">
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                className={({ isActive }) =>
                  `rounded-[10px] px-3 py-1.5 text-sm font-medium transition ${
                    isActive
                      ? 'bg-accent-soft text-accent'
                      : 'text-ink-soft hover:text-ink'
                  }`
                }
              >
                <span className="mr-1.5">{t.icon}</span>
                {t.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto text-xs text-ink-soft">
            Iteration 4 · Pfad & Kalkulation
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  )
}
