import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'

// Read-only Team Newsletter (/m/projects/:projectId/more/newsletter).
// Purpose-built mobile component - does NOT import desktop CommsView.jsx or
// its regenerate/revise/export trigger logic (see MobileProjectMore.jsx
// split). Section list duplicated locally rather than importing
// commsSections.js, consistent with MobileProjectDocuments.jsx's own stated
// convention of not cross-importing desktop-oriented modules.

const NEWSLETTER_SECTIONS = [
  { key: 'highlights', label: 'Highlights & Wins' },
  { key: 'upcoming_milestones', label: 'Upcoming Milestones' },
  { key: 'shoutouts', label: 'Shoutouts' },
  { key: 'links', label: 'Links & Resources' },
]

function SectionsDetail({ doc }) {
  return (
    <>
      {NEWSLETTER_SECTIONS.map(({ key, label }) =>
        doc[key] ? (
          <div className="mobile-doc-section" key={key}>
            <h4 className="mobile-doc-section-heading">{label}</h4>
            <p className="mobile-doc-section-body">{doc[key]}</p>
          </div>
        ) : null
      )}
    </>
  )
}

function MobileProjectNewsletter() {
  const { projectId } = useParams()

  const [doc, setDoc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const { data, error } = await supabase
        .from('team_newsletters')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle()

      if (cancelled) return

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      setDoc(data)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [projectId])

  return (
    <div>
      <h1 className="mobile-screen-title">Team Newsletter</h1>

      {loading && <p className="mobile-screen-stub">Loading...</p>}
      {!loading && error && <p className="mobile-error">{error}</p>}
      {!loading && !error && doc == null && (
        <p className="mobile-screen-stub">Please log into the desktop version to generate this.</p>
      )}
      {!loading && !error && doc != null && <SectionsDetail doc={doc} />}
    </div>
  )
}

export default MobileProjectNewsletter
