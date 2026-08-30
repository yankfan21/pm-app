import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'

// Read-only Stakeholder Registry (/m/projects/:projectId/more/stakeholders).
// Purpose-built mobile component - does NOT import desktop
// StakeholderRegistryRoute.jsx or QuadrantPicker.jsx. Quadrant label map
// duplicated locally rather than importing QUADRANTS, consistent with
// MobileProjectExecComms.jsx's stated convention of not cross-importing
// desktop-oriented modules. Badge classes map to the mobile .mobile-doc-badge
// variants (MobileProjectRisks.jsx/MobileProjectIssues.jsx), not desktop's
// .priority-badge variants, since the two badge components live in separate
// CSS namespaces.
const QUADRANT_LABELS = {
  manage_closely: { label: 'Manage Closely', badgeClass: 'critical' },
  keep_satisfied: { label: 'Keep Satisfied', badgeClass: 'partial' },
  keep_informed: { label: 'Keep Informed', badgeClass: 'partial' },
  monitor: { label: 'Monitor', badgeClass: 'pending' },
}

function quadrantLabel(key) {
  return QUADRANT_LABELS[key]?.label || key
}

function quadrantBadgeClass(key) {
  return QUADRANT_LABELS[key]?.badgeClass || 'pending'
}

function MobileProjectStakeholders() {
  const { projectId } = useParams()

  const [stakeholders, setStakeholders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const { data: registry, error: registryError } = await supabase
        .from('stakeholder_registries')
        .select('id')
        .eq('project_id', projectId)
        .maybeSingle()

      if (cancelled) return

      if (registryError) {
        setError(registryError.message)
        setLoading(false)
        return
      }

      if (!registry) {
        setStakeholders([])
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('stakeholders')
        .select('*')
        .eq('registry_id', registry.id)
        .order('name', { ascending: true })

      if (cancelled) return

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      setStakeholders(data || [])
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [projectId])

  return (
    <div>
      <h1 className="mobile-screen-title">Stakeholder Registry</h1>

      {loading && <p className="mobile-screen-stub">Loading...</p>}
      {!loading && error && <p className="mobile-error">{error}</p>}
      {!loading && !error && stakeholders.length === 0 && (
        <p className="mobile-screen-stub">Please log into the desktop version to add stakeholders.</p>
      )}
      {!loading && !error && stakeholders.length > 0 && (
        <>
          <div className="mobile-doc-card-list">
            {stakeholders.map((s) => (
              <div className="mobile-doc-risk-card" key={s.id}>
                <p className="mobile-doc-section-body">{s.name}</p>
                <p className="mobile-doc-risk-meta">
                  {[s.role_title, s.org].filter(Boolean).join(' · ') || '—'}
                </p>
                <p className="mobile-doc-risk-meta">
                  <span className={`mobile-doc-badge ${quadrantBadgeClass(s.quadrant)}`}>
                    {quadrantLabel(s.quadrant)}
                  </span>
                </p>
              </div>
            ))}
          </div>
          <p className="mobile-screen-stub">Log into the desktop version to edit or add stakeholders.</p>
        </>
      )}
    </div>
  )
}

export default MobileProjectStakeholders
