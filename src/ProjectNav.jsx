import { Fragment } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { PRIMARY_CATEGORIES, visibleSectionsForCategory } from './projectSections'

// Segment right after /projects/:projectId/ - 'overview' if the path is
// somehow shorter than that (shouldn't happen once the index route redirect
// in App.jsx is in place, but keeps this resilient either way).
function currentCategoryFromPath(pathname) {
  const match = pathname.match(/\/projects\/[^/]+\/([^/]+)/)
  return match ? match[1] : 'overview'
}

// Two-tier nav for the project detail routes: a primary list (Overview /
// Planning / Execution / Documents) plus the current category's sections,
// filtered by methodology via visibleSectionsForCategory - the same
// visibleSides() logic ProjectDetail.jsx used for its old accordion show/hide,
// just driving a nav list instead. `project` comes in as a plain prop rather
// than via useOutletContext() - this component is handed to AppShell.jsx as a
// node by ProjectDetailLayout.jsx rather than being one of the Outlet's own
// matched children, so it sits outside the context that hook reads from.
//
// The section list renders inline, directly beneath the primary item it
// belongs to. It used to be a separate panel in a second column, where being
// rendered after the whole primary list still read as "beside the selected
// category". In the single-column rail that same markup reads as belonging to
// the *last* primary item (Documents) instead of the selected one, so the two
// tiers interleave here rather than being two sibling lists.
function ProjectNav({ project }) {
  const location = useLocation()
  const category = currentCategoryFromPath(location.pathname)
  const sections = visibleSectionsForCategory(category, project.methodology)

  return (
    <div className="project-nav">
      <nav className="project-nav-primary" aria-label="Project sections">
        {PRIMARY_CATEGORIES.map((c, i) => {
          // Divider wherever the `group` value changes between two adjacent
          // entries (projectSections.js) - no category name is hardcoded
          // here, so regrouping/reordering is a config-only edit.
          const prev = PRIMARY_CATEGORIES[i - 1]
          const startsNewGroup = Boolean(prev) && prev.group !== c.group
          const isCurrent = category === c.key

          return (
            <Fragment key={c.key}>
              {startsNewGroup && <hr className="project-nav-primary-divider" />}
              <NavLink
                to={c.key}
                className={`project-nav-primary-item ${isCurrent ? 'selected' : ''}`}
              >
                <span className="project-nav-primary-icon" aria-hidden="true">
                  {c.icon}
                </span>
                <span className="project-nav-primary-label">{c.label}</span>
              </NavLink>

              {isCurrent && sections.length > 0 && (
                <div className="project-nav-secondary" role="group" aria-label={`${c.label} sections`}>
                  {sections.map((s) => (
                    <NavLink
                      key={s.key}
                      to={`${category}/${s.path}`}
                      className={({ isActive }) =>
                        `project-nav-secondary-item ${isActive ? 'selected' : ''}`
                      }
                    >
                      {s.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </Fragment>
          )
        })}
      </nav>
    </div>
  )
}

export default ProjectNav
