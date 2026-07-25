import { Navigate, useOutletContext } from 'react-router-dom'
import { visibleSides } from '../projectSections'

// Sprint Board view, Agile/Hybrid only (/m/projects/:projectId/sprint-board).
// The tab bar hides this route for pure Waterfall projects, but a stale/
// deep-linked URL could still land here directly - redirect to Overview in
// that case, same as desktop's MethodologySection guard.
function MobileProjectSprintBoard() {
  const { project } = useOutletContext()
  if (!visibleSides(project.methodology).agile) {
    return <Navigate to=".." replace />
  }

  return (
    <div>
      <h1 className="mobile-screen-title">Sprint Board</h1>
      <p className="mobile-screen-stub">Board coming soon.</p>
    </div>
  )
}

export default MobileProjectSprintBoard
