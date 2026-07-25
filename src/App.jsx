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
  ExecutionRiskLogRoute,
} from './ProjectSectionRoutes'
import Settings from './Settings'
import NotFound from './NotFound'
import Login from './Login'
import RequireAuth from './RequireAuth'
import DeviceModeGate from './DeviceModeGate'
import { useTheme } from './hooks/useTheme'
import { useDeviceMode } from './hooks/useDeviceMode'
import MobileShell from './mobile/MobileShell'
import MobileDashboard from './mobile/MobileDashboard'
import MobileNotifications from './mobile/MobileNotifications'
import MobileMore from './mobile/MobileMore'
import MobileProjectLayout from './mobile/MobileProjectLayout'
import MobileProjectTasks from './mobile/MobileProjectTasks'
import MobileTaskDetail from './mobile/MobileTaskDetail'
import MobileProjectSprintBoard from './mobile/MobileProjectSprintBoard'
import MobileProjectMetrics from './mobile/MobileProjectMetrics'
import MobileProjectMore from './mobile/MobileProjectMore'
import MobileProjectDocuments from './mobile/MobileProjectDocuments'
import MobileProjectRisks from './mobile/MobileProjectRisks'
import MobileProjectStatusUpdate from './mobile/MobileProjectStatusUpdate'
import MobileProjectComms from './mobile/MobileProjectComms'
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
  // Mounted here (not just in Settings) so the 'system' preference listener
  // stays live across the whole app, not only while Settings is on screen.
  useTheme()
  // Same reasoning as useTheme() above - DeviceModeGate below also calls
  // this hook itself (it's the one that acts on it), so this call is
  // belt-and-suspenders rather than load-bearing on its own.
  useDeviceMode()

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<RequireAuth />}>
        {/* Viewport-width auto-detection (<768px -> mobile) plus the
            session-only manual override - see DeviceModeGate.jsx and
            deviceRouteMap.js. Wraps every authenticated route so it can
            redirect either direction (desktop <-> mobile) regardless of
            which subtree below actually renders. */}
        <Route element={<DeviceModeGate />}>
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
              <Route path="risk-log" element={<ExecutionRiskLogRoute />} />
            </Route>

            <Route path="documents" element={<DocumentsRoute />} />
            <Route path="*" element={<Navigate to="overview" replace />} />
          </Route>

          <Route path="/settings" element={<Settings />} />

          {/* Phone mode - purpose-built components under src/mobile/, own
              route tree entirely separate from the desktop /projects/:id
              subtree above. See CLAUDE.md Phone-Mode architecture note: this
              exists so desktop layout/CSS changes can never silently regress
              phone mode, and vice versa. */}
          <Route path="/m" element={<Navigate to="/m/dashboard" replace />} />
          <Route element={<MobileShell />}>
            <Route path="/m/dashboard" element={<MobileDashboard />} />
            <Route path="/m/notifications" element={<MobileNotifications />} />
            <Route path="/m/more" element={<MobileMore />} />
          </Route>

          <Route path="/m/projects/:projectId" element={<MobileProjectLayout />}>
            {/* Overview - single destination, project goal + Key Metrics
                Dashboard content (see MobileProjectMetrics.jsx). No
                separate /metrics route - collapsed into this index route. */}
            <Route index element={<MobileProjectMetrics />} />
            <Route path="tasks" element={<MobileProjectTasks />} />
            <Route path="tasks/:taskId" element={<MobileTaskDetail />} />
            <Route path="sprint-board" element={<MobileProjectSprintBoard />} />
            <Route path="more" element={<MobileProjectMore />} />
            <Route path="more/documents" element={<MobileProjectDocuments />} />
            <Route path="more/risks" element={<MobileProjectRisks />} />
            <Route path="more/status-update" element={<MobileProjectStatusUpdate />} />
            <Route path="more/comms" element={<MobileProjectComms />} />
            <Route path="*" element={<Navigate to="." replace />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
