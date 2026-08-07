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
  ExecutionIssueLogRoute,
} from './ProjectSectionRoutes'
import Settings from './Settings'
import AdminPage from './AdminPage'
import NotFound from './NotFound'
import Login from './Login'
import ForgotPassword from './ForgotPassword'
import ResetPassword from './ResetPassword'
import RequireAuth from './RequireAuth'
import AdminRoute from './AdminRoute'
import DeviceModeGate from './DeviceModeGate'
import { useTheme } from './hooks/useTheme'
import { useDeviceMode } from './hooks/useDeviceMode'
import MobileShell from './mobile/MobileShell'
import MobileDashboard from './mobile/MobileDashboard'
import MobileNotifications from './mobile/MobileNotifications'
import MobileMore from './mobile/MobileMore'
import MobileProjectSettings from './mobile/MobileProjectSettings'
import MobileProjectLayout from './mobile/MobileProjectLayout'
import MobileProjectTasks from './mobile/MobileProjectTasks'
import MobileTaskDetail from './mobile/MobileTaskDetail'
import MobileProjectSprintBoard from './mobile/MobileProjectSprintBoard'
import MobileProjectMetrics from './mobile/MobileProjectMetrics'
import MobileProjectMore from './mobile/MobileProjectMore'
import MobileProjectDocuments from './mobile/MobileProjectDocuments'
import MobileProjectRisks from './mobile/MobileProjectRisks'
import MobileProjectIssues from './mobile/MobileProjectIssues'
import MobileProjectStatusUpdate from './mobile/MobileProjectStatusUpdate'
import MobileProjectExecComms from './mobile/MobileProjectExecComms'
import MobileProjectNewsletter from './mobile/MobileProjectNewsletter'
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
  // No-op now that the app is a single permanent dark theme (data-theme is
  // set unconditionally by index.html's pre-paint script) - kept as a call
  // site in case per-user theming returns.
  useTheme()
  // Same reasoning as useTheme() above - DeviceModeGate below also calls
  // this hook itself (it's the one that acts on it), so this call is
  // belt-and-suspenders rather than load-bearing on its own.
  useDeviceMode()

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Pre-auth siblings of /login - deliberately outside both RequireAuth
          (a locked-out user has no session to guard) and DeviceModeGate (no
          deviceRouteMap entry either: these render identically at any width
          off the same CSS as /login, rather than splitting into desktop and
          mobile trees). /reset-password is where the recovery email lands,
          so it must stay reachable with no session. */}
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

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
              <Route path="issue-log" element={<ExecutionIssueLogRoute />} />
            </Route>

            <Route path="documents" element={<DocumentsRoute />} />
            <Route path="*" element={<Navigate to="overview" replace />} />
          </Route>

          <Route path="/settings" element={<Settings />} />

          {/* Hidden - no nav link anywhere. AdminRoute gates on ADMIN_EMAIL. */}
          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>

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
            <Route path="/m/settings" element={<MobileProjectSettings />} />
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
            <Route path="more/issues" element={<MobileProjectIssues />} />
            <Route path="more/status-update" element={<MobileProjectStatusUpdate />} />
            <Route path="more/exec-comms" element={<MobileProjectExecComms />} />
            <Route path="more/newsletter" element={<MobileProjectNewsletter />} />
            <Route path="*" element={<Navigate to="." replace />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
