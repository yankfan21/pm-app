import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabaseClient'
import AppHeader from './AppHeader'
import GanttChart from './GanttChart'
import MilestonesView from './MilestonesView'
import PhaseDetailView from './PhaseDetailView'
import BacklogView from './BacklogView'
import SprintBoardView from './SprintBoardView'
import SprintRetroView from './SprintRetroView'
import TaskGenFlow from './TaskGenFlow'
import BacklogGenFlow from './BacklogGenFlow'
import MilestoneGenFlow from './MilestoneGenFlow'
import TaskImportFlow from './TaskImportFlow'
import ManageAccess from './ManageAccess'
import { DOCUMENT_TYPES, groupDocumentTypes } from './documentTypes'
import { METHODOLOGIES, METHODOLOGY_LABELS } from './methodology'
import { DEFAULT_PHASES } from './phases'

// The Tasks header's own key ('tasks') plus every sub-flow that renders
// underneath it - all three "Generate.../Import from Excel" buttons swap
// expandedSection to one of these instead of 'tasks' while their flow is
// open. Milestones/Phases/Gantt Chart don't have this problem: none of
// them trigger a sub-flow that changes expandedSection to something other
// than their own key, so their chevrons don't need the same treatment.
// Used only to decide whether the Tasks header's chevron/aria-expanded
// should read as open - doesn't change what any button does.
const TASKS_SECTION_KEYS = ['tasks', 'ai-milestones', 'ai-tasks', 'import-tasks']

// Which "side" (Waterfall: Milestones/Tasks/Gantt, Agile: Backlog/Sprint
// Board/Sprint Retro) is visible for a given methodology. Hybrid shows
// both - this is the single source of truth both the section gating below
// and the type-switch data warning are built from, so they can't drift
// out of sync with each other.
function visibleSides(methodology) {
  return {
    waterfall: methodology !== 'agile',
    agile: methodology !== 'waterfall',
  }
}

// Builds the confirmation message for switching methodology when doing so
// would hide a side that currently has real data on it - null if nothing
// would be hidden (either the target side is still visible, e.g. anything
// switching to Hybrid, or the side being hidden is already empty).
function buildMethodologySwitchWarning(fromMethodology, toMethodology, counts) {
  const before = visibleSides(fromMethodology)
  const after = visibleSides(toMethodology)
  const messages = []

  if (before.waterfall && !after.waterfall) {
    const bits = []
    if (counts.milestoneCount > 0) {
      bits.push(`${counts.milestoneCount} milestone${counts.milestoneCount === 1 ? '' : 's'}`)
    }
    if (counts.waterfallTaskCount > 0) {
      bits.push(`${counts.waterfallTaskCount} Waterfall task${counts.waterfallTaskCount === 1 ? '' : 's'}`)
    }
    if (bits.length > 0) {
      messages.push(
        `This project has ${bits.join(' and ')}. Switching to ${METHODOLOGY_LABELS[toMethodology]} will hide the Milestones, Phases, Waterfall Tasks, and Gantt Chart sections.`
      )
    }
  }

  if (before.agile && !after.agile) {
    const bits = []
    if (counts.backlogCount > 0) {
      bits.push(`${counts.backlogCount} backlog item${counts.backlogCount === 1 ? '' : 's'}`)
    }
    if (counts.sprintCount > 0) {
      bits.push(`${counts.sprintCount} sprint${counts.sprintCount === 1 ? '' : 's'}`)
    }
    if (counts.retroCount > 0) {
      bits.push(`${counts.retroCount} sprint retro${counts.retroCount === 1 ? '' : 's'}`)
    }
    if (bits.length > 0) {
      messages.push(
        `This project has ${bits.join(', ')}. Switching to ${METHODOLOGY_LABELS[toMethodology]} will hide the Backlog, Sprint Board, and Sprint Retro sections.`
      )
    }
  }

  if (messages.length === 0) return null
  return `${messages.join(' ')} Your data won't be deleted - switching back to a type that shows it will bring it back exactly as it was.`
}

