import { NavLink, useLocation } from 'react-router-dom'
import { PRIMARY_CATEGORIES, visibleSectionsForCategory } from './projectSections'

// Segment right after /projects/:projectId/ - 'overview' if the path is
// somehow shorter than that (shouldn't happen once the index route redirect
// in App.jsx is in place, but keeps this resilient either way).
function currentCategoryFromPath(pathname) {
  const match = pathname.match(/\/projects\/[^/]+\/([^/]+)/)
  return match ? match[1] : 'overview'
}

// Two-tier nav for the project detail routes: a primary strip (Overview /
// Planning / Execution / Documents) plus a secondary panel listing the
// current category's sections, filtered by methodology via
// visibleSectionsForCategory - the same visibleSides() logic
// ProjectDetail.jsx used for its old accordion show/hide, just driving a nav
// list instead. `project` comes in as a plain prop rather than via
// useOutletContext() - this component is rendered as a sibling of
// <Outlet/> in ProjectDetailLayout.jsx, not as one of the Outlet's own
// matched children, so it sits outside the context that hook reads from.
function ProjectNav({ project }) {
  const location = useLocation()
  const category = currentCategoryFromPath(location.pathname)
  const sections = visibleSectionsForCategory(category, project.methodology)

  return (
    <div className="project-nav">
      <nav className="project-nav-primary" aria-label="Project sections">
        {PRIMARY_CATEGORIES.map((c) => (
          <NavLink
            key={c.key}
            to={c.key}
            className={`project-nav-primary-item ${category === c.key ? 'selected' : ''}`}
          >
            <span className="project-nav-primary-icon" aria-hidden="true">
              {c.icon}
            </span>
            <span className="project-nav-primary-label">{c.label}</span>
          </NavLink>
        ))}
      </nav>

      {sections.length > 0 && (
        <nav className="project-nav-secondary" aria-label={`${category} sections`}>
          {sections.map((s) => (
            <NavLink
              key={s.key}
              to={`${category}/${s.path}`}
              className={({ isActive }) => `project-nav-secondary-item ${isActive ? 'selected' : ''}`}
            >
              {s.label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}

export default ProjectNav
