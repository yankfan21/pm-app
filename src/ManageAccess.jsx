import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'

const ROLES = [
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' },
]

// Owner-only section (gated by the caller). Invite-by-email resolves an
// email to a user id via the find_user_id_by_email RPC (phase1 migration) -
// this app has no profiles table readable by every authenticated user,
// since that would let anyone signed in enumerate every registered email;
// the RPC only ever reveals whether one exact email has an account.
function ManageAccess({ project }) {
  const { user } = useAuth()
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

    const { data: userId, error: lookupError } = await supabase.rpc('find_user_id_by_email', {
      p_email: trimmedEmail,
    })

    if (lookupError) {
      setError(lookupError.message)
      setInviting(false)
      return
    }
    if (!userId) {
      setError('No account found for that email - ask them to sign up first.')
      setInviting(false)
      return
    }
    if (userId === user.id) {
      setError("That's you - you're already the owner of this project.")
      setInviting(false)
      return
    }

    const { data, error: insertError } = await supabase
      .from('project_collaborators')
      .insert({
        project_id: project.id,
        user_id: userId,
        email: trimmedEmail,
        role,
        invited_by: user.id,
      })
      .select()
      .single()

    setInviting(false)

    if (insertError) {
      setError(
        insertError.code === '23505'
          ? 'That person already has access to this project.'
          : insertError.message
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
