import { Route, Routes } from 'react-router-dom'
import ProjectsShell from './ProjectsShell'
import Dashboard from './Dashboard'
import AllProjects from './AllProjects'
import ProjectDetailPage from './ProjectDetailPage'
import NotFound from './NotFound'
import Login from './Login'
import RequireAuth from './RequireAuth'
import './App.css'

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
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
