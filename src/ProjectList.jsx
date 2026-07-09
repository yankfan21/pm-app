import { useNavigate } from 'react-router-dom'
import { METHODOLOGY_LABELS } from './methodology'

function ProjectList({ projects, loading, emptyMessage }) {
  const navigate = useNavigate()

  return (
    <ul className="project-list">
      {loading && <li className="empty">Loading...</li>}
      {!loading &&
        projects.map((project) => (
          <li
            key={project.id}
            className={
              project.status === 'Archived' ? 'clickable archived' : 'clickable'
            }
            onClick={() => navigate(`/projects/${project.id}`)}
          >
            <div className="project-name">
              {project.name}
              <span className="methodology-badge">
                {METHODOLOGY_LABELS[project.methodology] ?? project.methodology}
              </span>
            </div>
            <div className="project-goal">{project.goal}</div>
            <div className="project-meta">
              <span
                className={`priority-badge ${project.priority.toLowerCase()}`}
              >
                {project.priority}
              </span>
              {project.status === 'Archived' && (
                <span className="status-badge archived">Archived</span>
              )}
              <span>{project.deadline ?? 'TBD'}</span>
            </div>
          </li>
        ))}
      {!loading && projects.length === 0 && (
        <li className="empty">{emptyMessage || 'No projects yet'}</li>
      )}
    </ul>
  )
}

export default ProjectList
