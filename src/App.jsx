import { Navigate, Route, Routes } from 'react-router-dom'
import ProjectsShell from './ProjectsShell'
import Dashboard from './Dashboard'
import AllProjects from './AllProjects'
import ProjectDetailPage from './ProjectDetailPage'
import ProjectOverviewRoute from './ProjectOverviewRoute'
import PlanningTasksRoute from './PlanningTasksRoute'
import DocumentsRoute from './DocumentsRoute'
import {
  PlanningIndexRoute,
  PlanningPhasesRoute,
  PlanningBacklogRoute,
  ExecutionIndexRoute,
  ExecutionGanttRoute,
  ExecutionListWaterfallRoute,
  ExecutionTeamWaterfallRoute,
  ExecutionSprintBoardRoute,
  ExecutionSprintRetroRoute,
  ExecutionListAgileRoute,
  ExecutionTeamAgileRoute,
} from './ProjectSectionRoutes'
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
//
// The /projects/:projectId subtree is a two-tier sidebar (see
// ProjectDetailLayout.jsx + ProjectNav.jsx): a persistent layout owns the
// project's data loading and renders whichever section route below is
// matched via <Outlet/>, so navigating between sections doesn't re-fetch or
// reset. The catch-all redirect to Overview also covers a stale/deep-linked
// URL to a section a project's current methodology hides (each
// methodology-gated section route redirects to Overview itself in that
// case; see MethodologySection in ProjectSectionRoutes.jsx).
function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<RequireAuth />}>
        <Route element={<ProjectsShell />}>
          <Route index element={<Dashboard />} />
          <Route path="projects" element={<AllProjects />} />
        </Route>

        <Route path="/projects/:projectId" element={<ProjectDetailPage />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<ProjectOverviewRoute />} />

          <Route path="planning">
            <Route index element={<PlanningIndexRoute />} />
            <Route path="phases" element={<PlanningPhasesRoute />} />
            <Route path="tasks" element={<PlanningTasksRoute />} />
            <Route path="backlog" element={<PlanningBacklogRoute />} />
          </Route>

          <Route path="execution">
            <Route index element={<ExecutionIndexRoute />} />
            <Route path="gantt" element={<ExecutionGanttRoute />} />
            <Route path="list-waterfall" element={<ExecutionListWaterfallRoute />} />
            <Route path="team-waterfall" element={<ExecutionTeamWaterfallRoute />} />
            <Route path="sprint-board" element={<ExecutionSprintBoardRoute />} />
            <Route path="sprint-retro" element={<ExecutionSprintRetroRoute />} />
            <Route path="list-agile" element={<ExecutionListAgileRoute />} />
            <Route path="team-agile" element={<ExecutionTeamAgileRoute />} />
          </Route>

          <Route path="documents" element={<DocumentsRoute />} />
          <Route path="*" element={<Navigate to="overview" replace />} />
        </Route>

        <Route path="/settings" element={<Settings />} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

export default App
