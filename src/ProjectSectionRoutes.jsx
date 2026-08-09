import { useEffect, useState } from 'react'
import { Navigate, useOutletContext, useSearchParams } from 'react-router-dom'
import PhaseDetailView from './PhaseDetailView'
import GanttChart from './GanttChart'
import BacklogView from './BacklogView'
import BacklogGenFlow from './BacklogGenFlow'
import SprintBoardView from './SprintBoardView'
import SprintRetroView from './SprintRetroView'
import TaskListView from './TaskListView'
import TeamView from './TeamView'
import { isSprintOverdue } from './sprintStats'
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
  const { project, tasks, collaborators } = useOutletContext()
  return (
    <MethodologySection side="waterfall">
      <TaskListView
        title="List (Tasks)"
        variant="waterfall"
        tasks={tasks.filter((t) => t.backlog_status == null)}
        collaborators={collaborators}
        project={project}
        expanded
      />
    </MethodologySection>
  )
}

export function ExecutionTeamWaterfallRoute() {
  const { project, tasks, collaborators } = useOutletContext()
  return (
    <MethodologySection side="waterfall">
      <TeamView
        title="Team (Tasks)"
        variant="waterfall"
        tasks={tasks.filter((t) => t.backlog_status == null)}
        collaborators={collaborators}
        project={project}
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
    retros,
    milestones,
    collaborators,
    canEdit,
    selectedSprintId,
    setSelectedSprintId,
  } = useOutletContext()
  const [searchParams, setSearchParams] = useSearchParams()
  // ?sprintFilter=overdue - deep-link target for the Project Hotspots
  // "Overdue Sprints" badge (KeyMetricsDashboard.jsx's OverdueSprintsCard).
  // A one-shot jump rather than a persistent filter view (Sprint Board only
  // ever shows one sprint at a time, unlike Phases' All/Overdue toggle) -
  // auto-selects the earliest overdue sprint via the same layout-level
  // selectedSprintId state the Sprint dropdown uses, then clears the param
  // so switching sprints manually afterward doesn't re-trigger it and it
  // doesn't linger if the page is left/revisited without the param.
  const sprintFilter = searchParams.get('sprintFilter')

  useEffect(() => {
    if (sprintFilter !== 'overdue' || sprints.length === 0) return

    const todayStr = new Date().toISOString().slice(0, 10)
    const earliestOverdue = [...sprints]
      .filter((s) => isSprintOverdue(s, tasks, todayStr))
      .sort((a, b) => (a.end_date || '').localeCompare(b.end_date || ''))[0]

    if (earliestOverdue) setSelectedSprintId(earliestOverdue.id)

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('sprintFilter')
        return next
      },
      { replace: true }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprintFilter, sprints, tasks])

  return (
    <MethodologySection side="agile">
      <SprintBoardView
        project={project}
        tasks={tasks}
        setTasks={setTasks}
        sprints={sprints}
        setSprints={setSprints}
        retros={retros}
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
  const { project, tasks, collaborators } = useOutletContext()
  return (
    <MethodologySection side="agile">
      <TaskListView
        title="List (Backlog)"
        variant="agile"
        tasks={tasks.filter((t) => t.backlog_status != null)}
        collaborators={collaborators}
        project={project}
        expanded
      />
    </MethodologySection>
  )
}

export function ExecutionTeamAgileRoute() {
  const { project, tasks, collaborators, sprints, selectedSprintId } = useOutletContext()
  return (
    <MethodologySection side="agile">
      <TeamView
        title="Team (Backlog)"
        variant="agile"
        tasks={tasks.filter((t) => t.backlog_status != null)}
        collaborators={collaborators}
        project={project}
        sprints={sprints}
        selectedSprintId={selectedSprintId}
        expanded
      />
    </MethodologySection>
  )
}
