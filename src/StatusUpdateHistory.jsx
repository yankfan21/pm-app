import { supabase } from './supabaseClient'

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

function isBlank(entry) {
  return FIELDS.every(({ key }) => !entry[key])
}

// Read-only dated history for the Status Update log - entries arrive
// most-recent-first (ProjectDetail.jsx loads them ordered that way). There's
// no edit/export affordance here by design: each entry is an immutable,
// timestamped log record, not a document meant to be revised or exported.
// Delete is the one exception - it's a removal, not a revision, so it
// doesn't conflict with that immutability.
function StatusUpdateHistory({ entries, canEdit, onUpdate }) {
  if (!entries || entries.length === 0) {
    return <p className="charter-status">No status updates logged yet.</p>
  }

  async function handleDelete(entry) {
    const confirmed = window.confirm(
      'Delete this status update? This cannot be undone.'
    )
    if (!confirmed) return

    const { data, error } = await supabase
      .from('status_updates')
      .delete()
      .eq('id', entry.id)
      .select()

    if (error) {
      window.alert(error.message)
      return
    }

    // RLS blocking a delete looks identical to a successful one at the
    // error level - a blocked delete matches zero rows and still comes
    // back with error: null. Chaining .select() gets the deleted row(s)
    // back, so an empty result here means nothing was actually removed.
    if (!data || data.length === 0) {
      window.alert('Delete failed — you may not have permission to delete this entry.')
      return
    }

    onUpdate(entries.filter((e) => e.id !== entry.id))
  }

  return (
    <ul className="status-update-history">
      {entries.map((entry) => (
        <li key={entry.id} className="status-update-entry">
          <div className="status-update-entry-header">
            <p className="status-update-date">{formatDate(entry.created_at)}</p>
            {canEdit && (
              <button
                type="button"
                className="status-update-delete"
                onClick={() => handleDelete(entry)}
              >
                Delete
              </button>
            )}
          </div>
          {isBlank(entry) ? (
            <p className="status-update-field-body status-update-blank">(No update entered)</p>
          ) : (
            FIELDS.map(({ key, label }) =>
              entry[key] ? (
                <div className="status-update-field" key={key}>
                  <h4 className="status-update-field-label">{label}</h4>
                  <p className="status-update-field-body">{entry[key]}</p>
                </div>
              ) : null
            )
          )}
        </li>
      ))}
    </ul>
  )
}

export default StatusUpdateHistory
