import { useOutletContext } from 'react-router-dom'
import KeyMetricsDashboard from './KeyMetricsDashboard'

// Overview - project goal/purpose (as entered at creation) plus the Key
// Metrics Dashboard content (Project Status/Progress %/Critical Issues) as
// a snapshot, per the original nav spec. Tasks-and-Milestones and the
// Documents checklist used to render here too (Phase 1's interim home for
// both - see projectSections.js), but have since moved to their own
// routes: PlanningTasksRoute.jsx (/planning/tasks) and DocumentsRoute.jsx
// (/documents).
function ProjectOverviewRoute() {
  const { project, tasks, phases, docs } = useOutletContext()

  return (
    <>
      <KeyMetricsDashboard
        project={project}
        tasks={tasks}
        phases={phases}
        riskLog={docs.risk_log}
        issueLog={docs.issue_log}
        expanded
      />
    </>
  )
}

export default ProjectOverviewRoute
