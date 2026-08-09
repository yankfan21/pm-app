import { useOutletContext } from 'react-router-dom'
import KeyMetricsDashboard from './KeyMetricsDashboard'
import { ProjectEvalSection } from './ProjectDocSectionRoutes'

// Overview - project goal/purpose (as entered at creation) plus the Key
// Metrics Dashboard content (Project Status/Progress %/Critical Issues) as
// a snapshot, per the original nav spec. Tasks-and-Milestones and the
// Documents checklist used to render here too (Phase 1's interim home for
// both - see projectSections.js), but have since moved to their own
// routes: PlanningTasksRoute.jsx (/planning/tasks) and DocumentsRoute.jsx
// (/documents).
//
// Project Evaluation came the other way: it was a Documents checklist row,
// and Overview is where it lands after the IA restructure, since the Project
// Status and Progress cards above it are both reading its latest snapshot.
// This is a functional relocation only - ProjectEvalView/ProjectEvalFlow are
// rendered as-is (via ProjectDocSectionRoutes' shared DocSection, same as the
// tracking-group routes). Whether it stays a section at the bottom of Overview
// or becomes a widget/sub-nav of its own is a deferred call for a future
// Overview redesign.
function ProjectOverviewRoute() {
  // milestones/collaborators were already loaded by ProjectDetailLayout and
  // sitting unused in outlet context - Upcoming Milestones and Team Hotspots
  // read them, so neither panel costs a query. docs.project_evaluation is the
  // same array the Project Evaluation section below renders, newest first -
  // KeyMetricsDashboard reads [0] for its Project Status/Progress cards
  // instead of issuing its own latest-evaluation query, so running an
  // evaluation down there updates them immediately.
  const { project, tasks, phases, milestones, collaborators, docs, docsLoading } = useOutletContext()

  return (
    <>
      <KeyMetricsDashboard
        project={project}
        tasks={tasks}
        phases={phases}
        milestones={milestones}
        collaborators={collaborators}
        riskLog={docs.risk_log}
        issueLog={docs.issue_log}
        evaluations={docs.project_evaluation}
        evaluationsLoading={docsLoading}
        expanded
      />

      <ProjectEvalSection />
    </>
  )
}

export default ProjectOverviewRoute
