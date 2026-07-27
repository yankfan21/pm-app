import { useState } from 'react'
import { Navigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { supabase } from './supabaseClient'
import PhaseDetailView from './PhaseDetailView'
import GanttChart from './GanttChart'
import BacklogView from './BacklogView'
import BacklogGenFlow from './BacklogGenFlow'
import SprintBoardView from './SprintBoardView'
import SprintRetroView from './SprintRetroView'
import TaskListView from './TaskListView'
import TeamView from './TeamView'
import RiskLogView from './RiskLogView'
import IssueLogView from './IssueLogView'
import { createIssueObject } from './issueLogUtils'
import { visibleSides, visibleSectionsForCategory } from './projectSections'

// Every route below hands `expanded` a hard `true` - under the old
// single-page accordion these components could be collapsed independently
// of being "on screen", but now that each one is reached by navigating to
// its own URL, arriving at the route already means "show it". The
// collapsible header chrome (chevron/toggle button/status dot) that used to
// come with `expanded` has been removed from each component itself (see
// PhaseDetailView/GanttChart/KeyMetricsDashboard/BacklogView/
// SprintBoardView/SprintRetroView/TaskListView/TeamView) - `onToggle` no
// longer exists on any of their prop contracts, so it isn't passed here
// either.

// Redirects to Overview when the current methodology hides this section's
// side (e.g. landing on /execution/sprint-board on a pure Waterfall
// project) - the interim behavior specified for Phase 1 deep-links into a
// hidden section. `side` is 'waterfall' | 'agile'; omit it for a route with
// no methodology gate. Exported so PlanningTasksRoute.jsx (a sibling file,
// two levels deep under /projects/:projectId same as everything here) can
// reuse the same guard rather than duplicating it.
export function MethodologySection({ side, children }) {
  const { project } = useOutletContext()
  if (side && !visibleSides(project.methodology)[side]) {
    return <Navigate to="../../overview" replace />
  }
  return children
}

// Bare-category redirects (/planning, /execution with no section segment) -
// land on the first section visible for the current methodology rather than
// a fixed one, so e.g. a pure-Agile project's /planning goes straight to
// Backlog instead of Phases (which it wouldn't ever see in the nav list).
export function PlanningIndexRoute() {
  const { project } = useOutletContext()
  const sections = visibleSectionsForCategory('planning', project.methodology)
  return <Navigate to={sections[0] ? sections[0].path : '../overview'} replace />
}

export function ExecutionIndexRoute() {
  const { project } = useOutletContext()
  const sections = visibleSectionsForCategory('execution', project.methodology)
  return <Navigate to={sections[0] ? sections[0].path : '../overview'} replace />
}

export function PlanningPhasesRoute() {
  const { phases, setPhases, tasks, canEdit } = useOutletContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const phaseId = searchParams.get('phaseId')
  // ?phaseFilter=overdue - deep-link target for the Project Hotspots
  // "Overdue Phases" badge (KeyMetricsDashboard.jsx's OverduePhaseCard).
  const phaseFilter = searchParams.get('phaseFilter')

  // Same clear-after-flash contract as DocumentsRoute's clearRiskId /
  // PlanningTasksRoute's taskId handling - see PhaseDetailView's
  // highlightPhaseId effect for the arrival side.
  function clearPhaseId() {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('phaseId')
        return next
      },
      { replace: true }
    )
  }

  function setPhaseFilterOverdue(next) {
    setSearchParams((prev) => {
      const nextParams = new URLSearchParams(prev)
      if (next) nextParams.set('phaseFilter', 'overdue')
      else nextParams.delete('phaseFilter')
      return nextParams
    })
  }

  return (
    <MethodologySection side="waterfall">
      <PhaseDetailView
        phases={phases}
        setPhases={setPhases}
        tasks={tasks}
        canEdit={canEdit}
        expanded
        highlightPhaseId={phaseId}
        onPhaseHighlightDone={clearPhaseId}
        filterOverdue={phaseFilter === 'overdue'}
        onFilterOverdueChange={setPhaseFilterOverdue}
      />
    </MethodologySection>
  )
}

