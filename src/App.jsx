import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import Marketing from './Marketing'
import Spinner from './Spinner'
import { useTheme } from './hooks/useTheme'
import { useDeviceMode } from './hooks/useDeviceMode'
import './App.css'

// Every route below is code-split with React.lazy so the public marketing
// page ("/") - the one route a logged-out visitor actually lands on - no
// longer drags the whole authenticated app (plus exceljs/jsPDF/html2canvas
// pulled in transitively by the export helpers) into the entry chunk.
// Marketing itself stays a static import for that reason: it's the entry
// point, so deferring it would only add a round trip.
//
// The named-export route modules (ProjectSectionRoutes /
// ProjectDocSectionRoutes) need the .then() unwrap because React.lazy takes
// a module whose *default* is the component. Each named route from the same
// file resolves to the same chunk, so this is one network fetch per module,
// not one per route.
const ProjectsShell = lazy(() => import('./ProjectsShell'))
const Dashboard = lazy(() => import('./Dashboard'))
const AllProjects = lazy(() => import('./AllProjects'))
const ProjectDetailPage = lazy(() => import('./ProjectDetailPage'))
const ProjectOverviewRoute = lazy(() => import('./ProjectOverviewRoute'))
const PlanningTasksRoute = lazy(() => import('./PlanningTasksRoute'))
const DocumentsRoute = lazy(() => import('./DocumentsRoute'))

const PlanningIndexRoute = lazy(() =>
  import('./ProjectSectionRoutes').then((m) => ({ default: m.PlanningIndexRoute })),
)
const PlanningPhasesRoute = lazy(() =>
  import('./ProjectSectionRoutes').then((m) => ({ default: m.PlanningPhasesRoute })),
)
const PlanningBacklogRoute = lazy(() =>
  import('./ProjectSectionRoutes').then((m) => ({ default: m.PlanningBacklogRoute })),
)
const ExecutionIndexRoute = lazy(() =>
  import('./ProjectSectionRoutes').then((m) => ({ default: m.ExecutionIndexRoute })),
)
const ExecutionGanttRoute = lazy(() =>
  import('./ProjectSectionRoutes').then((m) => ({ default: m.ExecutionGanttRoute })),
)
const ExecutionListWaterfallRoute = lazy(() =>
  import('./ProjectSectionRoutes').then((m) => ({ default: m.ExecutionListWaterfallRoute })),
)
const ExecutionTeamWaterfallRoute = lazy(() =>
  import('./ProjectSectionRoutes').then((m) => ({ default: m.ExecutionTeamWaterfallRoute })),
)
const ExecutionSprintBoardRoute = lazy(() =>
  import('./ProjectSectionRoutes').then((m) => ({ default: m.ExecutionSprintBoardRoute })),
)
const ExecutionSprintRetroRoute = lazy(() =>
  import('./ProjectSectionRoutes').then((m) => ({ default: m.ExecutionSprintRetroRoute })),
)
const ExecutionListAgileRoute = lazy(() =>
  import('./ProjectSectionRoutes').then((m) => ({ default: m.ExecutionListAgileRoute })),
)
const ExecutionTeamAgileRoute = lazy(() =>
  import('./ProjectSectionRoutes').then((m) => ({ default: m.ExecutionTeamAgileRoute })),
)

const ScopingRoute = lazy(() =>
  import('./ProjectDocSectionRoutes').then((m) => ({ default: m.ScopingRoute })),
)
const RiskLogRoute = lazy(() =>
  import('./ProjectDocSectionRoutes').then((m) => ({ default: m.RiskLogRoute })),
)
const IssuesLogRoute = lazy(() =>
  import('./ProjectDocSectionRoutes').then((m) => ({ default: m.IssuesLogRoute })),
)
const BudgetTrackerRoute = lazy(() =>
  import('./ProjectDocSectionRoutes').then((m) => ({ default: m.BudgetTrackerRoute })),
)
const CommunicationsIndexRoute = lazy(() =>
  import('./ProjectDocSectionRoutes').then((m) => ({ default: m.CommunicationsIndexRoute })),
)
const ExecCommsRoute = lazy(() =>
  import('./ProjectDocSectionRoutes').then((m) => ({ default: m.ExecCommsRoute })),
)
const TeamNewsletterRoute = lazy(() =>
  import('./ProjectDocSectionRoutes').then((m) => ({ default: m.TeamNewsletterRoute })),
)
const StatusUpdateRoute = lazy(() =>
  import('./ProjectDocSectionRoutes').then((m) => ({ default: m.StatusUpdateRoute })),
)

const Settings = lazy(() => import('./Settings'))
const AdminPage = lazy(() => import('./AdminPage'))
const NotFound = lazy(() => import('./NotFound'))
const Login = lazy(() => import('./Login'))
const ForgotPassword = lazy(() => import('./ForgotPassword'))
const PrivacyPolicy = lazy(() => import('./PrivacyPolicy'))
const ResetPassword = lazy(() => import('./ResetPassword'))
const AccountDeleted = lazy(() => import('./AccountDeleted'))
const RequireAuth = lazy(() => import('./RequireAuth'))
const AdminRoute = lazy(() => import('./AdminRoute'))
const DeviceModeGate = lazy(() => import('./DeviceModeGate'))

