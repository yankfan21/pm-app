import { useState } from 'react'
import { Navigate, useOutletContext } from 'react-router-dom'
import PhaseDetailView from './PhaseDetailView'
import GanttChart from './GanttChart'
import BacklogView from './BacklogView'
import BacklogGenFlow from './BacklogGenFlow'
import SprintBoardView from './SprintBoardView'
import SprintRetroView from './SprintRetroView'
import TaskListView from './TaskListView'
import TeamView from './TeamView'
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
  const { phases, setPhases, canEdit } = useOutletContext()
  return (
    <MethodologySection side="waterfall">
      <PhaseDetailView phases={phases} setPhases={setPhases} canEdit={canEdit} expanded />
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
