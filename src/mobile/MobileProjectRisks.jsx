import { useEffect, useRef, useState } from 'react'
import { useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { getRiskBand } from '../riskScale'

// Quick risk flag (/m/projects/:projectId/more/risks). Minimal subset of
// desktop's full Risk Log entry (RiskLogView.jsx, via Evaluate Project) -
// description only, no title split, no likelihood/severity scoring,
// mitigation, contingency, or owner. Writes straight into the real `risks`
// table now (see risk_log_structured_schema.sql) - the description text
// becomes the row's required `title` (mobile has nothing to split it into,
// so it isn't split), `description` stays null. Same reasoning as before
// for leaving likelihood/severity null: the PM scores it on next desktop
// visit via RiskLogView.jsx's "Needs scoring" prompt, rather than mobile
// guessing a value.
const BAND_BADGE_CLASS = {
  Critical: 'severe',
  High: 'critical',
  Medium: 'partial',
  Low: 'done',
}

function MobileProjectRisks() {
  const { canEdit } = useOutletContext()
  const { projectId } = useParams()

  const [riskLogId, setRiskLogId] = useState(null)
  const [risks, setRisks] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [description, setDescription] = useState('')
  const [taskId, setTaskId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [searchParams, setSearchParams] = useSearchParams()
  const explicitRiskId = searchParams.get('riskId')
  const riskFilterBand = searchParams.get('riskFilter')
  const [flashRiskId, setFlashRiskId] = useState(null)
  const rowRefs = useRef({})

  // Same order the list itself renders in ([...risks].reverse(), newest
  // first) - "first match" for a ?riskFilter= band means the first one the
  // PM would actually see scrolling down, not first-inserted.
  const displayRisks = [...risks].reverse()
  const firstBandMatch = riskFilterBand
    ? displayRisks.find((r) => getRiskBand(r.likelihood, r.severity) === riskFilterBand)
    : null
  // ?riskId= (Project Hotspots' old single-item link, still used
  // elsewhere) wins if somehow both are present - riskId names one exact
  // risk, riskFilter only narrows down to "first of this band".
  const targetRiskId = explicitRiskId || firstBandMatch?.id || null
  const targetParamKey = explicitRiskId ? 'riskId' : riskFilterBand ? 'riskFilter' : null

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const [riskLogRes, tasksRes] = await Promise.all([
        supabase.from('risk_logs').select('id').eq('project_id', projectId).maybeSingle(),
        supabase.from('tasks').select('id, title').eq('project_id', projectId).order('created_at', { ascending: true }),
      ])

      if (cancelled) return

      const firstError = riskLogRes.error || tasksRes.error
      if (firstError) {
        setError(firstError.message)
        setLoading(false)
        return
      }

      setTasks(tasksRes.data || [])

      if (!riskLogRes.data) {
        setRiskLogId(null)
        setRisks([])
        setLoading(false)
        return
      }

      setRiskLogId(riskLogRes.data.id)

      const { data: risksData, error: risksError } = await supabase
        .from('risks')
        .select('*')
        .eq('risk_log_id', riskLogRes.data.id)
        .order('created_at', { ascending: true })

      if (cancelled) return

      if (risksError) {
        setError(risksError.message)
        setLoading(false)
        return
      }

      setRisks(risksData || [])
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [projectId])

  // Arrival from a Project Hotspots row/badge (MobileProjectMetrics.jsx's
  // hotspotLinkTo, or a Risks severity badge) - scroll the target risk's
  // card into view and flash it, same shape as desktop's RiskLogView
  // highlightRiskId handling, adapted to this screen's flat card list (no
  // persistent severity filter to re-sync here - riskFilter only resolves
  // to a one-time scroll target, see targetRiskId above).
  useEffect(() => {
    if (!targetRiskId || loading) return
    setFlashRiskId(targetRiskId)
    rowRefs.current[targetRiskId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const timer = setTimeout(() => {
      setFlashRiskId(null)
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (targetParamKey) next.delete(targetParamKey)
          return next
        },
        { replace: true }
      )
    }, 2000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetRiskId, loading])

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = description.trim()
    if (!trimmed || submitting) return

    setSubmitting(true)
    setError(null)

    let currentRiskLogId = riskLogId
    if (!currentRiskLogId) {
      const { data, error } = await supabase
        .from('risk_logs')
        .insert({ project_id: projectId })
        .select()
        .single()

      if (error) {
        setError(error.message)
        setSubmitting(false)
        return
      }
      currentRiskLogId = data.id
    }

    const { data, error } = await supabase
      .from('risks')
      .insert({ risk_log_id: currentRiskLogId, title: trimmed, task_id: taskId || null })
      .select()
      .single()

    setSubmitting(false)

    if (error) {
      setError(error.message)
      return
    }

    setRiskLogId(currentRiskLogId)
    setRisks((prev) => [...prev, data])
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
      {displayRisks.length === 0 ? (
        <p className="mobile-screen-stub">No risks flagged yet.</p>
      ) : (
        <div className="mobile-doc-card-list">
          {displayRisks.map((r) => {
            const band = getRiskBand(r.likelihood, r.severity)
            return (
              <div
                className={`mobile-doc-risk-card ${flashRiskId === r.id ? 'mobile-hotspot-highlight' : ''}`}
                key={r.id}
                ref={(el) => {
                  rowRefs.current[r.id] = el
                }}
              >
                <p className="mobile-doc-section-body">{r.title}</p>
                {r.description && <p className="mobile-doc-section-body">{r.description}</p>}
                <p className="mobile-doc-risk-meta">
                  <span className={`mobile-doc-badge ${band ? BAND_BADGE_CLASS[band] : 'pending'}`}>
                    {band || 'Needs scoring'}
                  </span>
                  {r.task_id && taskTitleById.has(r.task_id) ? ` · ${taskTitleById.get(r.task_id)}` : ''}
                </p>
                {(r.contingency_trigger || r.contingency_plan) && (
                  <p className="mobile-doc-section-body">
                    {r.contingency_trigger && <>If: {r.contingency_trigger}<br /></>}
                    {r.contingency_plan && <>Then: {r.contingency_plan}</>}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default MobileProjectRisks
