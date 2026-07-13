import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { METHODOLOGY_LABELS } from './methodology'
import { HEALTH_LABELS, HEALTH_COLOR_CLASS, formatEvalMetric } from './projectEvalHealth'
import { loadEvalContext } from './evalContext'
import ProjectEvalFlow from './ProjectEvalFlow'

function ProjectList({ projects, loading, emptyMessage }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  // Keyed by project_id -> latest project_evaluations row (health_status,
  // metrics, created_at only - just enough for the card badge). Never a
  // live recomputation, always whatever the most recent Evaluate Project
  // run actually persisted.
  const [evaluationsByProject, setEvaluationsByProject] = useState({})
  const [evaluatingProject, setEvaluatingProject] = useState(null) // { project, context } | null
  const [loadingEvalFor, setLoadingEvalFor] = useState(null)
  const [evalLoadError, setEvalLoadError] = useState(null)

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

  async function handleEvaluateNow(e, project) {
    e.stopPropagation()
    // Belt-and-suspenders alongside the button's own disabled state below -
    // each click here is a real LLM call with no rate limit, so this stays
    // gated even if something ever calls this handler outside that button.
    if (!user) return

    setEvalLoadError(null)
    setLoadingEvalFor(project.id)

    try {
      const context = await loadEvalContext(project.id)
      setEvaluatingProject({ project, context })
    } catch (err) {
      setEvalLoadError(err.message)
    } finally {
      setLoadingEvalFor(null)
    }
  }

  async function handleEvalGenerated(result) {
    const { data, error } = await supabase
      .from('project_evaluations')
      .insert({
        project_id: evaluatingProject.project.id,
        health_status: result.health_status,
        rationale: result.rationale,
        recommendations: result.recommendations,
        metrics: result.metrics,
      })
      .select()
      .single()

    if (error) return error.message

    setEvaluationsByProject((prev) => ({ ...prev, [data.project_id]: data }))
    setEvaluatingProject(null)
    return null
  }

  return (
    <>
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
                    <>
                      <span className="doc-status-badge pending">Not evaluated</span>
                      <button
                        type="button"
                        className="btn-secondary project-eval-now-btn"
                        disabled={!user || loadingEvalFor === project.id}
                        title={!user ? 'Sign in to run an evaluation' : undefined}
                        onClick={(e) => handleEvaluateNow(e, project)}
                      >
                        {loadingEvalFor === project.id ? 'Loading...' : 'Evaluate now'}
                      </button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        {!loading && projects.length === 0 && (
          <li className="empty">{emptyMessage || 'No projects yet'}</li>
        )}
      </ul>

      {evalLoadError && <p className="error">{evalLoadError}</p>}

      {evaluatingProject && (
        <div className="modal-overlay">
          <div className="modal">
            <ProjectEvalFlow
              project={evaluatingProject.project}
              charter={evaluatingProject.context.charter}
              riskLog={evaluatingProject.context.riskLog}
              budget={evaluatingProject.context.budget}
              tasks={evaluatingProject.context.tasks}
              statusUpdates={evaluatingProject.context.statusUpdates}
              sprints={evaluatingProject.context.sprints}
              retros={evaluatingProject.context.retros}
              milestones={evaluatingProject.context.milestones}
              onGenerated={handleEvalGenerated}
              onClose={() => setEvaluatingProject(null)}
            />
          </div>
        </div>
      )}
    </>
  )
}

export default ProjectList
