import { useEffect, useRef, useState } from 'react'
import { useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { getRiskBand } from '../riskScale'

// Quick risk flag (/m/projects/:projectId/more/risks). Minimal subset of
// desktop's full Risk Log entry (RiskLogView.jsx, via Evaluate Project) -
// description + optional task link only, no likelihood/severity scoring,
// mitigation, or owner. Writes into the same risk_logs.risks jsonb array
// desktop reads, but with likelihood/severity left null (unscored) - the PM
// scores it on next desktop visit via RiskLogView.jsx's "Needs scoring"
// prompt, rather than mobile guessing a value. task_id is a key desktop
// doesn't read yet - harmless, jsonb ignores unknown keys.
const BAND_BADGE_CLASS = {
  Critical: 'severe',
  High: 'critical',
  Medium: 'partial',
  Low: 'done',
}

function newRiskObject(description, taskId) {
  return {
    id: crypto.randomUUID(),
    risk: description,
    likelihood: null,
    severity: null,
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
  const [taskId, setTaskId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [searchParams, setSearchParams] = useSearchParams()
  const highlightRiskId = searchParams.get('riskId')
  const [flashRiskId, setFlashRiskId] = useState(null)
  const rowRefs = useRef({})

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

  // Arrival from a Project Hotspots row (MobileProjectMetrics.jsx's
  // hotspotLinkTo) - scroll the target risk's card into view and flash it,
  // same shape as desktop's RiskLogView highlightRiskId handling, adapted
  // to this screen's flat card list (no severity filter to re-sync here).
  useEffect(() => {
    if (!highlightRiskId || loading) return
    setFlashRiskId(highlightRiskId)
    rowRefs.current[highlightRiskId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const timer = setTimeout(() => {
      setFlashRiskId(null)
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('riskId')
          return next
        },
        { replace: true }
      )
    }, 2000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightRiskId, loading])

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = description.trim()
    if (!trimmed || submitting) return

    setSubmitting(true)
    setError(null)

    const oneRisk = newRiskObject(trimmed, taskId)

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
          {[...risks].reverse().map((r) => {
            const band = getRiskBand(r.likelihood, r.severity)
            return (
              <div
                className={`mobile-doc-risk-card ${flashRiskId === r.id ? 'mobile-hotspot-highlight' : ''}`}
                key={r.id}
                ref={(el) => {
                  rowRefs.current[r.id] = el
                }}
              >
                <p className="mobile-doc-section-body">{r.risk}</p>
                <p className="mobile-doc-risk-meta">
                  <span className={`mobile-doc-badge ${band ? BAND_BADGE_CLASS[band] : 'pending'}`}>
                    {band || 'Needs scoring'}
                  </span>
                  {r.task_id && taskTitleById.has(r.task_id) ? ` · ${taskTitleById.get(r.task_id)}` : ''}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default MobileProjectRisks
