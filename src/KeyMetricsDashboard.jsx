import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'
import { HEALTH_LABELS, HEALTH_COLOR_CLASS, formatEvalMetric } from './projectEvalHealth'

function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// Same overdue definition as supabase/functions/project-eval/index.ts's
// phaseStats(): end date has passed while at least one Waterfall task
// linked to this phase (via tasks.phase_id) is still incomplete. Can't
// literally import that function - it runs as a Deno Edge Function
// deployed separately from this Vite build (see CLAUDE.md) - so this
// mirrors just the `overdue` condition, not the full stats object.
function isPhaseOverdue(phase, waterfallTasks, todayStr) {
  if (!phase.effective_end_date || todayStr <= phase.effective_end_date) return false
  const linked = waterfallTasks.filter((t) => t.phase_id === phase.id)
  return linked.some((t) => !t.completed)
}

// Everything here is recomputed from already-loaded props on every render -
// unlike the Project Status card below, this is a live view, not tied to
// whenever Evaluate Project was last run.
function useCriticalIssues(project, tasks, phases, riskLog) {
  return useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    const issues = []

    // Delayed tasks - Waterfall-side only (backlog_status == null). Backlog
    // items are driven by backlog_status/board_status instead (see
    // BacklogView.jsx/SprintBoardView.jsx) and never get `status` set
    // through those views, so they'd never legitimately read 'delayed' -
    // same waterfallTasks scoping project-eval/index.ts's taskStats() uses.
    tasks
      .filter((t) => t.backlog_status == null && t.status === 'delayed')
      .forEach((t) => issues.push({ key: `task-${t.id}`, type: 'Delayed Task', label: t.title }))

    // High-impact risks - mirrors project-eval/index.ts's riskStats()
    // filter (`r.impact === 'High'`).
    ;(riskLog?.risks || [])
      .filter((r) => r.impact === 'High')
      .forEach((r, i) => issues.push({ key: `risk-${r.id ?? i}`, type: 'High Risk', label: r.risk || `Risk ${i + 1}` }))

    // Overdue phases - Waterfall/Hybrid only, matching visibleSides() in
    // ProjectDetail.jsx (phases are hidden entirely for pure Agile).
    if (project.methodology !== 'agile') {
      const waterfallTasks = tasks.filter((t) => t.backlog_status == null)
      phases
        .filter((p) => isPhaseOverdue(p, waterfallTasks, todayStr))
        .forEach((p) => issues.push({ key: `phase-${p.id}`, type: 'Overdue Phase', label: p.phase_name }))
    }

    return issues
  }, [project.methodology, tasks, phases, riskLog])
}

const ISSUE_TAG_CLASS = {
  'Delayed Task': 'issue-tag-task',
  'High Risk': 'issue-tag-risk',
  'Overdue Phase': 'issue-tag-phase',
}

function ProjectStatusCard({ project }) {
  const [evaluation, setEvaluation] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadLatestEvaluation() {
      setLoading(true)
      // Same query ProjectList.jsx uses for its dashboard badges - latest
      // project_evaluations row for this project, newest first, capped to 1.
      const { data, error } = await supabase
        .from('project_evaluations')
        .select('health_status, metrics, created_at')
        .eq('project_id', project.id)
        .order('created_at', { ascending: false })
        .limit(1)

      if (cancelled) return
      setEvaluation(!error && data && data.length > 0 ? data[0] : null)
      setLoading(false)
    }

    loadLatestEvaluation()
    return () => {
      cancelled = true
    }
  }, [project.id])

  if (loading) {
    return <p className="charter-status">Loading...</p>
  }

  if (!evaluation) {
    return (
      <p className="charter-status">
        Not evaluated yet — run Evaluate Project (under Documents) to see status and progress here.
      </p>
    )
  }

  const colorClass = HEALTH_COLOR_CLASS[evaluation.health_status] || 'pending'
  const metricText = formatEvalMetric(evaluation.metrics, { longer: true })

  return (
    <div className="project-eval-card key-metrics-status-card">
      <div className="project-eval-card-header">
        <span className={`doc-status-badge ${colorClass} project-eval-health-badge`}>
          {HEALTH_LABELS[evaluation.health_status] || evaluation.health_status}
        </span>
        {metricText && (
          <span className={`doc-status-badge ${colorClass} project-eval-metric-badge`}>{metricText}</span>
        )}
      </div>
      <p className="key-metrics-as-of">As of {formatDateTime(evaluation.created_at)}</p>
    </div>
  )
}

function CriticalIssuesCard({ issues }) {
  if (issues.length === 0) {
    return <p className="charter-status">No critical issues right now.</p>
  }

  return (
    <ul className="critical-issues-list">
      {issues.map((issue) => (
        <li key={issue.key}>
          <span className={`issue-tag ${ISSUE_TAG_CLASS[issue.type] || ''}`}>{issue.type}</span>
          <span className="critical-issue-label">{issue.label}</span>
        </li>
      ))}
    </ul>
  )
}

// New top-level section, same level as Tasks and Milestones / Backlog /
// Sprint Board / Gantt Chart - Project Status + Progress % is a snapshot of
// the latest Evaluate Project run (see ProjectStatusCard); Critical Issues
// is a live recomputation from already-loaded tasks/phases/riskLog props,
// not tied to that snapshot at all.
function KeyMetricsDashboard({ project, tasks, phases, riskLog, expanded }) {
  const issues = useCriticalIssues(project, tasks, phases, riskLog)

  return (
    <div className="detail-zone key-metrics-dashboard">
      <h2 className="tasks-heading section-heading-static">
        <span className="toggle-header-main">Key Metrics Dashboard</span>
        <span className={`doc-status-badge ${issues.length > 0 ? 'critical' : 'done'}`}>
          {issues.length > 0 ? `${issues.length} Critical Issue${issues.length === 1 ? '' : 's'}` : 'All Clear'}
        </span>
      </h2>

      {expanded && (
        <div className="key-metrics-body">
          <div className="key-metrics-panel">
            <h3 className="key-metrics-panel-heading">Project Status</h3>
            <ProjectStatusCard project={project} />
          </div>

          <div className="key-metrics-panel">
            <h3 className="key-metrics-panel-heading">Critical Issues ({issues.length})</h3>
            <CriticalIssuesCard issues={issues} />
          </div>
        </div>
      )}
    </div>
  )
}

export default KeyMetricsDashboard
