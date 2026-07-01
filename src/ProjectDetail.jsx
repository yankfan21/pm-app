import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import CharterFlow from './CharterFlow'
import CharterView from './CharterView'

function ProjectDetail({ project, onBack }) {
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
        .eq('project_id', project.id)
        .order('created_at', { ascending: true })

      if (error) setError(error.message)
      else setTasks(data)
      setLoading(false)
    }

    async function loadCharter() {
      const { data, error } = await supabase
        .from('charters')
        .select('*')
        .eq('project_id', project.id)
        .maybeSingle()

      if (error) setError(error.message)
      else setCharter(data)
      setCharterLoading(false)
    }

    loadTasks()
    loadCharter()
  }, [project.id])

  async function handleCharterGenerated(sections, answerList) {
    const { data, error } = await supabase
      .from('charters')
      .insert({
        project_id: project.id,
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
      .insert({ title: trimmed, project_id: project.id })
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

  return (
    <div className="app">
      <h1 className="app-title">
        <span className="app-title-mark" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
          </svg>
        </span>
        PM-App
      </h1>
      <p className="app-subtitle">Your Project Management Assistant</p>

      <button type="button" className="btn-secondary back-link" onClick={onBack}>
        &larr; Back to projects
      </button>

      <h2 className="page-title">{project.name}</h2>
      <p className="project-goal">{project.goal}</p>
      <div className="project-meta">
        <span className={`priority-badge ${project.priority.toLowerCase()}`}>
          {project.priority}
        </span>
        <span>{project.deadline ?? 'TBD'}</span>
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
          project={project}
          charter={charter}
          onUpdate={setCharter}
        />
      )}

      {showCharterFlow && (
        <CharterFlow
          project={project}
          onGenerated={handleCharterGenerated}
          onClose={() => setShowCharterFlow(false)}
        />
      )}
    </div>
  )
}

export default ProjectDetail
