import { useEffect, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../AuthContext'

// Task detail (/m/projects/:projectId/tasks/:taskId) - status change plus
// comments (view/add/edit/delete own, see task_comments_schema.sql).
// Sibling route to MobileProjectTasks under the same MobileProjectLayout
// Outlet, so it gets the same {project, canEdit} context without an extra
// project-role fetch of its own.
const STATUS_OPTIONS = [
  { key: 'not_started', label: 'Not Started' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'delayed', label: 'Delayed' },
]

function MobileTaskDetail() {
  const { project, canEdit } = useOutletContext()
  const { projectId, taskId } = useParams()
  const { user } = useAuth()

  const [task, setTask] = useState(null)
  const [collaborators, setCollaborators] = useState([])
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [savingStatus, setSavingStatus] = useState(false)

  const [newComment, setNewComment] = useState('')
  const [posting, setPosting] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editBody, setEditBody] = useState('')
  const [savingEditId, setSavingEditId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const [taskRes, collabRes, commentsRes] = await Promise.all([
        supabase.from('tasks').select('*').eq('id', taskId).maybeSingle(),
        supabase.from('project_collaborators').select('user_id, email').eq('project_id', projectId),
        supabase
          .from('task_comments')
          .select('*')
          .eq('task_id', taskId)
          .order('created_at', { ascending: true }),
      ])

      if (cancelled) return

      if (taskRes.error) {
        setError(taskRes.error.message)
        setLoading(false)
        return
      }
      if (!taskRes.data) {
        setError('Task not found.')
        setLoading(false)
        return
      }

      setTask(taskRes.data)
      setCollaborators(collabRes.data || [])
      setComments(commentsRes.data || [])
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [taskId, projectId])

  function authorLabel(authorId) {
    if (authorId === user.id) return 'You'
    const match = collaborators.find((c) => c.user_id === authorId)
    if (match) return match.email
    if (authorId === project.owner_id) return 'Project Owner'
    return 'Unknown user'
  }

  async function updateStatus(nextStatus) {
    if (!canEdit || savingStatus) return
    setSavingStatus(true)
    setError(null)

    const { data, error } = await supabase
      .from('tasks')
      .update({ status: nextStatus, completed: nextStatus === 'completed' })
      .eq('id', taskId)
      .select()

    setSavingStatus(false)

    if (error) {
      setError(error.message)
      return
    }
    if (!data || data.length === 0) {
      setError('Update failed — you may not have permission to edit this task.')
      return
    }
    setTask(data[0])
  }

  async function postComment(e) {
    e.preventDefault()
    const trimmed = newComment.trim()
    if (!trimmed || posting) return

    setPosting(true)
    setError(null)

    const { data, error } = await supabase
      .from('task_comments')
      .insert({ task_id: taskId, author_id: user.id, body: trimmed })
      .select()
      .single()

    setPosting(false)

    if (error) {
      setError(error.message)
      return
    }

    setComments((prev) => [...prev, data])
    setNewComment('')
  }

  function startEdit(comment) {
    setEditingId(comment.id)
    setEditBody(comment.body)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditBody('')
  }

  async function saveEdit(commentId) {
    const trimmed = editBody.trim()
    if (!trimmed) return

    setSavingEditId(commentId)
    setError(null)

    const { data, error } = await supabase
      .from('task_comments')
      .update({ body: trimmed })
      .eq('id', commentId)
      .select()
      .single()

    setSavingEditId(null)

    if (error) {
      setError(error.message)
      return
    }

    setComments((prev) => prev.map((c) => (c.id === commentId ? data : c)))
    cancelEdit()
  }

  async function deleteComment(commentId) {
    setDeletingId(commentId)
    setError(null)

    const { error } = await supabase.from('task_comments').delete().eq('id', commentId)

    setDeletingId(null)

    if (error) {
      setError(error.message)
      return
    }

    setComments((prev) => prev.filter((c) => c.id !== commentId))
  }

  if (loading) {
    return <p className="mobile-screen-stub">Loading...</p>
  }

  if (error && !task) {
    return <p className="mobile-error">{error}</p>
  }

  return (
    <div>
      <Link to={`/m/projects/${projectId}/tasks`} className="mobile-back-link">
        &larr; Tasks
      </Link>

      <h1 className="mobile-screen-title">
        {task.task_type === 'milestone_marker' && (
          <span className="mobile-milestone-badge" aria-hidden="true">◆ </span>
        )}
        {task.title}
      </h1>

      {task.description && <p className="mobile-task-description">{task.description}</p>}
      {task.due_date && <p className="mobile-task-due">Due {task.due_date}</p>}

      {error && <p className="mobile-error">{error}</p>}

      <div className="mobile-status-picker">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`mobile-status-option status-${s.key} ${
              (task.status ?? 'not_started') === s.key ? 'selected' : ''
            }`}
            disabled={!canEdit || savingStatus}
            onClick={() => updateStatus(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <h2 className="mobile-section-title">Comments</h2>

      {comments.length === 0 && <p className="mobile-screen-stub">No comments yet.</p>}

      <ul className="mobile-comment-list">
        {comments.map((comment) => (
          <li key={comment.id} className="mobile-comment">
            <div className="mobile-comment-meta">
              <span className="mobile-comment-author">{authorLabel(comment.author_id)}</span>
              <span className="mobile-comment-time">
                {new Date(comment.created_at).toLocaleString()}
                {comment.updated_at !== comment.created_at ? ' (edited)' : ''}
              </span>
            </div>

            {editingId === comment.id ? (
              <div className="mobile-comment-edit">
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={3}
                />
                <div className="mobile-comment-edit-actions">
                  <button
                    type="button"
                    onClick={() => saveEdit(comment.id)}
                    disabled={savingEditId === comment.id}
                  >
                    {savingEditId === comment.id ? 'Saving...' : 'Save'}
                  </button>
                  <button type="button" className="mobile-btn-secondary" onClick={cancelEdit}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="mobile-comment-body">{comment.body}</p>
                {comment.author_id === user.id && (
                  <div className="mobile-comment-actions">
                    <button type="button" onClick={() => startEdit(comment)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="mobile-btn-danger"
                      disabled={deletingId === comment.id}
                      onClick={() => deleteComment(comment.id)}
                    >
                      {deletingId === comment.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={postComment} className="mobile-comment-form">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment..."
          rows={3}
        />
        <button type="submit" disabled={posting || !newComment.trim()}>
          {posting ? 'Posting...' : 'Post'}
        </button>
      </form>
    </div>
  )
}

export default MobileTaskDetail
