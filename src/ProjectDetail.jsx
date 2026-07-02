import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import AppHeader from './AppHeader'
import CharterFlow from './CharterFlow'
import CharterView from './CharterView'

function ProjectDetail({ project, onBack, onProjectUpdated }) {
  const [currentProject, setCurrentProject] = useState(project)
  const [archiving, setArchiving] = useState(false)
  const [tasks, setTasks] = useState([])
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [charter, setCharter] = useState(null)
  const [charterLoading, setCharterLoading] = useState(true)
  const [showCharterFlow, setShowCharterFlow] = useState(false)

  useEffect(() => {
    async function loadTasks() {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('project_id', currentProject.id)
        .order('created_at', { ascending: true })

      if (error) setError(error.message)
      else setTasks(data)
      setLoading(false)
    }

    async function loadCharter() {
      const { data, error } = await supabase
        .from('charters')
        .select('*')
        .eq('project_id', currentProject.id)
        .maybeSingle()

      if (error) setError(error.message)
      else setCharter(data)
      setCharterLoading(false)
    }

    loadTasks()
    loadCharter()
  }, [currentProject.id])

  async function handleCharterGenerated(sections, answerList) {
    const { data, error } = await supabase
      .from('charters')
      .insert({
        project_id: currentProject.id,
        ...sections,
        qa_answers: answerList,
      })
      .select()
      .single()

    if (error) {
      return error.message
    }

    setCharter(data)
    setShowCharterFlow(false)
    return null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return

    const { data, error } = await supabase
      .from('tasks')
      .insert({ title: trimmed, project_id: currentProject.id })
      .select()
      .single()

    if (error) {
      setError(error.message)
      return
    }

    setTasks((prev) => [...prev, data])
    setTitle('')
  }

  async function toggleComplete(task) {
    const { data, error } = await supabase
      .from('tasks')
      .update({ completed: !task.completed })
      .eq('id', task.id)
      .select()
      .single()

    if (error) {
      setError(error.message)
      return
    }

    setTasks((prev) => prev.map((t) => (t.id === task.id ? data : t)))
  }

  async function deleteTask(task) {
    const { error } = await supabase.from('tasks').delete().eq('id', task.id)

    if (error) {
      setError(error.message)
      return
    }

    setTasks((prev) => prev.filter((t) => t.id !== task.id))
  }

  async function toggleArchived() {
    const nextStatus = currentProject.status === 'Archived' ? 'Active' : 'Archived'
    setArchiving(true)
    setError(null)

    const { data, error } = await supabase
      .from('projects')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', currentProject.id)
      .select()
      .single()

    setArchiving(false)

    if (error) {
      setError(error.message)
      return
    }

    setCurrentProject(data)
    onProjectUpdated(data)
  }

  return (
    <div className="app">
      <AppHeader />

      <button type="button" className="btn-secondary back-link" onClick={onBack}>
        &larr; Back to projects
      </button>

      <div className="section-header project-detail-header">
        <h2 className="page-title">{currentProject.name}</h2>
        <button
          type="button"
          className="btn-secondary"
          disabled={archiving}
          onClick={toggleArchived}
        >
          {archiving
            ? 'Saving...'
            : currentProject.status === 'Archived'
              ? 'Unarchive Project'
              : 'Archive Project'}
        </button>
      </div>
      <p className="project-goal">{currentProject.goal}</p>
      <div className="project-meta">
        <span className={`priority-badge ${currentProject.priority.toLowerCase()}`}>
          {currentProject.priority}
        </span>
        {currentProject.status === 'Archived' && (
          <span className="status-badge archived">Archived</span>
        )}
        <span>{currentProject.deadline ?? 'TBD'}</span>
      </div>

      <h2 className="tasks-heading">Tasks</h2>

      <form onSubmit={handleSubmit} className="task-form">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task..."
        />
        <button type="submit">Add</button>
      </form>

      {error && <p className="error">{error}</p>}

      <ul className="task-list">
        {loading && <li className="empty">Loading...</li>}
        {!loading &&
          tasks.map((task) => (
            <li key={task.id} className={task.completed ? 'completed' : ''}>
              <label>
                <input
                  type="checkbox"
                  checked={task.completed}
                  onChange={() => toggleComplete(task)}
                />
                <span>{task.title}</span>
              </label>
              <button
                type="button"
                className="delete"
                onClick={() => deleteTask(task)}
              >
                Delete
              </button>
            </li>
          ))}
        {!loading && tasks.length === 0 && (
          <li className="empty">No tasks yet</li>
        )}
      </ul>

      {charterLoading && <p className="charter-status">Loading...</p>}

      {!charterLoading && !charter && (
        <div className="section-header charter-header">
          <h3 className="charter-heading">Charter</h3>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowCharterFlow(true)}
          >
            Generate Charter
          </button>
        </div>
      )}

      {!charterLoading && charter && (
        <CharterView
          project={currentProject}
          charter={charter}
          onUpdate={setCharter}
        />
      )}

      {showCharterFlow && (
        <CharterFlow
          project={currentProject}
          onGenerated={handleCharterGenerated}
          onClose={() => setShowCharterFlow(false)}
        />
      )}
    </div>
  )
}

export default ProjectDetail
