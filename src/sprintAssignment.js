import { supabase } from './supabaseClient'

// The single update both entry points use to pull a ready backlog item into
// a sprint - Backlog's per-item "Assign to sprint..." dropdown and Sprint
// Board's "Add from Backlog" picker both call this rather than each having
// their own copy of the three-field update.
export function assignTaskToSprint(taskId, sprintId) {
  return supabase
    .from('tasks')
    .update({ sprint_id: sprintId, backlog_status: 'in_sprint', board_status: 'todo' })
    .eq('id', taskId)
    .select()
    .single()
}
