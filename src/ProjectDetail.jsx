import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabaseClient'
import AppHeader from './AppHeader'
import GanttChart from './GanttChart'
import MilestonesView from './MilestonesView'
import BacklogView from './BacklogView'
import SprintBoardView from './SprintBoardView'
import SprintRetroView from './SprintRetroView'
import TaskGenFlow from './TaskGenFlow'
import BacklogGenFlow from './BacklogGenFlow'
import MilestoneGenFlow from './MilestoneGenFlow'
import TaskImportFlow from './TaskImportFlow'
import ManageAccess from './ManageAccess'
import { DOCUMENT_TYPES, groupDocumentTypes } from './documentTypes'
import { METHODOLOGY_LABELS } from './methodology'

function ProjectDetail({ project, isOwner, canEdit }) {
  const [currentProject, setCurrentProject] = useState(project)
  const [archiving, setArchiving] = useState(false)
  const [tasks, setTasks] = useState([])
  const [sprints, setSprints] = useState([])
  const [retros, setRetros] = useState([])
  const [milestones, setMilestones] = useState([])
  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [dependsOn, setDependsOn] = useState('')
  const [milestoneId, setMilestoneId] = useState('')
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
  // Which single Documents group (e.g. 'communications') is expanded. A
  // separate, independent accordion slot from expandedSection/activeFlowKey
  // for the same reason those two are separate: expanding a group shouldn't
  // collapse whichever doc's view/flow happens to be open inside it.
  const [expandedGroup, setExpandedGroup] = useState(null)

  function toggleSection(key) {
    setExpandedSection((prev) => (prev === key ? null : key))
  }

  function toggleGroup(key) {
    setExpandedGroup((prev) => (prev === key ? null : key))
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

    async function loadSprints() {
      const { data, error } = await supabase
        .from('sprints')
        .select('*')
        .eq('project_id', currentProject.id)
        .order('start_date', { ascending: true })

      if (error) {
        setError(error.message)
        return
      }
      setSprints(data)

      const sprintIds = data.map((s) => s.id)
      if (sprintIds.length === 0) {
        setRetros([])
        return
      }

      const { data: retroData, error: retroError } = await supabase
        .from('sprint_retros')
        .select('*')
        .in('sprint_id', sprintIds)

      if (retroError) setError(retroError.message)
      else setRetros(retroData)
    }

    async function loadMilestones() {
      const { data, error } = await supabase
        .from('milestones')
        .select('*')
        .eq('project_id', currentProject.id)
        .order('start_date', { ascending: true })

      if (error) setError(error.message)
      else setMilestones(data)
    }

    async function loadDocs() {
      const results = await Promise.all(
        DOCUMENT_TYPES.map((docType) => {
          const query = supabase
            .from(docType.table)
            .select('*')
            .eq('project_id', currentProject.id)

          // Repeatable doc types (e.g. Status Update) are a dated history -
          // many rows per project - rather than the one-row-per-project
          // shape every other doc type uses, so they load as an array
          // ordered most-recent-first instead of a single row.
          return docType.repeatable
            ? query.order('created_at', { ascending: false })
            : query.maybeSingle()
        })
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
    loadSprints()
    loadMilestones()
    loadDocs()
  }, [currentProject.id])

  async function handleDocGenerated(docType, result, answerList) {
    const { data, error } = await supabase
      .from(docType.table)
      .insert({
        project_id: currentProject.id,
        ...docType.buildInsert(result),
        ...(docType.repeatable ? {} : { qa_answers: answerList }),
      })
      .select()
      .single()

    if (error) {
      return error.message
    }

    setDocs((prev) => ({
      ...prev,
      [docType.key]: docType.repeatable ? [data, ...(prev[docType.key] || [])] : data,
    }))
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
        milestone_id: currentProject.methodology !== 'agile' ? milestoneId || null : null,
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
    setMilestoneId('')
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

  function isDocDone(docType, doc) {
    return docType.repeatable ? (doc?.length ?? 0) > 0 : doc != null
  }

  function renderDocRow(docType) {
    const doc = docs[docType.key]
    const isRepeatable = !!docType.repeatable
    const isDone = isDocDone(docType, doc)
    // A doc type's `available` gate only blocks *starting* it - once
    // something exists, it keeps rendering normally even if the gate would
    // now say no (e.g. the project got unarchived after a post-mortem was
    // already written).
    const isLocked = !!docType.available && !docType.available(currentProject) && !isDone

    if (isLocked) {
      return (
        <li key={docType.key} className="doc-checklist-item">
          <div
            className="doc-checklist-row doc-checklist-row-locked"
            title="Available once the project is archived"
          >
            <span className="doc-checklist-label">
              <span className="status-dot pending" aria-hidden="true" />
              {docType.label}
            </span>
            <span className="doc-status-badge pending">Locked</span>
          </div>
        </li>
      )
    }

    const isViewOpen = expandedSection === docType.key
    const isFlowOpen = activeFlowKey === docType.key
    const { ViewComponent, FlowComponent, docProp } = docType
    const customBadge = docType.badgeFor ? docType.badgeFor(doc) : null
    const badgeColorClass = customBadge ? customBadge.colorClass : isDone ? 'done' : 'pending'
    const badgeLabel = customBadge
      ? customBadge.label
      : isRepeatable
        ? `${doc?.length ?? 0} logged`
        : isDone
          ? 'Generated'
          : 'Not started'

    return (
      <li key={docType.key} className="doc-checklist-item">
        {isRepeatable ? (
          <div className="doc-checklist-row-group">
            <button
              type="button"
              className={`doc-checklist-row ${isViewOpen || isFlowOpen ? 'selected' : ''}`}
              onClick={() => toggleSection(docType.key)}
            >
              <span className="doc-checklist-label">
                <span className={`status-dot ${badgeColorClass}`} aria-hidden="true" />
                {docType.label}
              </span>
              <span className={`doc-status-badge ${badgeColorClass}`}>
                {badgeLabel}
              </span>
            </button>
            {canEdit && (
              <button
                type="button"
                className="btn-secondary status-update-log-trigger"
                onClick={() => setActiveFlowKey((prev) => (prev === docType.key ? null : docType.key))}
              >
                + {docType.actionLabel}
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            className={`doc-checklist-row ${isViewOpen || isFlowOpen ? 'selected' : ''}`}
            onClick={() => {
              if (isDone) {
                toggleSection(docType.key)
              } else if (canEdit) {
                setActiveFlowKey((prev) => (prev === docType.key ? null : docType.key))
              }
            }}
          >
            <span className="doc-checklist-label">
              <span className={`status-dot ${badgeColorClass}`} aria-hidden="true" />
              {docType.label}
            </span>
            <span className={`doc-status-badge ${badgeColorClass}`}>
              {badgeLabel}
            </span>
          </button>
        )}

        {isViewOpen && doc && (
          <ViewComponent
            project={currentProject}
            {...{ [docProp]: doc }}
            {...docType.context(docs, tasks)}
            canEdit={canEdit}
            onUpdate={(updatedRow) => handleDocUpdated(docType, updatedRow)}
          />
        )}

        {isFlowOpen && canEdit && (
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
  }

  return (
    <div className="app">
      <AppHeader />

      <Link to="/projects" className="btn-secondary back-link">
        &larr; Back to projects
      </Link>

      <div className="section-header project-detail-header">
        <h2 className="page-title">{currentProject.name}</h2>
        {canEdit && (
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
        )}
      </div>
      <p className="project-goal">{currentProject.goal}</p>
      <div className="project-meta">
        <span className="methodology-badge">
          {METHODOLOGY_LABELS[currentProject.methodology] ?? currentProject.methodology}
        </span>
        <span className={`priority-badge ${currentProject.priority.toLowerCase()}`}>
          {currentProject.priority}
        </span>
        {currentProject.status === 'Archived' && (
          <span className="status-badge archived">Archived</span>
        )}
        <span>{currentProject.deadline ?? 'TBD'}</span>
      </div>

      {isOwner && (
        <>
          <h2 className="tasks-heading">
            <button
              type="button"
              className="collapsible-toggle"
              onClick={() => toggleSection('access')}
              aria-expanded={expandedSection === 'access'}
            >
              <span className={`chevron ${expandedSection === 'access' ? '' : 'collapsed'}`} aria-hidden="true">
                ▾
              </span>
              Manage Access
            </button>
          </h2>

          {expandedSection === 'access' && <ManageAccess project={currentProject} />}
        </>
      )}

      <h2 className="tasks-heading">
        <button
          type="button"
          className="collapsible-toggle toggle-header-with-badge"
          onClick={() => toggleSection('tasks')}
          aria-expanded={expandedSection === 'tasks'}
        >
          <span className="toggle-header-main">
            <span className={`chevron ${expandedSection === 'tasks' ? '' : 'collapsed'}`} aria-hidden="true">
              ▾
            </span>
            <span className={`status-dot ${tasks.length > 0 ? 'done' : 'pending'}`} aria-hidden="true" />
            Tasks
          </span>
          <span className={`doc-status-badge ${tasks.length > 0 ? 'done' : 'pending'}`}>
            {tasks.length > 0 ? `${tasks.length} Task${tasks.length === 1 ? '' : 's'}` : 'Not started'}
          </span>
        </button>
      </h2>

      {docs.charter && canEdit && currentProject.methodology !== 'agile' && (
        <button
          type="button"
          className="btn-secondary ai-task-gen-trigger"
          onClick={() => toggleSection('ai-milestones')}
        >
          {milestones.length > 0 ? 'Generate More Milestones from Charter' : 'Generate Milestones from Charter'}
        </button>
      )}

      {docs.charter && canEdit && currentProject.methodology !== 'agile' && (
        <button
          type="button"
          className="btn-secondary ai-task-gen-trigger"
          onClick={() => toggleSection('ai-tasks')}
        >
          {tasks.length > 0 ? 'Generate More Tasks from Charter' : 'Generate Starter Tasks from Charter'}
        </button>
      )}

      {canEdit && currentProject.methodology !== 'agile' && (
        <button
          type="button"
          className="btn-secondary ai-task-gen-trigger"
          onClick={() => toggleSection('import-tasks')}
        >
          Import from Excel
        </button>
      )}

      {docs.charter && canEdit && currentProject.methodology !== 'waterfall' && (
        <button
          type="button"
          className="btn-secondary ai-task-gen-trigger"
          onClick={() => toggleSection('ai-backlog')}
        >
          Generate Backlog from Charter
        </button>
      )}

      {docs.charter && canEdit && currentProject.methodology === 'hybrid' && (
        <p className="charter-status">
          Milestones, Waterfall tasks, and Backlog items are separate, non-overlapping actions -
          generating one doesn&rsquo;t touch the others, whether or not you&rsquo;ve already run
          Task Gen or Backlog Gen.
        </p>
      )}

      {expandedSection === 'ai-milestones' && canEdit && (
        <MilestoneGenFlow
          project={currentProject}
          charter={docs.charter}
          brief={docs.requirements_brief}
          riskLog={docs.risk_log}
          existingMilestones={milestones.map((m) => ({ id: m.id, name: m.name, start_date: m.start_date, end_date: m.end_date }))}
          onCommitted={(insertedMilestones) => setMilestones((prev) => [...prev, ...insertedMilestones])}
          onDone={() => setExpandedSection('milestones')}
          onCancel={() => setExpandedSection((prev) => (prev === 'ai-milestones' ? null : prev))}
        />
      )}

      {expandedSection === 'ai-tasks' && canEdit && (
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

      {expandedSection === 'import-tasks' && canEdit && (
        <TaskImportFlow
          project={currentProject}
          existingTasks={tasks.map((t) => ({ id: t.id, title: t.title }))}
          onCommitted={(insertedTasks) => setTasks((prev) => [...prev, ...insertedTasks])}
          onDone={() => setExpandedSection('tasks')}
          onCancel={() => setExpandedSection((prev) => (prev === 'import-tasks' ? null : prev))}
        />
      )}

      {expandedSection === 'ai-backlog' && canEdit && (
        <BacklogGenFlow
          project={currentProject}
          charter={docs.charter}
          brief={docs.requirements_brief}
          riskLog={docs.risk_log}
          existingBacklogItems={tasks
            .filter((t) => t.backlog_status != null)
            .map((t) => ({ id: t.id, title: t.title, story_points: t.story_points, backlog_rank: t.backlog_rank }))}
          onCommitted={(insertedTasks) => setTasks((prev) => [...prev, ...insertedTasks])}
          onDone={() => setExpandedSection('backlog')}
          onCancel={() => setExpandedSection((prev) => (prev === 'ai-backlog' ? null : prev))}
        />
      )}

      {expandedSection === 'tasks' && canEdit && (
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
          {currentProject.methodology !== 'agile' && (
            <label className="task-select-field">
              Milestone
              <select value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)}>
                <option value="">None</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          )}
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
                      disabled={!canEdit}
                      onChange={() => toggleComplete(task)}
                    />
                    <span>{task.title}</span>
                  </label>
                  {canEdit && (
                    <button
                      type="button"
                      className="delete"
                      onClick={() => deleteTask(task)}
                    >
                      Delete
                    </button>
                  )}
                </div>
                <div className="task-dates">
                  <label className="task-date-field">
                    Start
                    <input
                      type="date"
                      value={task.start_date || ''}
                      disabled={!canEdit}
                      onChange={(e) => updateTaskField(task, 'start_date', e.target.value)}
                    />
                  </label>
                  <label className="task-date-field">
                    Due
                    <input
                      type="date"
                      value={task.due_date || ''}
                      disabled={!canEdit}
                      onChange={(e) => updateTaskField(task, 'due_date', e.target.value)}
                    />
                  </label>
                  <label className="task-select-field">
                    Depends on
                    <select
                      value={task.depends_on || ''}
                      disabled={!canEdit}
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
                  {currentProject.methodology !== 'agile' && (
                    <label className="task-select-field">
                      Milestone
                      <select
                        value={task.milestone_id || ''}
                        disabled={!canEdit}
                        onChange={(e) => updateTaskField(task, 'milestone_id', e.target.value)}
                      >
                        <option value="">None</option>
                        {milestones.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              </li>
            ))}
          {!loading && tasks.length === 0 && (
            <li className="empty">No tasks yet</li>
          )}
        </ul>
      )}

      {!loading && currentProject.methodology !== 'agile' && (
        <MilestonesView
          project={currentProject}
          milestones={milestones}
          setMilestones={setMilestones}
          canEdit={canEdit}
          expanded={expandedSection === 'milestones'}
          onToggle={() => toggleSection('milestones')}
        />
      )}

      {!loading && currentProject.methodology !== 'agile' && (
        <GanttChart
          project={currentProject}
          tasks={tasks.filter((t) => t.backlog_status == null)}
          expanded={expandedSection === 'gantt'}
          onToggle={() => toggleSection('gantt')}
        />
      )}

      {!loading && currentProject.methodology !== 'waterfall' && (
        <BacklogView
          project={currentProject}
          tasks={tasks}
          setTasks={setTasks}
          sprints={sprints}
          milestones={milestones}
          canEdit={canEdit}
          expanded={expandedSection === 'backlog'}
          onToggle={() => toggleSection('backlog')}
        />
      )}

      {!loading && currentProject.methodology !== 'waterfall' && (
        <SprintBoardView
          project={currentProject}
          tasks={tasks}
          setTasks={setTasks}
          sprints={sprints}
          setSprints={setSprints}
          milestones={milestones}
          canEdit={canEdit}
          expanded={expandedSection === 'sprint-board'}
          onToggle={() => toggleSection('sprint-board')}
        />
      )}

      {!loading && currentProject.methodology !== 'waterfall' && (
        <SprintRetroView
          project={currentProject}
          sprints={sprints}
          retros={retros}
          setRetros={setRetros}
          tasks={tasks}
          canEdit={canEdit}
          expanded={expandedSection === 'sprint-retro'}
          onToggle={() => toggleSection('sprint-retro')}
        />
      )}

      <h2 className="tasks-heading">Documents</h2>

      {docsLoading && <p className="charter-status">Loading...</p>}

      {!docsLoading && (
        <ul className="doc-checklist">
          {groupDocumentTypes(DOCUMENT_TYPES).map((row) => {
            if (row.type === 'doc') return renderDocRow(row.docType)

            const isGroupOpen = expandedGroup === row.key
            const doneCount = row.items.filter((docType) => isDocDone(docType, docs[docType.key])).length
            const groupStatus =
              doneCount === 0 ? 'pending' : doneCount === row.items.length ? 'done' : 'partial'
            const groupStatusLabel =
              groupStatus === 'done' ? 'Generated' : groupStatus === 'partial' ? 'In Progress' : 'Not started'

            return (
              <li key={row.key} className="doc-checklist-item doc-group">
                <button
                  type="button"
                  className="collapsible-toggle doc-group-header toggle-header-with-badge"
                  onClick={() => toggleGroup(row.key)}
                  aria-expanded={isGroupOpen}
                >
                  <span className="toggle-header-main">
                    <span className={`chevron ${isGroupOpen ? '' : 'collapsed'}`} aria-hidden="true">
                      ▾
                    </span>
                    <span className="doc-checklist-label">
                      <span className={`status-dot ${groupStatus}`} aria-hidden="true" />
                      {row.label}
                    </span>
                  </span>
                  <span className={`doc-status-badge ${groupStatus}`}>{groupStatusLabel}</span>
                </button>

                {isGroupOpen && (
                  <ul className="doc-checklist doc-group-items">
                    {row.items.map((docType) => renderDocRow(docType))}
                  </ul>
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
