import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import AppShell from './AppShell'

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatCost(usd) {
  return `$${usd.toFixed(usd < 1 ? 4 : 2)}`
}

function formatTokens(n) {
  return n.toLocaleString()
}

// Hidden admin page - no nav link anywhere, reached only by typing /admin.
// Gated by AdminRoute (email check) client-side and by admin-data's own
// ADMIN_EMAIL check server-side (the real boundary, since this is the only
// function holding the service role key).
function AdminPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedUserId, setExpandedUserId] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      const { data, error: invokeError } = await supabase.functions.invoke('admin-data')
      if (cancelled) return
      if (invokeError || data?.error) {
        setError(invokeError?.message || data.error)
      } else {
        setUsers(data.users || [])
      }
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const totals = users.reduce(
    (acc, u) => ({
      calls: acc.calls + u.usage.call_count,
      tokens: acc.tokens + u.usage.total_tokens,
      cost: acc.cost + u.usage.estimated_cost_usd,
    }),
    { calls: 0, tokens: 0, cost: 0 }
  )

  return (
    <AppShell>
      <div className="app-body">
        <h2 className="page-title view-title">Admin</h2>
        <p className="dashboard-subtitle">
          All users, their projects, and AI assistant usage/cost. Visible only to {' '}
          <code>admin@confidantpm.com</code>.
        </p>

        {loading && <p className="charter-status">Loading...</p>}
        {error && <p className="error">{error}</p>}

        {!loading && !error && (
          <>
            <div className="admin-totals">
              <div className="admin-totals-item">
                <span className="admin-totals-value">{users.length}</span>
                <span className="admin-totals-label">Users</span>
              </div>
              <div className="admin-totals-item">
                <span className="admin-totals-value">{totals.calls}</span>
                <span className="admin-totals-label">AI Calls</span>
              </div>
              <div className="admin-totals-item">
                <span className="admin-totals-value">{formatTokens(totals.tokens)}</span>
                <span className="admin-totals-label">Total Tokens</span>
              </div>
              <div className="admin-totals-item">
                <span className="admin-totals-value">{formatCost(totals.cost)}</span>
                <span className="admin-totals-label">Est. Cost</span>
              </div>
            </div>

            <div className="admin-user-list">
              {users.map((u) => {
                const expanded = expandedUserId === u.id
                return (
                  <div key={u.id} className="admin-user-row">
                    <button
                      type="button"
                      className="collapsible-toggle admin-user-toggle"
                      onClick={() => setExpandedUserId(expanded ? null : u.id)}
                      aria-expanded={expanded}
                    >
                      <span className={`chevron ${expanded ? '' : 'collapsed'}`} aria-hidden="true">
                        ▾
                      </span>
                      <span className="admin-user-email">{u.email}</span>
                      <span className="admin-user-created">Joined {formatDate(u.created_at)}</span>
                      <span className="admin-user-stat">{u.usage.call_count} calls</span>
                      <span className="admin-user-stat">{formatTokens(u.usage.total_tokens)} tokens</span>
                      <span className="admin-user-stat admin-user-cost">
                        {formatCost(u.usage.estimated_cost_usd)}
                      </span>
                    </button>

                    {expanded && (
                      <div className="admin-user-detail">
                        {u.projects.length === 0 ? (
                          <p className="admin-empty">No projects.</p>
                        ) : (
                          <ul className="admin-project-list">
                            {u.projects.map((p) => (
                              <li key={`${p.id}-${p.role}`} className="admin-project-item">
                                <span className="admin-project-name">{p.name}</span>
                                <span className="pill-role">{p.role}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}

export default AdminPage
