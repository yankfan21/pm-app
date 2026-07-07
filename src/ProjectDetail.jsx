import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabaseClient'
import AppHeader from './AppHeader'
import GanttChart from './GanttChart'
import TaskGenFlow from './TaskGenFlow'
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

  const [docs, setDocs] = useState({})
  const [docsLoading, setDocsLoading] = useState(true)
  // Which single section is expanded ('tasks' | 'gantt' | 'ai-tasks' | a
  // DOCUMENT_TYPES key | null). One value, not a set, so opening any section
  // collapses whatever was previously open - an accordion across the whole
  // page. Every section starts collapsed, and this state is local to
  // ProjectDetail, so leaving the page (a route change, since
  // project-to-project navigation always goes back through the list)
  // naturally resets it on return.
  const [expandedSection, setExpandedSection] = useState(null)
  const [activeFlowKey, setActiveFlowKey] = useState(null)

  function toggleSection(key) {
    setExpandedSection((prev) => (prev === key ? null : key))
  }

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
    setExpandedSection(docType.key)
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
          onClick={() => toggleSection('tasks')}
          aria-expanded={expandedSection === 'tasks'}
        >
          <span className={`chevron ${expandedSection === 'tasks' ? '' : 'collapsed'}`} aria-hidden="true">
            ▾
          </span>
          <span className={`status-dot ${tasks.length > 0 ? 'done' : 'pending'}`} aria-hidden="true" />
          Tasks
        </button>
      </h2>

      {docs.charter && (
        <button
          type="button"
          className="btn-secondary ai-task-gen-trigger"
          onClick={() => toggleSection('ai-tasks')}
        >
          {tasks.length > 0 ? 'Generate More Tasks from Charter' : 'Generate Starter Tasks from Charter'}
        </button>
      )}

      {expandedSection === 'ai-tasks' && (
        <TaskGenFlow
          project={currentProject}
          charter={docs.charter}
          brief={docs.requirements_brief}
          riskLog={docs.risk_log}
          existingTasks={tasks.map((t) => ({ id: t.id, title: t.title, due_date: t.due_date }))}
          onCommitted={(insertedTasks) => setTasks((prev) => [...prev, ...insertedTasks])}
          onDone={() => setExpandedSection('tasks')}
          onCancel={() => setExpandedSection((prev) => (prev === 'ai-tasks' ? null : prev))}
        />
      )}

      {expandedSection === 'tasks' && (
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

      {expandedSection === 'tasks' && (
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

      {!loading && (
        <GanttChart
          project={currentProject}
          tasks={tasks}
          expanded={expandedSection === 'gantt'}
          onToggle={() => toggleSection('gantt')}
        />
      )}

      <h2 className="tasks-heading">Documents</h2>

      {docsLoading && <p className="charter-status">Loading...</p>}

      {!docsLoading && (
        <ul className="doc-checklist">
          {DOCUMENT_TYPES.map((docType) => {
            const doc = docs[docType.key]
            const isDone = doc != null
            const isViewOpen = expandedSection === docType.key
            const isFlowOpen = activeFlowKey === docType.key
            const { ViewComponent, FlowComponent, docProp } = docType

            return (
              <li key={docType.key} className="doc-checklist-item">
                <button
                  type="button"
                  className={`doc-checklist-row ${isViewOpen || isFlowOpen ? 'selected' : ''}`}
                  onClick={() =>
                    isDone
                      ? toggleSection(docType.key)
                      : setActiveFlowKey((prev) => (prev === docType.key ? null : docType.key))
                  }
                >
                  <span className="doc-checklist-label">
                    <span className={`status-dot ${isDone ? 'done' : 'pending'}`} aria-hidden="true" />
                    {docType.label}
                  </span>
                  <span className={`doc-status-badge ${isDone ? 'done' : 'pending'}`}>
                    {isDone ? 'Generated' : 'Not started'}
                  </span>
                </button>

                {isViewOpen && doc && (
                  <ViewComponent
                    project={currentProject}
                    {...{ [docProp]: doc }}
                    {...docType.context(docs, tasks)}
                    onUpdate={(updatedRow) => handleDocUpdated(docType, updatedRow)}
                  />
                )}

                {isFlowOpen && (
                  <FlowComponent
                    project={currentProject}
                    {...docType.context(docs, tasks)}
                    onGenerated={(result, answerList) =>
                      handleDocGenerated(docType, result, answerList)
                    }
                    onClose={() => setActiveFlowKey(null)}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default ProjectDetail
