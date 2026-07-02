import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import AppHeader from './AppHeader'
import CharterFlow from './CharterFlow'
import CharterView from './CharterView'
import RequirementsFlow from './RequirementsFlow'
import RequirementsView from './RequirementsView'
import RiskLogFlow from './RiskLogFlow'
import RiskLogView from './RiskLogView'

function ProjectDetail({ project, onBack, onProjectUpdated, onHome }) {
  const [currentProject, setCurrentProject] = useState(project)
  const [archiving, setArchiving] = useState(false)
  const [tasks, setTasks] = useState([])
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [charter, setCharter] = useState(null)
  const [charterLoading, setCharterLoading] = useState(true)
  const [showCharterFlow, setShowCharterFlow] = useState(false)

  const [requirementsBrief, setRequirementsBrief] = useState(null)
  const [requirementsLoading, setRequirementsLoading] = useState(true)
  const [showRequirementsFlow, setShowRequirementsFlow] = useState(false)

  const [riskLog, setRiskLog] = useState(null)
  const [riskLogLoading, setRiskLogLoading] = useState(true)
  const [showRiskLogFlow, setShowRiskLogFlow] = useState(false)

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

    async function loadRequirementsBrief() {
      const { data, error } = await supabase
        .from('requirements_briefs')
        .select('*')
        .eq('project_id', currentProject.id)
        .maybeSingle()

      if (error) setError(error.message)
      else setRequirementsBrief(data)
      setRequirementsLoading(false)
    }

    async function loadRiskLog() {
      const { data, error } = await supabase
        .from('risk_logs')
        .select('*')
        .eq('project_id', currentProject.id)
        .maybeSingle()

      if (error) setError(error.message)
      else setRiskLog(data)
      setRiskLogLoading(false)
    }

    loadTasks()
    loadCharter()
    loadRequirementsBrief()
    loadRiskLog()
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

  async function handleRequirementsGenerated(sections, answerList) {
    const { data, error } = await supabase
      .from('requirements_briefs')
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

    setRequirementsBrief(data)
    setShowRequirementsFlow(false)
    return null
  }

  async function handleRiskLogGenerated(risks, answerList) {
    const { data, error } = await supabase
      .from('risk_logs')
      .insert({
        project_id: currentProject.id,
        risks,
        qa_answers: answerList,
      })
      .select()
      .single()

    if (error) {
      return error.message
    }

    setRiskLog(data)
    setShowRiskLogFlow(false)
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
      <AppHeader onHome={onHome} />

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

      {(charterLoading || requirementsLoading || riskLogLoading) && (
        <p className="charter-status">Loading...</p>
      )}

      {!charterLoading &&
        !requirementsLoading &&
        !riskLogLoading &&
        (!charter || !requirementsBrief || !riskLog) && (
          <div className="section-header charter-header">
            <h3 className="charter-heading">Documents</h3>
            <div className="charter-actions">
              {!charter && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setShowCharterFlow(true)}
                >
                  Generate Charter
                </button>
              )}
              {!requirementsBrief && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setShowRequirementsFlow(true)}
                >
                  Generate Requirements Brief
                </button>
              )}
              {!riskLog && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setShowRiskLogFlow(true)}
                >
                  Generate Risk Log
                </button>
              )}
            </div>
          </div>
        )}

      {!charterLoading && charter && (
        <CharterView
          project={currentProject}
          charter={charter}
          onUpdate={setCharter}
        />
      )}

      {!requirementsLoading && requirementsBrief && (
        <RequirementsView
          project={currentProject}
          charter={charter}
          brief={requirementsBrief}
          onUpdate={setRequirementsBrief}
        />
      )}

      {!riskLogLoading && riskLog && (
        <RiskLogView
          project={currentProject}
          charter={charter}
          brief={requirementsBrief}
          riskLog={riskLog}
          onUpdate={setRiskLog}
        />
      )}

      {showCharterFlow && (
        <CharterFlow
          project={currentProject}
          onGenerated={handleCharterGenerated}
          onClose={() => setShowCharterFlow(false)}
        />
      )}

      {showRequirementsFlow && (
        <RequirementsFlow
          project={currentProject}
          charter={charter}
          onGenerated={handleRequirementsGenerated}
          onClose={() => setShowRequirementsFlow(false)}
        />
      )}

      {showRiskLogFlow && (
        <RiskLogFlow
          project={currentProject}
          charter={charter}
          brief={requirementsBrief}
          onGenerated={handleRiskLogGenerated}
          onClose={() => setShowRiskLogFlow(false)}
        />
      )}
    </div>
  )
}

export default ProjectDetail
