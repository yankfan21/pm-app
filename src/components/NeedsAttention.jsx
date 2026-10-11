import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { computeAttentionItems } from '../needsAttention'

const CAP = 3

function NeedsAttention({ projects, loading }) {
  const [data, setData] = useState(null)
  const [showAll, setShowAll] = useState(false)
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

  if (loading || !data) return null

  const items = computeAttentionItems(projects, data)
  const shown = showAll ? items : items.slice(0, CAP)

  return (
    <section className="needs-attention" aria-labelledby="needs-attention-title">
      <h3 id="needs-attention-title" className="needs-attention-title">Needs your attention</h3>
      {items.length === 0 ? (
        <p className="needs-attention-clear">All caught up: nothing needs your attention.</p>
      ) : (
        <ul className="needs-attention-list">
          {shown.map((item) => (
            <li key={item.key}>
              <div className="needs-attention-text">
                <span className="needs-attention-project">{item.projectName}</span>
                <span>{item.text}</span>
              </div>
              <Link to={`/projects/${item.projectId}`} className="btn-secondary">Open</Link>
            </li>
          ))}
        </ul>
      )}
      {items.length > CAP && (
        <button type="button" className="needs-attention-more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer' : `See all ${items.length}`}
        </button>
      )}
    </section>
  )
}

export default NeedsAttention
