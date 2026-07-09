import { Route, Routes } from 'react-router-dom'
import ProjectsShell from './ProjectsShell'
import Dashboard from './Dashboard'
import AllProjects from './AllProjects'
import ProjectDetailPage from './ProjectDetailPage'
import NotFound from './NotFound'
import Login from './Login'
import './App.css'

// No RequireAuth gate here on purpose - the site stays fully open/browsable
// without signing in (demos, interviews). Auth exists on top (Sign In link,
// owner/editor/viewer roles once a user is logged in) but never blocks
// access to a page. RequireAuth.jsx is kept, unused, for the deliberate
// future Phase 4 cutover - see supabase/migrations/phase4_lockdown_rls.sql.
function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProjectsShell />}>
        <Route index element={<Dashboard />} />
        <Route path="projects" element={<AllProjects />} />
      </Route>
      <Route path="/projects/:projectId" element={<ProjectDetailPage />} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
