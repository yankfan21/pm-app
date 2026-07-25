import { useOutletContext } from 'react-router-dom'

function MobileProjectOverview() {
  const { project } = useOutletContext()

  return (
    <div>
      <h1 className="mobile-screen-title">Overview</h1>
      <p className="mobile-screen-stub">{project.goal || 'No goal set.'}</p>
    </div>
  )
}

export default MobileProjectOverview
