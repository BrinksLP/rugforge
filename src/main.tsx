import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import { AppShell } from './components/AppShell'
import { EditorPage } from './routes/EditorPage'
import { ProjectsPage } from './routes/ProjectsPage'
import { SettingsPage } from './routes/SettingsPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/editor" replace />} />
          <Route path="/editor" element={<EditorPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/editor" replace />} />
        </Routes>
      </AppShell>
    </HashRouter>
  </StrictMode>,
)
