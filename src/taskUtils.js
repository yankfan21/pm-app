// Shared "is this task Delayed" check - single source of truth for both
// KeyMetricsDashboard.jsx's Project Hotspots badge count and
// PlanningTasksRoute.jsx's ?taskFilter=delayed filtered view, so the count
// and the list it links to can never drift apart.

const MS_PER_DAY = 24 * 60 * 60 * 1000
const AUTO_DELAY_THRESHOLD_DAYS = 5

// Eastern-Time "today" as a plain YYYY-MM-DD string, matching how due_date
// is stored (a date with no time/zone of its own). Intl formats straight
// into America/New_York (DST-aware) rather than hand-rolling a UTC offset.
export function getEasternTodayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
}

function daysPastDue(dueDateStr, todayStr) {
  const due = new Date(`${dueDateStr}T00:00:00Z`)
  const today = new Date(`${todayStr}T00:00:00Z`)
  return Math.floor((today - due) / MS_PER_DAY)
}

// Delayed = PM manually flagged it (status === 'delayed', unconditional -
// the PM can flag a task as Delayed at any time regardless of due date),
// OR it's more than 5 days past due and not yet Completed. `status`, not
// the legacy `completed` boolean, is the completion check here - `status`
// is already the field driving the manual-flag arm above, and per
// CLAUDE.md's known follow-up the `completed` boolean is being phased out
// and is no longer kept in sync with `status` by every write path (the
// task-status dropdown only ever writes `status`), so anchoring both arms
// of this OR to the same field is what keeps them from drifting apart.
export function isTaskDelayed(task, todayEasternStr) {
  if (task.status === 'delayed') return true
  if (task.status === 'completed') return false
  if (!task.due_date) return false
  return daysPastDue(task.due_date, todayEasternStr) > AUTO_DELAY_THRESHOLD_DAYS
}
