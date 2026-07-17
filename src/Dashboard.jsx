import { useOutletContext } from 'react-router-dom'
import ProjectList from './ProjectList'

function byDeadlineSoonestFirst(a, b) {
  if (a.deadline == null && b.deadline == null) return 0
  if (a.deadline == null) return 1
  if (b.deadline == null) return -1
  return a.deadline.localeCompare(b.deadline)
}

function Dashboard() {
  const { projects, loading, hideProject } = useOutletContext()
  const active = projects
    .filter((p) => p.status !== 'Archived')
    .sort(byDeadlineSoonestFirst)

  return (
    <div className="dashboard">
      <h2 className="page-title view-title">Dashboard</h2>
      <p className="dashboard-subtitle">
        Active projects, soonest deadline first.
      </p>
      <ProjectList
        projects={active}
        loading={loading}
        emptyMessage="No active projects"
        onHide={hideProject}
      />
    </div>
  )
}

export default Dashboard