const MobileShell = lazy(() => import('./mobile/MobileShell'))
const MobileDashboard = lazy(() => import('./mobile/MobileDashboard'))
const MobileNotifications = lazy(() => import('./mobile/MobileNotifications'))
const MobileMore = lazy(() => import('./mobile/MobileMore'))
const MobileSettings = lazy(() => import('./mobile/MobileSettings'))
const MobileProjectLayout = lazy(() => import('./mobile/MobileProjectLayout'))
const MobileProjectTasks = lazy(() => import('./mobile/MobileProjectTasks'))
const MobileTaskDetail = lazy(() => import('./mobile/MobileTaskDetail'))
const MobileProjectSprintBoard = lazy(() => import('./mobile/MobileProjectSprintBoard'))
const MobileProjectMetrics = lazy(() => import('./mobile/MobileProjectMetrics'))
const MobileProjectMore = lazy(() => import('./mobile/MobileProjectMore'))
const MobileProjectDocuments = lazy(() => import('./mobile/MobileProjectDocuments'))
const MobileProjectRisks = lazy(() => import('./mobile/MobileProjectRisks'))
const MobileProjectIssues = lazy(() => import('./mobile/MobileProjectIssues'))
const MobileProjectStatusUpdate = lazy(() => import('./mobile/MobileProjectStatusUpdate'))
const MobileProjectExecComms = lazy(() => import('./mobile/MobileProjectExecComms'))
const MobileProjectNewsletter = lazy(() => import('./mobile/MobileProjectNewsletter'))

// Shown only while a lazy route chunk is in flight - deliberately minimal so
// it reads as a momentary pause rather than a screen of its own. Reuses the
// same Spinner/.btn-spinner as the rest of the app.
function RouteFallback() {
  return (
    <div className="route-fallback" role="status" aria-live="polite">
      <Spinner />
    </div>
  )
}

// Pathless layout route that owns the Suspense boundary for every lazy route.
// See the comment on "/" in App below for why the boundary is here rather
// than wrapped around <Routes>.
function SuspenseBoundary() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Outlet />
    </Suspense>
  )
}

// Phase 4 cutover: every route other than the public pre-auth ones below
// requires a signed-in session - see
// supabase/migrations/phase4_full_lockdown_no_anon.sql for the matching RLS
// side of this. RequireAuth bounces an unauthenticated visitor to /login and
// stashes the page they wanted so Login can send them back afterward.
//
// "/" is the public marketing page (Marketing.jsx), NOT the Dashboard - the
// signed-in home moved to /dashboard when the front door became public.
// Anything that used to point at "/" as "the app's home" now points at
// /dashboard (AppShell's nav + brand, NotFound, AdminRoute, Login's
// post-sign-in default and OAuth redirect, deviceRouteMap's DESKTOP_HOME,
// and manifest.json's start_url).
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
      {/* Pre-auth siblings of /login - deliberately outside both RequireAuth
          (a locked-out user has no session to guard) and DeviceModeGate (no
          deviceRouteMap entry either: these render identically at any width
          off the same CSS as /login, rather than splitting into desktop and
          mobile trees). /reset-password is where the recovery email lands,
          so it must stay reachable with no session; "/" is the public
          marketing page and has to survive a phone-width viewport without
          being redirected into the app's /m tree.

          "/" also sits OUTSIDE SuspenseBoundary below, and not just because
          Marketing is eagerly imported and so would never suspend: the
          prerender step (scripts/prerender.mjs) snapshots this page's DOM
          and main.jsx hydrates that markup. A client-serialized snapshot
          carries none of the <!--$--> comment markers React writes around a
          real SSR Suspense boundary, so having one anywhere in "/"'s
          rendered tree fails hydration with React error #418. */}
      <Route path="/" element={<Marketing />} />

      {/* Everything below is lazily loaded, so it all needs a Suspense
          boundary. It lives in a pathless layout route rather than around
          <Routes> for the hydration reason above. */}
      <Route element={<SuspenseBoundary />}>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Lands after DeleteAccountFlow/MobileDeleteAccount sign the user
            out post-deletion - no session exists by the time this renders,
            same reasoning as /reset-password above. */}
        <Route path="/account-deleted" element={<AccountDeleted />} />

        {/* Public legal page - linked from the marketing footer and the
            sign-up form, and reachable with no session for the same reason
            the routes above are. Unlike "/" it has no Capacitor redirect:
            app-store review expects to find it inside the native build. */}
        <Route path="/privacy" element={<PrivacyPolicy />} />

        <Route element={<RequireAuth />}>
          {/* Viewport-width auto-detection (<768px -> mobile) plus the
              session-only manual override - see DeviceModeGate.jsx and
              deviceRouteMap.js. Wraps every authenticated route so it can
              redirect either direction (desktop <-> mobile) regardless of
              which subtree below actually renders. */}
          <Route element={<DeviceModeGate />}>
            <Route element={<ProjectsShell />}>
              <Route path="dashboard" element={<Dashboard />} />
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

              {/* The tracking group (see PRIMARY_CATEGORIES in
                  projectSections.js) - doc types that came off the Documents
                  checklist to become destinations of their own. All rendered by
                  ProjectDocSectionRoutes.jsx off the same DOCUMENT_TYPES
                  entries the checklist used. */}
              <Route path="scoping" element={<ScopingRoute />} />
              <Route path="risk-log" element={<RiskLogRoute />} />
              <Route path="issues-log" element={<IssuesLogRoute />} />
              <Route path="budget-tracker" element={<BudgetTrackerRoute />} />

              <Route path="communications">
                <Route index element={<CommunicationsIndexRoute />} />
                <Route path="exec-comms" element={<ExecCommsRoute />} />
                <Route path="newsletter" element={<TeamNewsletterRoute />} />
                <Route path="status-update" element={<StatusUpdateRoute />} />
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
              <Route path="/m/settings" element={<MobileSettings />} />
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
      </Route>
    </Routes>
  )
}

export default App
