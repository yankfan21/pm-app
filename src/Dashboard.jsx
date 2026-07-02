import ProjectList from './ProjectList'

function byDeadlineSoonestFirst(a, b) {
  if (a.deadline == null && b.deadline == null) return 0
  if (a.deadline == null) return 1
  if (b.deadline == null) return -1
  return a.deadline.localeCompare(b.deadline)
}

function Dashboard({ projects, loading, onSelect }) {
  const active = projects
    .filter((p) => p.status !== 'Archived')
    .sort(byDeadlineSoonestFirst)

  return (
    <div className="dashboard">
      <p className="dashboard-subtitle">
        Active projects, soonest deadline first.
      </p>
      <ProjectList
        projects={active}
        loading={loading}
        onSelect={onSelect}
        emptyMessage="No active projects"
      />
    </div>
  )
}

export default Dashboard
