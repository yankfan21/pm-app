import { useEffect, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'

// Quick risk flag (/m/projects/:projectId/more/risks). Minimal subset of
// desktop's full Risk Log entry (RiskLogView.jsx, via Evaluate Project) -
// description + severity + optional task link only, no mitigation/owner/
// status. Writes into the same risk_logs.risks jsonb array desktop reads,
// using likelihood/impact literal values ('Low'/'Medium'/'High', see
// RiskLogView.jsx's LEVELS) so desktop's Critical Issues check
// (r.impact === 'High') and its row rendering (row.likelihood.toLowerCase())
// both keep working on rows created here. task_id is a new key desktop
// doesn't read yet - harmless, jsonb ignores unknown keys.
const SEVERITIES = ['Low', 'Medium', 'High']

const SEVERITY_BADGE_CLASS = {
  Low: 'pending',
  Medium: 'partial',
  High: 'critical',
}

function newRiskObject(description, severity, taskId) {
  return {
    id: crypto.randomUUID(),
    risk: description,
    likelihood: severity,
    impact: severity,
    mitigation: '',
    owner: '',
    task_id: taskId || null,
  }
}

function MobileProjectRisks() {
  const { canEdit } = useOutletContext()
  const { projectId } = useParams()

  const [riskLog, setRiskLog] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState('Medium')
  const [taskId, setTaskId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const [riskLogRes, tasksRes] = await Promise.all([
        supabase.from('risk_logs').select('*').eq('project_id', projectId).maybeSingle(),
        supabase.from('tasks').select('id, title').eq('project_id', projectId).order('created_at', { ascending: true }),
      ])

      if (cancelled) return

      const firstError = riskLogRes.error || tasksRes.error
      if (firstError) {
        setError(firstError.message)
        setLoading(false)
        return
      }

      setRiskLog(riskLogRes.data)
      setTasks(tasksRes.data || [])
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [projectId])

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = description.trim()
    if (!trimmed || submitting) return

    setSubmitting(true)
    setError(null)

    const oneRisk = newRiskObject(trimmed, severity, taskId)

    const result = riskLog
      ? await supabase
          .from('risk_logs')
          .update({ risks: [...(riskLog.risks || []), oneRisk], updated_at: new Date().toISOString() })
          .eq('id', riskLog.id)
          .select()
          .single()
      : await supabase
          .from('risk_logs')
          .insert({ project_id: projectId, risks: [oneRisk] })
          .select()
          .single()

    setSubmitting(false)

    if (result.error) {
      setError(result.error.message)
      return
    }

    setRiskLog(result.data)
    setDescription('')
    setSeverity('Medium')
    setTaskId('')
  }

  if (loading) {
    return (
      <div>
        <h1 className="mobile-screen-title">Flag a Risk</h1>
        <p className="mobile-screen-stub">Loading...</p>
      </div>
    )
  }

  const risks = riskLog?.risks || []
  const taskTitleById = new Map(tasks.map((t) => [t.id, t.title]))

  return (
    <div>
      <h1 className="mobile-screen-title">Flag a Risk</h1>

      {error && <p className="mobile-error">{error}</p>}

      {canEdit ? (
        <form className="mobile-risk-form" onSubmit={handleSubmit}>
          <label className="mobile-select-field">
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              required
            />
          </label>

          <label className="mobile-select-field">
            Severity
            <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="mobile-select-field">
            Related task (optional)
            <select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
              <option value="">None</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>

          <button type="submit" disabled={submitting || !description.trim()}>
            {submitting ? 'Flagging...' : 'Flag Risk'}
          </button>
        </form>
      ) : (
        <p className="mobile-screen-stub">You don't have permission to flag risks on this project.</p>
      )}

      <h2 className="mobile-section-title">Flagged Risks</h2>
      {risks.length === 0 ? (
        <p className="mobile-screen-stub">No risks flagged yet.</p>
      ) : (
        <div className="mobile-doc-card-list">
          {[...risks].reverse().map((r) => (
            <div className="mobile-doc-risk-card" key={r.id}>
              <p className="mobile-doc-section-body">{r.risk}</p>
              <p className="mobile-doc-risk-meta">
                <span className={`mobile-doc-badge ${SEVERITY_BADGE_CLASS[r.impact] || 'pending'}`}>
                  {r.impact}
                </span>
                {r.task_id && taskTitleById.has(r.task_id) ? ` · ${taskTitleById.get(r.task_id)}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default MobileProjectRisks
