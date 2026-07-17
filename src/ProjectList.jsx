import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { METHODOLOGY_LABELS } from './methodology'
import { HEALTH_LABELS, HEALTH_COLOR_CLASS } from './projectEvalHealth'

const ELEVATED_PRIORITIES = ['Critical', 'High']

// Left-border accent tier: reflects the project's health evaluation when
// one exists (the most current signal), falling back to priority for
// projects that haven't been evaluated yet. Archived projects always read
// as muted, matching the existing opacity dimming.
function cardAccentTier(project, evaluation) {
  if (project.status === 'Archived') return 'muted'
  if (evaluation) {
    if (evaluation.health_status === 'off_track') return 'red'
    if (evaluation.health_status === 'at_risk') return 'amber'
    return 'purple'
  }
  return ELEVATED_PRIORITIES.includes(project.priority) ? 'amber' : 'purple'
}

function ProjectList({ projects, loading, emptyMessage, onHide }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  // Keyed by project_id -> latest project_evaluations row (health_status,
  // metrics, created_at only - just enough for the card badge). Never a
  // live recomputation, always whatever the most recent Evaluate Project
  // run actually persisted. Read-only status display - triggering a new
  // evaluation lives only on the project detail page now, not here (the
  // list/dashboard is status display only, no action buttons).
  const [evaluationsByProject, setEvaluationsByProject] = useState({})

  // Dashboard/AllProjects both derive `projects` via filter()/sort() on
  // every render, which is a new array reference each time even when the
  // underlying ids haven't changed - depending on that reference directly
  // would re-fetch on every unrelated re-render, so key off the actual ids.
  const projectIdsKey = projects.map((p) => p.id).join(',')

  useEffect(() => {
    async function loadLatestEvaluations() {
      const ids = projects.map((p) => p.id)
      if (ids.length === 0) return

      const { data, error } = await supabase
        .from('project_evaluations')
        .select('project_id, health_status, metrics, created_at')
        .in('project_id', ids)
        .order('created_at', { ascending: false })

      if (error) return

      // Ordered newest-first, so the first row seen per project_id is its
      // latest evaluation.
      const latestByProject = {}
      ;(data || []).forEach((row) => {
        if (!latestByProject[row.project_id]) latestByProject[row.project_id] = row
      })
      setEvaluationsByProject(latestByProject)
    }

    loadLatestEvaluations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIdsKey])

  return (
    <ul className="project-list">
      {loading && <li className="empty">Loading...</li>}
      {!loading &&
        projects.map((project) => {
          const evaluation = evaluationsByProject[project.id]
          const isArchived = project.status === 'Archived'
          const accentTier = cardAccentTier(project, evaluation)

          let statusLabel = 'Not evaluated'
          let statusColorClass = 'pending'
          if (isArchived) {
            statusLabel = 'Archived'
            statusColorClass = 'archived'
          } else if (evaluation) {
            statusLabel = HEALTH_LABELS[evaluation.health_status] || evaluation.health_status
            statusColorClass = HEALTH_COLOR_CLASS[evaluation.health_status] || 'pending'
          }

          return (
            <li
              key={project.id}
              className={`clickable accent-${accentTier} ${isArchived ? 'archived' : ''}`}
              onClick={() => navigate(`/projects/${project.id}`)}
            >
              {onHide && project.owner_id !== user.id && (
                <button
                  type="button"
                  className="project-card-hide"
                  title="Hide from my list"
                  aria-label={`Hide ${project.name} from my list`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onHide(project.id)
                  }}
                >
                  ✕
                </button>
              )}
              <div className="project-card-top">
                <span className="project-card-title">{project.name}</span>
                <div className="project-card-badges">
                  <span className="methodology-badge">
                    {METHODOLOGY_LABELS[project.methodology] ?? project.methodology}
                  </span>
                  {project.is_demo && <span className="demo-badge">✦ Demo</span>}
                </div>
              </div>
              <div className="project-card-desc">{project.goal}</div>
              <div className="project-card-bottom">
                <span className={`doc-status-badge ${statusColorClass}`}>{statusLabel}</span>
                <span className="project-card-deadline">{project.deadline ?? 'TBD'}</span>
              </div>
            </li>
          )
        })}
      {!loading && projects.length === 0 && (
        <li className="empty">{emptyMessage || 'No projects yet'}</li>
      )}
    </ul>
  )
}

export default ProjectList
