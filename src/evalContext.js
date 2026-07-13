import { supabase } from './supabaseClient'

// Fetches exactly what ProjectEvalFlow needs to run Evaluate Project for a
// given project, on demand - scoped down from ProjectDetail.jsx's full
// loadTasks/loadSprints/loadMilestones/loadDocs to just the 4 doc types
// (charter/riskLog/budget/statusUpdates) project-eval's edge function
// actually reads, so this can run from the dashboard without needing
// ProjectDetail's full page load first.
export async function loadEvalContext(projectId) {
  const [tasksRes, sprintsRes, milestonesRes, charterRes, riskLogRes, budgetRes, statusUpdatesRes] =
    await Promise.all([
      supabase.from('tasks').select('*').eq('project_id', projectId),
      supabase.from('sprints').select('*').eq('project_id', projectId).order('start_date', { ascending: true }),
      supabase.from('milestones').select('*').eq('project_id', projectId).order('start_date', { ascending: true }),
      supabase.from('charters').select('*').eq('project_id', projectId).maybeSingle(),
      supabase.from('risk_logs').select('*').eq('project_id', projectId).maybeSingle(),
      supabase.from('budget_trackers').select('*').eq('project_id', projectId).maybeSingle(),
      supabase.from('status_updates').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
    ])

  const firstError = [tasksRes, sprintsRes, milestonesRes, charterRes, riskLogRes, budgetRes, statusUpdatesRes].find(
    (r) => r.error
  )?.error
  if (firstError) throw new Error(firstError.message)

  const sprintIds = (sprintsRes.data || []).map((s) => s.id)
  const retrosRes =
    sprintIds.length > 0
      ? await supabase.from('sprint_retros').select('*').in('sprint_id', sprintIds)
      : { data: [] }
  if (retrosRes.error) throw new Error(retrosRes.error.message)

  return {
    tasks: tasksRes.data || [],
    sprints: sprintsRes.data || [],
    retros: retrosRes.data || [],
    milestones: milestonesRes.data || [],
    charter: charterRes.data,
    riskLog: riskLogRes.data,
    budget: budgetRes.data,
    statusUpdates: statusUpdatesRes.data || [],
  }
}
