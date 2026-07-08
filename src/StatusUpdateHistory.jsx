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

// Read-only dated history for the Status Update log - entries arrive
// most-recent-first (ProjectDetail.jsx loads them ordered that way). There's
// no edit/export affordance here by design: each entry is an immutable,
// timestamped log record, not a document meant to be revised or exported.
function StatusUpdateHistory({ entries }) {
  if (!entries || entries.length === 0) {
    return <p className="charter-status">No status updates logged yet.</p>
  }

  return (
    <ul className="status-update-history">
      {entries.map((entry) => (
        <li key={entry.id} className="status-update-entry">
          <p className="status-update-date">{formatDate(entry.created_at)}</p>
          {FIELDS.map(({ key, label }) =>
            entry[key] ? (
              <div className="status-update-field" key={key}>
                <h4 className="status-update-field-label">{label}</h4>
                <p className="status-update-field-body">{entry[key]}</p>
              </div>
            ) : null
          )}
        </li>
      ))}
    </ul>
  )
}

export default StatusUpdateHistory
