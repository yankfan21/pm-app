import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabaseClient'
import AppHeader from './AppHeader'
import GanttChart from './GanttChart'
import { DOCUMENT_TYPES } from './documentTypes'

function ProjectDetail({ project }) {
  const [currentProject, setCurrentProject] = useState(project)
  const [archiving, setArchiving] = useState(false)
  const [tasks, setTasks] = useState([])
  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [dependsOn, setDependsOn] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tasksExpanded, setTasksExpanded] = useState(true)

  const [docs, setDocs] = useState({})
  const [docsLoading, setDocsLoading] = useState(true)
  const [activeDocKey, setActiveDocKey] = useState(null)
  const [activeFlowKey, setActiveFlowKey] = useState(null)

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

    async function loadDocs() {
      const results = await Promise.all(
        DOCUMENT_TYPES.map((docType) =>
          supabase
            .from(docType.table)
            .select('*')
            .eq('project_id', currentProject.id)
            .maybeSingle()
        )
      )

      const next = {}
      results.forEach(({ data, error }, i) => {
        if (error) setError(error.message)
        next[DOCUMENT_TYPES[i].key] = data
      })
      setDocs(next)
      setDocsLoading(false)
    }

    loadTasks()
    loadDocs()
  }, [currentProject.id])

  async function handleDocGenerated(docType, result, answerList) {
    const { data, error } = await supabase
      .from(docType.table)
      .insert({
        project_id: currentProject.id,
        ...docType.buildInsert(result),
        qa_answers: answerList,
      })
      .select()
      .single()

    if (error) {
      return error.message
    }

    setDocs((prev) => ({ ...prev, [docType.key]: data }))
    setActiveFlowKey(null)
    setActiveDocKey(docType.key)
    return null
  }

  function handleDocUpdated(docType, updatedRow) {
    setDocs((prev) => ({ ...prev, [docType.key]: updatedRow }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title: trimmed,
        project_id: currentProject.id,
        start_date: startDate || null,
        due_date: dueDate || null,
        depends_on: dependsOn || null,
      })
      .select()
      .single()

    if (error) {
      setError(error.message)
      return
    }

    setTasks((prev) => [...prev, data])
    setTitle('')
    setStartDate('')
    setDueDate('')
    setDependsOn('')
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

  async function updateTaskField(task, field, value) {
    const { data, error } = await supabase
      .from('tasks')
      .update({ [field]: value || null })
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
  }

  const activeDocType = DOCUMENT_TYPES.find((d) => d.key === activeDocKey)
  const activeFlowType = DOCUMENT_TYPES.find((d) => d.key === activeFlowKey)

  return (
    <div className="app">
      <AppHeader />

      <Link to="/projects" className="btn-secondary back-link">
        &larr; Back to projects
      </Link>

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

      <h2 className="tasks-heading">
        <button
          type="button"
          className="collapsible-toggle"
          onClick={() => setTasksExpanded((prev) => !prev)}
          aria-expanded={tasksExpanded}
        >
          <span className={`chevron ${tasksExpanded ? '' : 'collapsed'}`} aria-hidden="true">
            ▾
          </span>
          Tasks
        </button>
      </h2>

      {tasksExpanded && (
        <form onSubmit={handleSubmit} className="task-form">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a task..."
          />
          <label className="task-date-field">
            Start
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="task-date-field">
            Due
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </label>
          <label className="task-select-field">
            Depends on
            <select value={dependsOn} onChange={(e) => setDependsOn(e.target.value)}>
              <option value="">None</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Add</button>
        </form>
      )}

      {error && <p className="error">{error}</p>}

      {tasksExpanded && (
        <ul className="task-list">
          {loading && <li className="empty">Loading...</li>}
          {!loading &&
            tasks.map((task) => (
              <li key={task.id} className={task.completed ? 'completed' : ''}>
                <div className="task-row-main">
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
                </div>
                <div className="task-dates">
                  <label className="task-date-field">
                    Start
                    <input
                      type="date"
                      value={task.start_date || ''}
                      onChange={(e) => updateTaskField(task, 'start_date', e.target.value)}
                    />
                  </label>
                  <label className="task-date-field">
                    Due
                    <input
                      type="date"
                      value={task.due_date || ''}
                      onChange={(e) => updateTaskField(task, 'due_date', e.target.value)}
                    />
                  </label>
                  <label className="task-select-field">
                    Depends on
                    <select
                      value={task.depends_on || ''}
                      onChange={(e) => updateTaskField(task, 'depends_on', e.target.value)}
                    >
                      <option value="">None</option>
                      {tasks
                        .filter((t) => t.id !== task.id)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
              </li>
            ))}
          {!loading && tasks.length === 0 && (
            <li className="empty">No tasks yet</li>
          )}
        </ul>
      )}

      {!loading && <GanttChart project={currentProject} tasks={tasks} />}

      <h2 className="tasks-heading">Documents</h2>

      {docsLoading && <p className="charter-status">Loading...</p>}

      {!docsLoading && (
        <ul className="doc-checklist">
          {DOCUMENT_TYPES.map((docType) => {
            const doc = docs[docType.key]
            const isDone = doc != null
            return (
              <li key={docType.key}>
                <button
                  type="button"
                  className={`doc-checklist-row ${activeDocKey === docType.key ? 'selected' : ''}`}
                  onClick={() =>
                    isDone
                      ? setActiveDocKey((prev) => (prev === docType.key ? null : docType.key))
                      : setActiveFlowKey(docType.key)
                  }
                >
                  <span className="doc-checklist-label">{docType.label}</span>
                  <span className={`doc-status-badge ${isDone ? 'done' : 'pending'}`}>
                    {isDone ? 'Generated' : 'Not started'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {activeDocType &&
        docs[activeDocType.key] &&
        (() => {
          const { ViewComponent, docProp } = activeDocType
          return (
            <ViewComponent
              project={currentProject}
              {...{ [docProp]: docs[activeDocType.key] }}
              {...activeDocType.context(docs)}
              onUpdate={(updatedRow) => handleDocUpdated(activeDocType, updatedRow)}
            />
          )
        })()}

      {activeFlowType &&
        (() => {
          const { FlowComponent } = activeFlowType
          return (
            <FlowComponent
              project={currentProject}
              {...activeFlowType.context(docs)}
              onGenerated={(result, answerList) =>
                handleDocGenerated(activeFlowType, result, answerList)
              }
              onClose={() => setActiveFlowKey(null)}
            />
          )
        })()}
    </div>
  )
}

export default ProjectDetail
