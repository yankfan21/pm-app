import { useState } from 'react'
import { supabase } from './supabaseClient'
import { assignTaskToSprint } from './sprintAssignment'
import { STORY_POINT_OPTIONS } from './storyPoints'
import BacklogImportFlow from './BacklogImportFlow'

const STATUS_OPTIONS = [
  { key: 'backlog', label: 'Backlog', colorClass: 'pending' },
  { key: 'ready', label: 'Ready', colorClass: 'ready' },
  { key: 'in_sprint', label: 'In Sprint', colorClass: 'partial' },
  { key: 'done', label: 'Done', colorClass: 'done' },
]

const STATUS_COLOR = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.key, s.colorClass]))

function byBacklogRank(a, b) {
  return (a.backlog_rank ?? 0) - (b.backlog_rank ?? 0)
}

function BacklogView({ project, tasks, setTasks, sprints, milestones, canEdit, expanded, onToggle }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [storyPoints, setStoryPoints] = useState('')
  const [milestoneId, setMilestoneId] = useState('')
  const [error, setError] = useState(null)
  const [reorderingId, setReorderingId] = useState(null)
  const [showImport, setShowImport] = useState(false)

  const isHybrid = project.methodology === 'hybrid'
  const items = tasks.filter((t) => t.backlog_status != null).sort(byBacklogRank)
  const totalPoints = items.reduce((sum, t) => sum + (t.story_points ?? 0), 0)

  async function handleCreate(e) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return

    setError(null)
    const nextRank = items.length > 0 ? Math.max(...items.map((t) => t.backlog_rank ?? 0)) + 1 : 0

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        project_id: project.id,
        title: trimmed,
        description: description.trim() || null,
        story_points: storyPoints ? Number(storyPoints) : null,
        milestone_id: isHybrid ? milestoneId || null : null,
        backlog_rank: nextRank,
        backlog_status: 'backlog',
      })
      .select()
      .single()

    if (error) {
      setError(error.message)
      return
    }

    setTasks((prev) => [...prev, data])
    setTitle('')
    setDescription('')
    setStoryPoints('')
    setMilestoneId('')
  }

  async function updateItem(task, fields) {
    setError(null)
    const { data, error } = await supabase
      .from('tasks')
      .update(fields)
      .eq('id', task.id)
      .select()

    if (error) {
      setError(error.message)
      return
    }

    if (!data || data.length === 0) {
      setError('Update failed — you may not have permission to edit this task.')
      return
    }

    setTasks((prev) => prev.map((t) => (t.id === task.id ? data[0] : t)))
  }

  async function assignToSprint(task, sprintId) {
    if (!sprintId) return
    setError(null)
    const { data, error } = await assignTaskToSprint(task.id, sprintId)

    if (error) {
      setError(error.message)
      return
    }

    if (!data || data.length === 0) {
      setError('Update failed — you may not have permission to edit this task.')
      return
    }

    setTasks((prev) => prev.map((t) => (t.id === task.id ? data[0] : t)))
  }

  async function moveItem(task, direction) {
    const index = items.findIndex((t) => t.id === task.id)
    const swapIndex = index + direction
    if (swapIndex < 0 || swapIndex >= items.length) return

    const neighbor = items[swapIndex]
    const taskRank = task.backlog_rank ?? 0
    const neighborRank = neighbor.backlog_rank ?? 0

    setReorderingId(task.id)
    setError(null)

    const [taskResult, neighborResult] = await Promise.all([
      supabase.from('tasks').update({ backlog_rank: neighborRank }).eq('id', task.id).select(),
      supabase.from('tasks').update({ backlog_rank: taskRank }).eq('id', neighbor.id).select(),
    ])

    setReorderingId(null)

    if (taskResult.error || neighborResult.error) {
      setError((taskResult.error || neighborResult.error).message)
      return
    }

    if (!taskResult.data?.length || !neighborResult.data?.length) {
      setError('Reorder failed — you may not have permission to edit these tasks.')
      return
    }

    const updatedTask = taskResult.data[0]
    const updatedNeighbor = neighborResult.data[0]

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === updatedTask.id) return updatedTask
        if (t.id === updatedNeighbor.id) return updatedNeighbor
        return t
      })
    )
  }

  return (
    <div className="backlog">
      <h2 className="tasks-heading">
        <button
          type="button"
          className="collapsible-toggle toggle-header-with-badge"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <span className="toggle-header-main">
            <span className={`chevron ${expanded ? '' : 'collapsed'}`} aria-hidden="true">
              ▾
            </span>
            <span className={`status-dot ${items.length > 0 ? 'done' : 'pending'}`} aria-hidden="true" />
            Backlog
          </span>
          <span className={`doc-status-badge ${items.length > 0 ? 'done' : 'pending'}`}>
            {totalPoints} point{totalPoints === 1 ? '' : 's'} in backlog
          </span>
        </button>
      </h2>

      {expanded && (
        <>
          {error && <p className="error">{error}</p>}

          {canEdit && (
            <form onSubmit={handleCreate} className="backlog-create-form">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Backlog item title..."
              />
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
              />
              <select value={storyPoints} onChange={(e) => setStoryPoints(e.target.value)}>
                <option value="">Points</option>
                {STORY_POINT_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              {isHybrid && (
                <select
                  value={milestoneId}
                  onChange={(e) => setMilestoneId(e.target.value)}
                  className="backlog-epic-input"
                >
                  <option value="">Epic (optional)</option>
                  {milestones.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              )}
              <button type="submit">Add</button>
            </form>
          )}

          {canEdit && !showImport && (
            <button
              type="button"
              className="btn-secondary ai-task-gen-trigger"
              onClick={() => setShowImport(true)}
            >
              Import from Excel
            </button>
          )}

          {showImport && canEdit && (
            <BacklogImportFlow
              project={project}
              existingBacklogItems={items}
              onCommitted={(inserted) => setTasks((prev) => [...prev, ...inserted])}
              onDone={() => setShowImport(false)}
              onCancel={() => setShowImport(false)}
            />
          )}

          <ul className="backlog-list">
            {items.map((item, index) => (
              <li key={item.id} className="backlog-item">
                {canEdit && (
                  <div className="backlog-rank-controls">
                    <button
                      type="button"
                      disabled={index === 0 || reorderingId != null}
                      onClick={() => moveItem(item, -1)}
                      aria-label="Move up"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      disabled={index === items.length - 1 || reorderingId != null}
                      onClick={() => moveItem(item, 1)}
                      aria-label="Move down"
                    >
                      ▼
                    </button>
                  </div>
                )}

                <div className="backlog-item-main">
                  <div className="backlog-item-title-row">
                    <span className="backlog-item-title">{item.title}</span>
                    {item.story_points != null && (
                      <span className="story-points-badge">{item.story_points} pts</span>
                    )}
                    {isHybrid && item.milestone_id && (
                      <span className="epic-tag">
                        {milestones.find((m) => m.id === item.milestone_id)?.name ?? 'Unknown milestone'}
                      </span>
                    )}
                    {isHybrid && !item.milestone_id && item.epic_name && (
                      <span className="epic-tag" title="Free-text epic from before Milestones existed - not linked to a milestone yet">
                        {item.epic_name} (unmapped)
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p className="backlog-item-description">{item.description}</p>
                  )}
                </div>

                <select
                  className={`backlog-status-select ${STATUS_COLOR[item.backlog_status] || 'pending'}`}
                  value={item.backlog_status}
                  disabled={!canEdit}
                  onChange={(e) => updateItem(item, { backlog_status: e.target.value })}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>

                {canEdit && isHybrid && (
                  <select
                    className="backlog-assign-select"
                    value={item.milestone_id || ''}
                    onChange={(e) => updateItem(item, { milestone_id: e.target.value || null })}
                  >
                    <option value="">
                      {item.epic_name && !item.milestone_id ? 'Map to milestone...' : 'No milestone'}
                    </option>
                    {milestones.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                )}

                {canEdit && item.backlog_status === 'ready' && sprints.length > 0 && (
                  <select
                    className="backlog-assign-select"
                    value=""
                    onChange={(e) => assignToSprint(item, e.target.value)}
                  >
                    <option value="">Assign to sprint...</option>
                    {sprints.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}
              </li>
            ))}
            {items.length === 0 && <li className="empty">No backlog items yet</li>}
          </ul>
        </>
      )}
    </div>
  )
}

export default BacklogView
