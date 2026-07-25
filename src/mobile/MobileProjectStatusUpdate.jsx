import { useEffect, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'

// Status Update log (/m/projects/:projectId/more/status-update). Mirrors
// desktop's StatusUpdateFlow.jsx (3 free-text fields, all optional) and
// StatusUpdateHistory.jsx (dated log, most-recent-first) but as one
// purpose-built mobile component - does not import either desktop file.
// Log + view only: no edit/delete here, matching desktop's own
// immutable-entry convention (delete stays a desktop-only capability).

const FIELDS = [
  { key: 'what_got_done', label: 'What got done' },
  { key: 'whats_blocked', label: "What's blocked" },
  { key: 'whats_coming_up', label: "What's coming up" },
]

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function StatusUpdateCard({ entry }) {
  const isBlank = FIELDS.every(({ key }) => !entry[key])

  return (
    <div className="mobile-doc-risk-card">
      <p className="mobile-doc-risk-meta">{formatDate(entry.created_at)}</p>
      {isBlank ? (
        <p className="mobile-doc-section-body">(No update entered)</p>
      ) : (
        FIELDS.map(({ key, label }) =>
          entry[key] ? (
            <div className="mobile-doc-section" key={key}>
              <h4 className="mobile-doc-section-heading">{label}</h4>
              <p className="mobile-doc-section-body">{entry[key]}</p>
            </div>
          ) : null
        )
      )}
    </div>
  )
}

function MobileProjectStatusUpdate() {
  const { canEdit } = useOutletContext()
  const { projectId } = useParams()

  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [whatGotDone, setWhatGotDone] = useState('')
  const [whatsBlocked, setWhatsBlocked] = useState('')
  const [whatsComingUp, setWhatsComingUp] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const { data, error } = await supabase
        .from('status_updates')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })

      if (cancelled) return

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      setEntries(data || [])
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [projectId])

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setError(null)

    const { data, error } = await supabase
      .from('status_updates')
      .insert({
        project_id: projectId,
        what_got_done: whatGotDone.trim() || null,
        whats_blocked: whatsBlocked.trim() || null,
        whats_coming_up: whatsComingUp.trim() || null,
      })
      .select()
      .single()

    setSubmitting(false)

    if (error) {
      setError(error.message)
      return
    }

    setEntries((prev) => [data, ...prev])
    setWhatGotDone('')
    setWhatsBlocked('')
    setWhatsComingUp('')
  }

  if (loading) {
    return (
      <div>
        <h1 className="mobile-screen-title">Status Update</h1>
        <p className="mobile-screen-stub">Loading...</p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="mobile-screen-title">Status Update</h1>

      {error && <p className="mobile-error">{error}</p>}

      {canEdit ? (
        <form className="mobile-status-form" onSubmit={handleSubmit}>
          <label className="mobile-select-field">
            What got done
            <textarea
              value={whatGotDone}
              onChange={(e) => setWhatGotDone(e.target.value)}
              rows={3}
              placeholder="What got done this week..."
            />
          </label>

          <label className="mobile-select-field">
            What's blocked
            <textarea
              value={whatsBlocked}
              onChange={(e) => setWhatsBlocked(e.target.value)}
              rows={3}
              placeholder="Anything blocked or stuck..."
            />
          </label>

          <label className="mobile-select-field">
            What's coming up
            <textarea
              value={whatsComingUp}
              onChange={(e) => setWhatsComingUp(e.target.value)}
              rows={3}
              placeholder="What's coming up next..."
            />
          </label>

          <button type="submit" disabled={submitting}>
            {submitting ? 'Saving...' : 'Log Status Update'}
          </button>
        </form>
      ) : (
        <p className="mobile-screen-stub">You don't have permission to log status updates on this project.</p>
      )}

      <h2 className="mobile-section-title">Past Updates</h2>
      {entries.length === 0 ? (
        <p className="mobile-screen-stub">No status updates logged yet.</p>
      ) : (
        <div className="mobile-doc-card-list">
          {entries.map((entry) => (
            <StatusUpdateCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  )
}

export default MobileProjectStatusUpdate
