import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'

// Read-only Communication Plan (/m/projects/:projectId/more/comm-plan).
// Purpose-built mobile component - does NOT import desktop
// CommunicationPlanRoute.jsx. Type/Format/Frequency are plain enum strings
// already matching the `comm_plan_items` check constraints (see
// supabase/migrations/comm_plan_schema.sql), so no local label map is
// needed for them - only the audience-name lookup is fetched separately,
// consistent with MobileProjectStakeholders.jsx's stated convention of not
// cross-importing desktop-oriented modules.

function MobileProjectCommunicationPlan() {
  const { projectId } = useParams()

  const [items, setItems] = useState([])
  const [audienceByItem, setAudienceByItem] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const { data: plan, error: planError } = await supabase
        .from('communication_plans')
        .select('id')
        .eq('project_id', projectId)
        .maybeSingle()

      if (cancelled) return

      if (planError) {
        setError(planError.message)
        setLoading(false)
        return
      }

      if (!plan) {
        setItems([])
        setLoading(false)
        return
      }

      const { data: itemRows, error: itemsError } = await supabase
        .from('comm_plan_items')
        .select('*')
        .eq('plan_id', plan.id)
        .order('created_at', { ascending: true })

      if (cancelled) return

      if (itemsError) {
        setError(itemsError.message)
        setLoading(false)
        return
      }

      const rows = itemRows || []
      setItems(rows)

      if (rows.length > 0) {
        const { data: audienceRows, error: audienceError } = await supabase
          .from('comm_plan_audience')
          .select('item_id, stakeholders(id, name)')
          .in('item_id', rows.map((r) => r.id))

        if (cancelled) return

        if (audienceError) {
          setError(audienceError.message)
          setLoading(false)
          return
        }

        const grouped = {}
        for (const row of audienceRows || []) {
          if (!row.stakeholders) continue
          if (!grouped[row.item_id]) grouped[row.item_id] = []
          grouped[row.item_id].push(row.stakeholders.name)
        }
        setAudienceByItem(grouped)
      }

      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [projectId])

  return (
    <div>
      <h1 className="mobile-screen-title">Communication Plan</h1>

      {loading && <p className="mobile-screen-stub">Loading...</p>}
      {!loading && error && <p className="mobile-error">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className="mobile-screen-stub">Please log into the desktop version to add communication plan items.</p>
      )}
      {!loading && !error && items.length > 0 && (
        <>
          <div className="mobile-doc-card-list">
            {items.map((item) => (
              <div className="mobile-doc-risk-card" key={item.id}>
                <p className="mobile-doc-section-body">{item.type}</p>
                {item.purpose && <p className="mobile-doc-risk-meta">{item.purpose}</p>}
                <p className="mobile-doc-risk-meta">
                  {item.format} · {item.frequency}
                  {item.owner ? ` · ${item.owner}` : ''}
                </p>
                {(audienceByItem[item.id] || []).length > 0 && (
                  <p className="mobile-doc-risk-meta">
                    Audience: {audienceByItem[item.id].join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>
          <p className="mobile-screen-stub">Log into the desktop version to edit or add communication plan items.</p>
        </>
      )}
    </div>
  )
}

export default MobileProjectCommunicationPlan
