import { useState } from 'react'
import ManageAccess from './ManageAccess'

// Sidebar admin box, gated on canEdit (caller's job) - a home for
// project-administration actions generally, not just these two. New items
// slot in as another <li className="project-nav-admin-item"> below
// Archive Project; each item owns its own gating/state/behavior, this
// component just lays them out under one "Admin" heading.
function ProjectAdmin({ project, isOwner, archiving, onToggleArchive }) {
  const [accessExpanded, setAccessExpanded] = useState(false)

  return (
    <div className="project-nav-admin">
      <h2 className="project-nav-admin-heading">Admin</h2>
      <ul className="project-nav-admin-list">
        {isOwner && (
          <li className="project-nav-admin-item">
            <div className="project-nav-manage-access">
              <button
                type="button"
                className="collapsible-toggle"
                onClick={() => setAccessExpanded((prev) => !prev)}
                aria-expanded={accessExpanded}
              >
                <span className={`chevron ${accessExpanded ? '' : 'collapsed'}`} aria-hidden="true">
                  ▾
                </span>
                Manage Access
              </button>

              {accessExpanded && <ManageAccess project={project} />}
            </div>
          </li>
        )}

        <li className="project-nav-admin-item">
          <button
            type="button"
            className="btn-secondary project-nav-archive"
            disabled={archiving}
            onClick={onToggleArchive}
          >
            {archiving
              ? 'Saving...'
              : project.status === 'Archived'
                ? 'Unarchive Project'
                : 'Archive Project'}
          </button>
        </li>
      </ul>
    </div>
  )
}

export default ProjectAdmin
