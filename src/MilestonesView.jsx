import { useState } from 'react'
import { supabase } from './supabaseClient'

function byStartDate(a, b) {
  if (!a.start_date && !b.start_date) return a.name.localeCompare(b.name)
  if (!a.start_date) return 1
  if (!b.start_date) return -1
  return a.start_date.localeCompare(b.start_date)
}

function MilestonesView({ project, milestones, setMilestones, canEdit, expanded, onToggle }) {
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)

  const sorted = [...milestones].sort(byStartDate)

  async function handleCreate(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return

    setCreating(true)
    setError(null)

    const { data, error } = await supabase
      .from('milestones')
      .insert({
        project_id: project.id,
        name: trimmed,
        start_date: startDate || null,
        end_date: endDate || null,
        description: description.trim() || null,
      })
      .select()
      .single()

    setCreating(false)

    if (error) {
      setError(error.message)
      return
    }

    setMilestones((prev) => [...prev, data])
    setName('')
    setStartDate('')
    setEndDate('')
    setDescription('')
  }

  async function deleteMilestone(milestone) {
    setError(null)
    const { error } = await supabase.from('milestones').delete().eq('id', milestone.id)

    if (error) {
      setError(error.message)
      return
    }

    setMilestones((prev) => prev.filter((m) => m.id !== milestone.id))
  }

  return (
    <div className="milestones">
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
            <span className={`status-dot ${milestones.length > 0 ? 'done' : 'pending'}`} aria-hidden="true" />
            Milestones
          </span>
          <span className={`doc-status-badge ${milestones.length > 0 ? 'done' : 'pending'}`}>
            {milestones.length > 0
              ? `${milestones.length} Milestone${milestones.length === 1 ? '' : 's'}`
              : 'Not started'}
          </span>
        </button>
      </h2>

      {expanded && (
        <>
          {error && <p className="error">{error}</p>}

          {canEdit && (
            <form onSubmit={handleCreate} className="sprint-create-form">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Milestone name..."
              />
              <label className="task-date-field">
                Start
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </label>
              <label className="task-date-field">
                End
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
              />
              <button type="submit" disabled={creating}>
                {creating ? 'Adding...' : 'Add'}
              </button>
            </form>
          )}

          <ul className="backlog-list milestone-list">
            {sorted.map((milestone) => (
              <li key={milestone.id} className="backlog-item">
                <div className="backlog-item-main">
                  <div className="backlog-item-title-row">
                    <span className="backlog-item-title">{milestone.name}</span>
                    {(milestone.start_date || milestone.end_date) && (
                      <span className="story-points-badge">
                        {milestone.start_date || 'TBD'} &rarr; {milestone.end_date || 'TBD'}
                      </span>
                    )}
                  </div>
                  {milestone.description && (
                    <p className="backlog-item-description">{milestone.description}</p>
                  )}
                </div>
                {canEdit && (
                  <button type="button" className="delete" onClick={() => deleteMilestone(milestone)}>
                    Delete
                  </button>
                )}
              </li>
            ))}
            {sorted.length === 0 && <li className="empty">No milestones yet</li>}
          </ul>
        </>
      )}
    </div>
  )
}

export default MilestonesView
