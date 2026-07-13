import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { METHODOLOGY_LABELS } from './methodology'
import { HEALTH_LABELS, HEALTH_COLOR_CLASS, formatEvalMetric } from './projectEvalHealth'

function ProjectList({ projects, loading, emptyMessage }) {
  const navigate = useNavigate()
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
          const colorClass = evaluation ? HEALTH_COLOR_CLASS[evaluation.health_status] || 'pending' : 'pending'
          const metricText = evaluation ? formatEvalMetric(evaluation.metrics) : null

          return (
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
              <div className="project-eval-summary">
                {evaluation ? (
                  <>
                    <span className={`doc-status-badge ${colorClass}`}>
                      {HEALTH_LABELS[evaluation.health_status] || evaluation.health_status}
                    </span>
                    {metricText && (
                      <span className={`doc-status-badge ${colorClass}`}>{metricText}</span>
                    )}
                  </>
                ) : (
                  <span className="doc-status-badge pending">Not evaluated</span>
                )}
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
