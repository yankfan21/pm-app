// Shared shape/logic for Issues Log, used by IssueLogView.jsx (desktop),
// MobileProjectIssues.jsx, and ProjectSectionRoutes.jsx's
// ExecutionIssueLogRoute - previously each had its own inline
// newRow()/newIssueObject()/newIssueLogRow() that had to be kept in sync by
// hand. Status Notes is append-only (status_notes: [{note, created_at}],
// newest first) with last_update auto-stamped on append - no manually
// picked date, matching the Resolution/Date -> Status Notes/Last Update
// rework.

// Combined "Open" bucket for the Key Metrics Dashboard / Project Hotspots
// issue count card (KeyMetricsDashboard.jsx, mobile/MobileProjectMetrics.jsx)
// - Open/In Progress/Blocked all read as "still open" there; only Closed is
// closed.
export const OPEN_ISSUE_STATUSES = ['Open', 'In Progress', 'Blocked']

export function getIssueStatusCounts(issues) {
  const list = issues || []
  const open = list.filter((i) => OPEN_ISSUE_STATUSES.includes(i.status)).length
  const closed = list.filter((i) => i.status === 'Closed').length
  return { open, closed }
}

export function createIssueObject(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    description: '',
    priority: 'Medium',
    owner: '',
    status: 'Open',
    status_notes: [],
    last_update: null,
    ...overrides,
  }
}

export function appendStatusNote(issue, noteText) {
  const trimmed = (noteText || '').trim()
  if (!trimmed) return issue

  const now = new Date().toISOString()
  return {
    ...issue,
    status_notes: [{ note: trimmed, created_at: now }, ...(issue.status_notes || [])],
    last_update: now,
  }
}

const PRIORITY_ORDER = { High: 0, Medium: 1, Low: 2 }

// Priority High -> Low; Closed issues always pushed to the bottom, sorted by
// last_update within that Closed group (most recently updated first - same
// "newest on top" convention as the Status Notes list itself).
export function sortIssues(issues) {
  return [...issues].sort((a, b) => {
    const aClosed = a.status === 'Closed'
    const bClosed = b.status === 'Closed'

    if (aClosed !== bClosed) return aClosed ? 1 : -1

    if (aClosed && bClosed) {
      return new Date(b.last_update || 0) - new Date(a.last_update || 0)
    }

    return (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1)
  })
}
