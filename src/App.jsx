import { Route, Routes } from 'react-router-dom'
import ProjectsShell from './ProjectsShell'
import Dashboard from './Dashboard'
import AllProjects from './AllProjects'
import ProjectDetailPage from './ProjectDetailPage'
import Settings from './Settings'
import NotFound from './NotFound'
import Login from './Login'
import RequireAuth from './RequireAuth'
import './App.css'

// Phase 4 cutover: every route other than /login requires a signed-in
// session - see supabase/migrations/phase4_full_lockdown_no_anon.sql for
// the matching RLS side of this. RequireAuth bounces an unauthenticated
// visitor to /login and stashes the page they wanted so Login can send them
// back afterward.
function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<RequireAuth />}>
        <Route element={<ProjectsShell />}>
          <Route index element={<Dashboard />} />
          <Route path="projects" element={<AllProjects />} />
        </Route>
        <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="/settings" element={<Settings />} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

export default App