function ProjectDetail({ project, isOwner, canEdit }) {
  const [currentProject, setCurrentProject] = useState(project)
  const [archiving, setArchiving] = useState(false)
  const [tasks, setTasks] = useState([])
  const [sprints, setSprints] = useState([])
  const [retros, setRetros] = useState([])
  const [milestones, setMilestones] = useState([])
  const [phases, setPhases] = useState([])
  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [dependsOn, setDependsOn] = useState('')
  const [milestoneId, setMilestoneId] = useState('')
  const [phaseId, setPhaseId] = useState('')
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

    async function loadPhases() {
      const { data, error } = await supabase
        .from('phases')
        .select('*')
        .eq('project_id', currentProject.id)
        .order('phase_number', { ascending: true })

      if (error) setError(error.message)
      else setPhases(data)
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
    loadPhases()
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
        phase_id: currentProject.methodology !== 'agile' ? phaseId || null : null,
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
    setPhaseId('')
  }

  async function toggleComplete(task) {
    const { data, error } = await supabase
      .from('tasks')
      .update({ completed: !task.completed })
      .eq('id', task.id)
      .select()

    if (error) {
      setError(error.message)
      return
    }

    // An RLS-blocked update matches 0 rows and still comes back with
    // error: null - .single() would throw on that empty result instead of
    // surfacing a usable error, so check the row count ourselves first.
    if (!data || data.length === 0) {
      setError('Update failed — you may not have permission to edit this task.')
      return
    }

    setTasks((prev) => prev.map((t) => (t.id === task.id ? data[0] : t)))
  }

  async function updateTaskField(task, field, value) {
    const { data, error } = await supabase
      .from('tasks')
      .update({ [field]: value || null })
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

  async function handleMethodologyChange(nextMethodology) {
    if (nextMethodology === currentProject.methodology) return

    const warning = buildMethodologySwitchWarning(currentProject.methodology, nextMethodology, {
      milestoneCount: milestones.length,
      waterfallTaskCount: tasks.filter((t) => t.backlog_status == null).length,
      backlogCount: tasks.filter((t) => t.backlog_status != null).length,
      sprintCount: sprints.length,
      retroCount: retros.length,
    })

    if (warning && !window.confirm(`${warning}\n\nContinue?`)) return

    setError(null)
    const { data, error } = await supabase
      .from('projects')
      .update({ methodology: nextMethodology, updated_at: new Date().toISOString() })
      .eq('id', currentProject.id)
      .select()
      .single()

    if (error) {
      setError(error.message)
      return
    }

    setCurrentProject(data)

    // A project that started Agile (so was never seeded by the wizard or
    // the phases_schema.sql backfill) now needs its 4 phases too, the same
    // best-effort way NewProjectFlow seeds a brand-new project - it's fine
    // if this fails, same reasoning as there.
    if (nextMethodology !== 'agile' && phases.length === 0) {
      const { data: seeded, error: phaseError } = await supabase
        .from('phases')
        .insert(DEFAULT_PHASES.map((p) => ({ project_id: currentProject.id, ...p })))
        .select()

      if (phaseError) console.error('Failed to seed phases on methodology switch:', phaseError.message)
      else setPhases(seeded)
    }
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
              className={`doc-checklist-row ${badgeColorClass} ${isViewOpen || isFlowOpen ? 'selected' : ''}`}
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
            className={`doc-checklist-row ${badgeColorClass} ${isViewOpen || isFlowOpen ? 'selected' : ''}`}
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
            {...docType.context(docs, tasks, { sprints, retros, milestones })}
            canEdit={canEdit}
            onUpdate={(updatedRow) => handleDocUpdated(docType, updatedRow)}
          />
        )}

        {isFlowOpen && canEdit && (
          <FlowComponent
            project={currentProject}
            {...docType.context(docs, tasks, { sprints, retros, milestones })}
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

      <div className="app-body">
      <Link to="/projects" className="btn-secondary back-link">
        &larr; Back to projects
      </Link>

      {currentProject.is_demo && (
        <div className="demo-banner">
          <span className="demo-banner-icon" aria-hidden="true">
            ✦
          </span>
          <p>
            You&rsquo;re exploring a shared demo project &mdash; it resets nightly so everyone gets a
            fresh look. Try generating a document or two!
          </p>
        </div>
      )}

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
        {canEdit ? (
          <select
            className="methodology-badge methodology-badge-select"
            aria-label="Methodology"
            value={currentProject.methodology}
            onChange={(e) => handleMethodologyChange(e.target.value)}
          >
            {METHODOLOGIES.map((m) => (
              <option key={m} value={m}>
                {METHODOLOGY_LABELS[m] ?? m}
              </option>
            ))}
          </select>
        ) : (
          <span className="methodology-badge">
            {METHODOLOGY_LABELS[currentProject.methodology] ?? currentProject.methodology}
          </span>
        )}
        <span className={`priority-badge ${currentProject.priority.toLowerCase()}`}>
          {currentProject.priority}
        </span>
        {currentProject.status === 'Archived' && (
          <span className="status-badge archived">Archived</span>
        )}
        <span>{currentProject.deadline ?? 'TBD'}</span>
      </div>

      {isOwner && (
        <div className="detail-zone">
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
        </div>
      )}

      {!loading && currentProject.methodology !== 'agile' && (
        <PhaseDetailView
          phases={phases}
          setPhases={setPhases}
          canEdit={canEdit}
          expanded={expandedSection === 'phases'}
          onToggle={() => toggleSection('phases')}
        />
      )}

      {currentProject.methodology !== 'agile' && (
        <h2 className="tasks-heading">
          <button
            type="button"
            className="collapsible-toggle toggle-header-with-badge"
            onClick={() => toggleSection('tasks')}
            aria-expanded={TASKS_SECTION_KEYS.includes(expandedSection)}
          >
            <span className="toggle-header-main">
              <span className={`chevron ${TASKS_SECTION_KEYS.includes(expandedSection) ? '' : 'collapsed'}`} aria-hidden="true">
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
      )}

      {expandedSection === 'tasks' && docs.charter && canEdit && currentProject.methodology !== 'agile' && (
        <button
          type="button"
          className="btn-secondary ai-task-gen-trigger"
          onClick={() => toggleSection('ai-milestones')}
        >
          {milestones.length > 0 ? 'Generate More Milestones from Charter' : 'Generate Milestones from Charter'}
        </button>
      )}

      {expandedSection === 'tasks' && docs.charter && canEdit && currentProject.methodology !== 'agile' && (
        <button
          type="button"
          className="btn-secondary ai-task-gen-trigger"
          onClick={() => toggleSection('ai-tasks')}
        >
          {tasks.length > 0 ? 'Generate More Tasks from Charter' : 'Generate Starter Tasks from Charter'}
        </button>
      )}

      {expandedSection === 'tasks' && canEdit && currentProject.methodology !== 'agile' && (
        <button
          type="button"
          className="btn-secondary ai-task-gen-trigger"
          onClick={() => toggleSection('import-tasks')}
        >
          Import from Excel
        </button>
      )}

      {expandedSection === 'tasks' && docs.charter && canEdit && currentProject.methodology === 'hybrid' && (
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

      {currentProject.methodology !== 'agile' && expandedSection === 'tasks' && canEdit && (
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
          {currentProject.methodology !== 'agile' && (
            <label className="task-select-field">
              Phase
              <select value={phaseId} onChange={(e) => setPhaseId(e.target.value)}>
                <option value="">None</option>
                {phases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.phase_number}. {p.phase_name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="submit">Add</button>
        </form>
      )}

      {error && <p className="error">{error}</p>}

      {currentProject.methodology !== 'agile' && expandedSection === 'tasks' && (
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
                  {currentProject.methodology !== 'agile' && (
                    <label className="task-select-field">
                      Phase
                      <select
                        value={task.phase_id || ''}
                        disabled={!canEdit}
                        onChange={(e) => updateTaskField(task, 'phase_id', e.target.value)}
                      >
                        <option value="">None</option>
                        {phases.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.phase_number}. {p.phase_name}
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
          phases={phases}
          expanded={expandedSection === 'gantt'}
          onToggle={() => toggleSection('gantt')}
        />
      )}

      {!loading && currentProject.methodology !== 'waterfall' && (
        <div className="agile-zone">
          <BacklogView
            project={currentProject}
            tasks={tasks}
            setTasks={setTasks}
            sprints={sprints}
            milestones={milestones}
            canEdit={canEdit}
            expanded={expandedSection === 'backlog'}
            onToggle={() => toggleSection('backlog')}
            canGenerateBacklog={!!docs.charter && canEdit}
            onGenerateBacklog={() => toggleSection('ai-backlog')}
          />

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
        </div>
      )}

      <div className="detail-zone">
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
                  className={`collapsible-toggle doc-group-header toggle-header-with-badge ${groupStatus}`}
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
      </div>
    </div>
  )
}

export default ProjectDetail
