import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const ROLES = [
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' },
]

// Owner-only section (gated by the caller). Invite-by-email goes through the
// invite_project_collaborator RPC (add_pending_collaborator_invites_and_cap.sql
// migration), which does the email->user lookup, the cross-project
// 5-collaborator cap check, and the insert in one round trip. An email with
// no existing account is no longer a dead end: it inserts a status='pending'
// row (user_id null) and gets linked to a real account automatically the
// moment that person signs up. This app still has no profiles table readable
// by every authenticated user, since that would let anyone signed in
// enumerate every registered email; the lookup only ever reveals whether one
// exact email has an account.
function ManageAccess({ project }) {
  const [collaborators, setCollaborators] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('editor')
  const [inviting, setInviting] = useState(false)

  useEffect(() => {
    loadCollaborators()
  }, [project.id])

  async function loadCollaborators() {
    setLoading(true)
    setError(null)

    const { data, error } = await supabase
      .from('project_collaborators')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: true })

    if (error) setError(error.message)
    else setCollaborators(data)
    setLoading(false)
  }

  async function handleInvite(e) {
    e.preventDefault()
    setInviting(true)
    setError(null)

    const trimmedEmail = email.trim()

    const { data, error: inviteError } = await supabase.rpc('invite_project_collaborator', {
      p_project_id: project.id,
      p_email: trimmedEmail,
      p_role: role,
    })

    setInviting(false)

    if (inviteError) {
      setError(
        inviteError.code === '23505'
          ? 'That person already has access to this project, or a pending invite.'
          : inviteError.message
      )
      return
    }

    setCollaborators((prev) => [...prev, data])
    setEmail('')
  }

  async function handleRoleChange(collaborator, nextRole) {
    setError(null)

    const { data, error } = await supabase
      .from('project_collaborators')
      .update({ role: nextRole })
      .eq('id', collaborator.id)
      .select()
      .single()

    if (error) {
      setError(error.message)
      return
    }

    setCollaborators((prev) => prev.map((c) => (c.id === collaborator.id ? data : c)))
  }

  async function handleRemove(collaborator) {
    setError(null)

    const { error } = await supabase
      .from('project_collaborators')
      .delete()
      .eq('id', collaborator.id)

    if (error) {
      setError(error.message)
      return
    }

    setCollaborators((prev) => prev.filter((c) => c.id !== collaborator.id))
  }

  return (
    <div className="charter">
      {error && <p className="error">{error}</p>}

      {loading && <p className="charter-status">Loading...</p>}

      {!loading && (
        <ul className="collaborator-list">
          {collaborators.length === 0 && <li className="empty">No collaborators yet</li>}
          {collaborators.map((c) => (
            <li key={c.id} className="collaborator-row">
              <span className="collaborator-email">{c.email}</span>
              {c.status === 'pending' && <span className="collaborator-pending-badge">Pending</span>}
              <select value={c.role} onChange={(e) => handleRoleChange(c, e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <button type="button" className="delete" onClick={() => handleRemove(c)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="collaborator-invite-form" onSubmit={handleInvite}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Invite by email..."
          required
        />
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-primary" disabled={inviting}>
          {inviting ? 'Inviting...' : 'Invite'}
        </button>
      </form>
    </div>
  )
}

export default ManageAccess
