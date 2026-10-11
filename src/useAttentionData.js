import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

// Task, milestone and status update rows behind the Dashboard's attention
// list and AI note. Fetched once per set of project ids. null until loaded.
export default function useAttentionData(projects) {
  const [data, setData] = useState(null)
  const idsKey = projects.map((p) => p.id).join(',')

  useEffect(() => {
    const ids = projects.map((p) => p.id)
    if (ids.length === 0) {
      setData({ tasks: [], milestones: [], planItems: [], updates: [] })
      return undefined
    }
    let cancelled = false
    async function load() {
      const [t, m, pi, su] = await Promise.all([
        supabase.from('tasks').select('id, project_id, title, due_date, status, task_type, milestone_id').in('project_id', ids),
        supabase.from('milestones').select('id, project_id, name, end_date').in('project_id', ids),
        supabase.from('comm_plan_items').select('project_id, type, frequency, created_at').in('project_id', ids).eq('type', 'Status Update'),
        supabase.from('status_updates').select('project_id, created_at').in('project_id', ids),
      ])
      if (cancelled) return
      setData({ tasks: t.data || [], milestones: m.data || [], planItems: pi.data || [], updates: su.data || [] })
    }
    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey])

  return data
}