// The Backlog route's own "Generate from Charter" flow used to piggyback on
// the page-wide expandedSection accordion (BACKLOG_SECTION_KEYS in the old
// ProjectDetail.jsx); now that Backlog is the only thing on this route, it
// gets a plain local toggle instead.
export function PlanningBacklogRoute() {
  const { project, tasks, setTasks, sprints, milestones, setMilestones, collaborators, canEdit, docs } =
    useOutletContext()
  const [showGenFlow, setShowGenFlow] = useState(false)

  return (
    <MethodologySection side="agile">
      <>
        <BacklogView
          project={project}
          tasks={tasks}
          setTasks={setTasks}
          sprints={sprints}
          milestones={milestones}
          setMilestones={setMilestones}
          collaborators={collaborators}
          canEdit={canEdit}
          expanded
          canGenerateBacklog={!!docs.charter && canEdit}
          onGenerateBacklog={() => setShowGenFlow((prev) => !prev)}
        />

        {showGenFlow && canEdit && (
          <BacklogGenFlow
            project={project}
            charter={docs.charter}
            brief={docs.requirements_brief}
            riskLog={docs.risk_log}
            existingBacklogItems={tasks
              .filter((t) => t.backlog_status != null)
              .map((t) => ({ id: t.id, title: t.title, story_points: t.story_points, backlog_rank: t.backlog_rank }))}
            onCommitted={(insertedTasks) => setTasks((prev) => [...prev, ...insertedTasks])}
            onDone={() => setShowGenFlow(false)}
            onCancel={() => setShowGenFlow(false)}
          />
        )}
      </>
    </MethodologySection>
  )
}

export function ExecutionGanttRoute() {
  const { project, tasks, taskDependencies, phases, milestones, collaborators } = useOutletContext()
  return (
    <MethodologySection side="waterfall">
      <GanttChart
        project={project}
        tasks={tasks.filter((t) => t.backlog_status == null)}
        taskDependencies={taskDependencies}
        phases={phases}
        milestones={milestones}
        collaborators={collaborators}
        expanded
      />
    </MethodologySection>
  )
}

// "(Tasks)" / "(Backlog)" suffixes distinguish this from the Agile-scoped
// List/Team routes below - both used to just say "List"/"Team", which was
// only unambiguous back when they were rendered as separate labeled panels
// in one page; now that each is its own destination, the secondary nav
// labels (SECTIONS_BY_CATEGORY in projectSections.js) need to say the same
// thing the page itself does.
export function ExecutionListWaterfallRoute() {
  const { tasks, collaborators } = useOutletContext()
  return (
    <MethodologySection side="waterfall">
      <TaskListView
        title="List (Tasks)"
        variant="waterfall"
        tasks={tasks.filter((t) => t.backlog_status == null)}
        collaborators={collaborators}
        expanded
      />
    </MethodologySection>
  )
}

export function ExecutionTeamWaterfallRoute() {
  const { tasks, collaborators } = useOutletContext()
  return (
    <MethodologySection side="waterfall">
      <TeamView
        title="Team (Tasks)"
        variant="waterfall"
        tasks={tasks.filter((t) => t.backlog_status == null)}
        collaborators={collaborators}
        expanded
      />
    </MethodologySection>
  )
}

export function ExecutionSprintBoardRoute() {
  const {
    project,
    tasks,
    setTasks,
    sprints,
    setSprints,
    milestones,
    collaborators,
    canEdit,
    selectedSprintId,
    setSelectedSprintId,
  } = useOutletContext()
  return (
    <MethodologySection side="agile">
      <SprintBoardView
        project={project}
        tasks={tasks}
        setTasks={setTasks}
        sprints={sprints}
        setSprints={setSprints}
        milestones={milestones}
        collaborators={collaborators}
        canEdit={canEdit}
        expanded
        selectedSprintId={selectedSprintId}
        setSelectedSprintId={setSelectedSprintId}
      />
    </MethodologySection>
  )
}

export function ExecutionSprintRetroRoute() {
  const { project, sprints, retros, setRetros, tasks, canEdit } = useOutletContext()
  return (
    <MethodologySection side="agile">
      <SprintRetroView
        project={project}
        sprints={sprints}
        retros={retros}
        setRetros={setRetros}
        tasks={tasks}
        canEdit={canEdit}
        expanded
      />
    </MethodologySection>
  )
}

export function ExecutionListAgileRoute() {
  const { tasks, collaborators } = useOutletContext()
  return (
    <MethodologySection side="agile">
      <TaskListView
        title="List (Backlog)"
        variant="agile"
        tasks={tasks.filter((t) => t.backlog_status != null)}
        collaborators={collaborators}
        expanded
      />
    </MethodologySection>
  )
}

export function ExecutionTeamAgileRoute() {
  const { tasks, collaborators, sprints, selectedSprintId } = useOutletContext()
  return (
    <MethodologySection side="agile">
      <TeamView
        title="Team (Backlog)"
        variant="agile"
        tasks={tasks.filter((t) => t.backlog_status != null)}
        collaborators={collaborators}
        sprints={sprints}
        selectedSprintId={selectedSprintId}
        expanded
      />
    </MethodologySection>
  )
}

