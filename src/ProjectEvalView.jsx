import { useState } from 'react'
import { exportProjectEvalDocx, exportProjectEvalPdf } from './projectEvalExport'
import { HEALTH_LABELS, HEALTH_COLOR_CLASS, formatEvalMetric } from './projectEvalHealth'

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function EvalCard({ project, evaluation, exportable }) {
  const colorClass = HEALTH_COLOR_CLASS[evaluation.health_status] || 'pending'
  const metricText = formatEvalMetric(evaluation.metrics, { longer: true })

  return (
    <div className="project-eval-card">
      <div className="project-eval-card-header">
        <span className={`doc-status-badge ${colorClass} project-eval-health-badge`}>
          {HEALTH_LABELS[evaluation.health_status] || evaluation.health_status}
        </span>
        {metricText && (
          <span className={`doc-status-badge ${colorClass} project-eval-metric-badge`}>
            {metricText}
          </span>
        )}
        <span
          className="project-eval-legend"
          title="Badge color reflects overall health: green = On Track, yellow = At Risk, red = Off Track."
          aria-label="What do these colors mean?"
        >
          &#9432;
        </span>
        <span className="project-eval-date">{formatDate(evaluation.created_at)}</span>
      </div>

      <p className="project-eval-rationale">{evaluation.rationale}</p>

      {(evaluation.recommendations || []).length > 0 && (
        <>
          <h4 className="project-eval-recs-heading">Recommended Actions</h4>
          <ul className="project-eval-recs-list">
            {evaluation.recommendations.map((rec, i) => (
              <li key={i}>{rec}</li>
            ))}
          </ul>
        </>
      )}

      {exportable && (
        <div className="charter-actions project-eval-export-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => exportProjectEvalPdf(project, evaluation)}
          >
            Export PDF
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => exportProjectEvalDocx(project, evaluation)}
          >
            Export Word
          </button>
        </div>
      )}
    </div>
  )
}

// Evaluate Project is read-only - there's no onUpdate/edit path here, unlike
// every other doc type's View. The latest evaluation renders prominently;
// older ones sit in a collapsed History list (same pattern as CommsView's
// version history), each view-only and not exportable, so only the current
// snapshot is ever shared - export is inherently "current state", and an
// old evaluation being re-exported later would misrepresent the project as
// of today.
function ProjectEvalView({ project, evaluations }) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const [latest, ...older] = evaluations || []

  if (!latest) {
    return <p className="charter-status">No evaluations yet.</p>
  }

  return (
    <div className="charter">
      <div className="section-header">
        <h3 className="charter-heading">Project Evaluation</h3>
      </div>

      <EvalCard project={project} evaluation={latest} exportable />

      {older.length > 0 && (
        <div className="version-history">
          <button
            type="button"
            className="collapsible-toggle"
            onClick={() => setHistoryOpen((prev) => !prev)}
            aria-expanded={historyOpen}
          >
            <span className={`chevron ${historyOpen ? '' : 'collapsed'}`} aria-hidden="true">
              ▾
            </span>
            History
          </button>

          {historyOpen && (
            <div className="version-history-list">
              {older.map((evaluation) => (
                <EvalCard key={evaluation.id} project={project} evaluation={evaluation} exportable={false} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ProjectEvalView
