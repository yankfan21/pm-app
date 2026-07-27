// Shared phase-overdue check - used by KeyMetricsDashboard.jsx (Project
// Hotspots' Overdue Phase count) and PhaseDetailView.jsx (per-row badge +
// the ?phaseFilter=overdue view). Same definition as
// supabase/functions/project-eval/index.ts's phaseStats(): end date has
// passed while at least one Waterfall task linked to this phase (via
// tasks.phase_id) is still incomplete. Can't literally import that function
// - it runs as a Deno Edge Function deployed separately from this Vite
// build (see CLAUDE.md) - so this mirrors just the `overdue` condition, not
// the full stats object.
export function isPhaseOverdue(phase, waterfallTasks, todayStr) {
  if (!phase.effective_end_date || todayStr <= phase.effective_end_date) return false
  const linked = waterfallTasks.filter((t) => t.phase_id === phase.id)
  return linked.some((t) => !t.completed)
}