// Blank risk row shape matching RiskLogView.jsx's own newRow() (not
// exported from there) - kept in sync manually since this is the only
// other place that needs to originate a row rather than edit one.
function newRiskLogRow() {
  return {
    id: crypto.randomUUID(),
    risk: '',
    likelihood: null,
    severity: null,
    mitigation: '',
    owner: '',
  }
}

// Execution's "Log a Risk" entry point - no `side` gate in
// projectSections.js, so this is reachable regardless of methodology.
// Reuses RiskLogView.jsx as-is once a risk_logs row exists (identical to
// how DocumentsRoute.jsx renders it). The one thing Documents' flow
// doesn't give a PM is a way to create that first row without going
// through RiskLogFlow's AI Q&A (Evaluate Project) - so when docs.risk_log
// is still null, this route does its own direct .insert() instead,
// mirroring MobileProjectRisks.jsx's null-riskLog insert path. It seeds
// one blank row (rather than an empty array) so the click lands the PM
// straight into an editable RiskLogView row, matching the one-action
// "flag it now" mobile gives, rather than requiring a second "+ Add Risk"
// click. RiskLogFlow.jsx itself is untouched - this is a second, additive
// creation path, not a replacement.
export function ExecutionRiskLogRoute() {
  const { project, docs, setDocs, canEdit } = useOutletContext()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)
  const riskLog = docs.risk_log

  async function handleStart() {
    setCreating(true)
    setError(null)

    const { data, error } = await supabase
      .from('risk_logs')
      .insert({ project_id: project.id, risks: [newRiskLogRow()] })
      .select()
      .single()

    setCreating(false)

    if (error) {
      setError(error.message)
      return
    }

    setDocs((prev) => ({ ...prev, risk_log: data }))
  }

  if (!riskLog) {
    return (
      <div className="detail-zone">
        <h2 className="tasks-heading">Log a Risk</h2>
        {error && <p className="error">{error}</p>}
        {canEdit ? (
          <button type="button" className="btn-primary" onClick={handleStart} disabled={creating}>
            {creating ? 'Starting...' : '+ Log a Risk'}
          </button>
        ) : (
          <p className="charter-status">No risks logged yet.</p>
        )}
      </div>
    )
  }

  return (
    <div className="detail-zone">
      <h2 className="tasks-heading">Log a Risk</h2>
      <RiskLogView
        project={project}
        charter={docs.charter}
        brief={docs.requirements_brief}
        riskLog={riskLog}
        canEdit={canEdit}
        onUpdate={(updatedRow) => setDocs((prev) => ({ ...prev, risk_log: updatedRow }))}
      />
    </div>
  )
}

// Execution's "Log an Issue" entry point - mirrors ExecutionRiskLogRoute
// above exactly, including the direct .insert() bypass for a project's
// first issue_logs row (Issues Log has no AI Q&A flow at all - see
// IssueLogFlow.jsx - so this is the same "flag it now" shortcut applied to
// a doc type that's manual-only everywhere, not just from this entry point).
export function ExecutionIssueLogRoute() {
  const { project, docs, setDocs, canEdit } = useOutletContext()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)
  const issueLog = docs.issue_log

  async function handleStart() {
    setCreating(true)
    setError(null)

    const { data, error } = await supabase
      .from('issue_logs')
      .insert({ project_id: project.id, issues: [createIssueObject()] })
      .select()
      .single()

    setCreating(false)

    if (error) {
      setError(error.message)
      return
    }

    setDocs((prev) => ({ ...prev, issue_log: data }))
  }

  if (!issueLog) {
    return (
      <div className="detail-zone">
        <h2 className="tasks-heading">Log an Issue</h2>
        {error && <p className="error">{error}</p>}
        {canEdit ? (
          <button type="button" className="btn-primary" onClick={handleStart} disabled={creating}>
            {creating ? 'Starting...' : '+ Log an Issue'}
          </button>
        ) : (
          <p className="charter-status">No issues logged yet.</p>
        )}
      </div>
    )
  }

  return (
    <div className="detail-zone">
      <h2 className="tasks-heading">Log an Issue</h2>
      <IssueLogView
        project={project}
        issueLog={issueLog}
        canEdit={canEdit}
        onUpdate={(updatedRow) => setDocs((prev) => ({ ...prev, issue_log: updatedRow }))}
      />
    </div>
  )
}
