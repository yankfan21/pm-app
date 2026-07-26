import { useEffect, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'

// Quick issue log (/m/projects/:projectId/more/issues). Mirrors
// MobileProjectRisks.jsx's exact pattern (quick-log form + list view) but
// against issue_logs instead of risk_logs, matching IssueLogView.jsx's
// field shape (description/priority/owner/status/resolution/
// resolution_date) rather than copying Risk's shape verbatim. Status
// defaults to 'Open' and resolution/resolution_date start blank - those
// get filled in later via desktop's full Issues Log table
// (IssueLogView.jsx), same as owner/mitigation on the Risks quick form.
const PRIORITIES = ['Low', 'Medium', 'High']

const PRIORITY_BADGE_CLASS = {
  Low: 'pending',
  Medium: 'partial',
  High: 'critical',
}

function newIssueObject(description, priority, owner) {
  return {
    id: crypto.randomUUID(),
    description,
    priority,
    owner: owner || '',
    status: 'Open',
    resolution: '',
    resolution_date: '',
  }
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function MobileProjectIssues() {
  const { canEdit } = useOutletContext()
  const { projectId } = useParams()

  const [issueLog, setIssueLog] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('Medium')
  const [owner, setOwner] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const { data, error } = await supabase
        .from('issue_logs')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle()

      if (cancelled) return

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      setIssueLog(data)
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

    const oneIssue = newIssueObject(trimmed, priority, owner.trim())

    const result = issueLog
      ? await supabase
          .from('issue_logs')
          .update({ issues: [...(issueLog.issues || []), oneIssue], updated_at: new Date().toISOString() })
          .eq('id', issueLog.id)
          .select()
          .single()
      : await supabase
          .from('issue_logs')
          .insert({ project_id: projectId, issues: [oneIssue] })
          .select()
          .single()

    setSubmitting(false)

    if (result.error) {
      setError(result.error.message)
      return
    }

    setIssueLog(result.data)
    setDescription('')
    setPriority('Medium')
    setOwner('')
  }

  if (loading) {
    return (
      <div>
        <h1 className="mobile-screen-title">Log an Issue</h1>
        <p className="mobile-screen-stub">Loading...</p>
      </div>
    )
  }

  const issues = issueLog?.issues || []

  return (
    <div>
      <h1 className="mobile-screen-title">Log an Issue</h1>

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
            Priority
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label className="mobile-select-field">
            Owner (optional)
            <input type="text" value={owner} onChange={(e) => setOwner(e.target.value)} />
          </label>

          <button type="submit" disabled={submitting || !description.trim()}>
            {submitting ? 'Logging...' : 'Log Issue'}
          </button>
        </form>
      ) : (
        <p className="mobile-screen-stub">You don't have permission to log issues on this project.</p>
      )}

      <h2 className="mobile-section-title">Logged Issues</h2>
      {issues.length === 0 ? (
        <p className="mobile-screen-stub">No issues logged yet.</p>
      ) : (
        <div className="mobile-doc-card-list">
          {[...issues].reverse().map((issue) => (
            <div className="mobile-doc-risk-card" key={issue.id}>
              <p className="mobile-doc-section-body">{issue.description}</p>
              <p className="mobile-doc-risk-meta">
                <span className={`mobile-doc-badge ${PRIORITY_BADGE_CLASS[issue.priority] || 'pending'}`}>
                  {issue.priority}
                </span>
                {` · ${issue.status}`}
                {issue.owner ? ` · ${issue.owner}` : ''}
              </p>
              {issue.resolution && <p className="mobile-doc-section-body">{issue.resolution}</p>}
              {issue.resolution_date && (
                <p className="mobile-doc-risk-meta">Resolved: {formatDate(issue.resolution_date)}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default MobileProjectIssues
