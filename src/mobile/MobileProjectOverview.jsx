import { Link, useOutletContext, useParams } from 'react-router-dom'

function MobileProjectOverview() {
  const { project } = useOutletContext()
  const { projectId } = useParams()

  return (
    <div>
      <h1 className="mobile-screen-title">Overview</h1>
      <p className="mobile-screen-stub">{project.goal || 'No goal set.'}</p>

      <Link to={`/m/projects/${projectId}/more/risks`} className="mobile-more-list-item">
        Flag a Risk
      </Link>
    </div>
  )
}

export default MobileProjectOverview
