import { useOutletContext } from 'react-router-dom'
import ProjectList from './ProjectList'
import MobileAppTeaserCard from './components/MobileAppTeaserCard'
import { useAuth } from './AuthContext'
import { CALMSKY } from './redesign'

function byDeadlineSoonestFirst(a, b) {
  if (a.deadline == null && b.deadline == null) return 0
  if (a.deadline == null) return 1
  if (b.deadline == null) return -1
  return a.deadline.localeCompare(b.deadline)
}

function greetingFor(hour) {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

// First name guessed from the email's local part (no profile name exists).
function firstNameFromEmail(email) {
  const first = (email || '').split('@')[0].split(/[.\-_+]+/).filter(Boolean)[0] || ''
  return first ? first[0].toUpperCase() + first.slice(1) : ''
}

function summaryLine(active) {
  const count = active.length
  const soon = Date.now() + 30 * 24 * 60 * 60 * 1000
  const goLives = active.filter((p) => p.deadline && new Date(p.deadline).getTime() <= soon && new Date(p.deadline).getTime() >= Date.now() - 86400000).length
  const parts = [`${count} active ${count === 1 ? 'project' : 'projects'}`]
  if (goLives > 0) parts.push(`${goLives} ${goLives === 1 ? 'go-live' : 'go-lives'} in the next 30 days`)
  return parts.join(' · ')
}

function Dashboard() {
  const { projects, loading, hideProject } = useOutletContext()
  const { user } = useAuth()
  const active = projects
    .filter((p) => p.status !== 'Archived')
    .sort(byDeadlineSoonestFirst)

  return (
    <div className="dashboard">
      {CALMSKY ? (
        <>
          <h2 className="page-title view-title dashboard-greeting">
            {greetingFor(new Date().getHours())}
            {firstNameFromEmail(user?.email) ? `, ${firstNameFromEmail(user.email)}` : ''}.
          </h2>
          <p className="dashboard-subtitle">
            {loading ? 'Loading your projects...' : summaryLine(active)}. Soonest deadline first.
          </p>
        </>
      ) : (
        <>
          <h2 className="page-title view-title">Dashboard</h2>
          <p className="dashboard-subtitle">
            Active projects, soonest deadline first.
          </p>
        </>
      )}
      <MobileAppTeaserCard />
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
