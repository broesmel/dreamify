import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Shell } from './components/AppShell'
import { EveningPage } from './pages/EveningPage'
import { DreamPage } from './pages/DreamPage'
import { JournalPage } from './pages/JournalPage'
import { SettingsPage } from './pages/SettingsPage'

export default function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<EveningPage />} />
          <Route path="/dream" element={<DreamPage />} />
          <Route path="/journal" element={<JournalPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  )
}
