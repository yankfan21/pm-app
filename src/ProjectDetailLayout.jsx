import { useEffect, useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { supabase } from './supabaseClient'
import AppHeader from './AppHeader'
import ManageAccess from './ManageAccess'
import ProjectNav from './ProjectNav'
import { DOCUMENT_TYPES } from './documentTypes'
import { METHODOLOGIES, METHODOLOGY_LABELS } from './methodology'
import { DEFAULT_PHASES } from './phases'
import { useSprintSelection } from './useSprintSelection'
import { visibleSides } from './projectSections'

// Builds the confirmation message for switching methodology when doing so
// would hide a side that currently has real data on it - null if nothing
// would be hidden (either the target side is still visible, e.g. anything
// switching to Hybrid, or the side being hidden is already empty). Moved
// here verbatim from the old ProjectDetail.jsx - still only needed by
// handleMethodologyChange below.
function buildMethodologySwitchWarning(fromMethodology, toMethodology, counts) {
  const before = visibleSides(fromMethodology)
  const after = visibleSides(toMethodology)
  const messages = []

  if (before.waterfall && !after.waterfall) {
    const bits = []
    if (counts.waterfallTaskCount > 0) {
      bits.push(`${counts.waterfallTaskCount} Waterfall task${counts.waterfallTaskCount === 1 ? '' : 's'}`)
    }
    if (bits.length > 0) {
      messages.push(
        `This project has ${bits.join(' and ')}. Switching to ${METHODOLOGY_LABELS[toMethodology]} will hide the Phases, Waterfall Tasks and Milestones, and Gantt Chart sections.`
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

// Persistent layout for every /projects/:projectId/* route - owns the data
// loading/state that used to live in the old monolithic ProjectDetail.jsx
// (tasks, dependencies, sprints, retros, milestones, phases, collaborators,
// docs) plus the top-of-page chrome (back link, demo banner, title/
// methodology/priority/archive row, Manage Access), and hands all of it to
// whichever section route is currently matched via <Outlet context={...}/>
// - same layout+Outlet pattern ProjectsShell.jsx already uses for
// Dashboard/AllProjects. Nothing here re-fetches or resets when navigating
// between sections, since the state lives above the Outlet, not inside it.
//
// Task-form state and the Documents checklist's per-item expand/flow state
// used to live here too (as the single page-wide `expandedSection`
// accordion, back when this was the monolithic ProjectDetail.jsx) - both
// are now local to their own routes instead (PlanningTasksRoute.jsx,
// DocumentsRoute.jsx), since nothing else needs them. Manage Access still
// toggles independently via its own local `accessExpanded` state below,
// since it's no longer sharing that global accordion var with anything
// else.
function ProjectDetailLayout({ project, isOwner, canEdit }) {
  const [currentProject, setCurrentProject] = useState(project)
  const [archiving, setArchiving] = useState(false)
  const [accessExpanded, setAccessExpanded] = useState(false)
  const [tasks, setTasks] = useState([])
  const [taskDependencies, setTaskDependencies] = useState([])
  const [sprints, setSprints] = useState([])
  const [retros, setRetros] = useState([])
  const [milestones, setMilestones] = useState([])
  const [phases, setPhases] = useState([])
  const [collaborators, setCollaborators] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [docs, setDocs] = useState({})
  const [docsLoading, setDocsLoading] = useState(true)
  const [selectedSprintId, setSelectedSprintId] = useSprintSelection(sprints)

  useEffect(() => {
    async function loadTasks() {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('project_id', currentProject.id)
        .order('created_at', { ascending: true })

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      setTasks(data)
      setLoading(false)

      // task_dependencies has no project_id column of its own (see
      // task_dependencies_schema.sql) - scope the query through this
      // project's task ids instead.
      const taskIds = data.map((t) => t.id)
      if (taskIds.length === 0) {
        setTaskDependencies([])
        return
      }
      const { data: depData, error: depError } = await supabase
        .from('task_dependencies')
        .select('*')
        .in('task_id', taskIds)
        .order('created_at', { ascending: true })

      if (depError) setError(depError.message)
      else setTaskDependencies(depData)
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

    async function loadCollaborators() {
      const { data, error } = await supabase
        .from('project_collaborators')
        .select('*')
        .eq('project_id', currentProject.id)
        .order('created_at', { ascending: true })

      if (error) setError(error.message)
      else setCollaborators(data)
    }

    async function loadDocs() {
      const results = await Promise.all(
        DOCUMENT_TYPES.map((docType) => {
          const query = supabase
            .from(docType.table)
            .select('*')
            .eq('project_id', currentProject.id)

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
    loadCollaborators()
    loadDocs()
  }, [currentProject.id])

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
    // best-effort way NewProjectFlow seeds a brand-new project.
    if (nextMethodology !== 'agile' && phases.length === 0) {
      const { data: seeded, error: phaseError } = await supabase
        .from('phases')
        .insert(DEFAULT_PHASES.map((p) => ({ project_id: currentProject.id, ...p })))
        .select()

      if (phaseError) console.error('Failed to seed phases on methodology switch:', phaseError.message)
      else setPhases(seeded)
    }
  }

  const outletContext = {
    project: currentProject,
    isOwner,
    canEdit,
    loading,
    error,
    setError,
    tasks,
    setTasks,
    taskDependencies,
    setTaskDependencies,
    sprints,
    setSprints,
    retros,
    setRetros,
    milestones,
    setMilestones,
    phases,
    setPhases,
    collaborators,
    docs,
    setDocs,
    docsLoading,
    selectedSprintId,
    setSelectedSprintId,
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

        {/* Single-line header - this used to be a 3-row block (title+archive
            row, description paragraph, badge row) that only ever rendered
            once on the old single-scroll page. Now that ProjectDetailLayout
            persists across every section route, that same block was
            repeating on every page switch, eating vertical space each time.
            Compressed to one row; the description is truncated with an
            ellipsis (full text on hover via the native title attribute)
            rather than wrapping to its own line. */}
        <div className="project-header-bar">
          <h2 className="project-header-name">{currentProject.name}</h2>

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
          <span className="project-header-date">{currentProject.deadline ?? 'TBD'}</span>

          {currentProject.goal && (
            <span className="project-header-goal" title={currentProject.goal}>
              {currentProject.goal}
            </span>
          )}

          {canEdit && (
            <button
              type="button"
              className="btn-secondary project-header-archive"
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

        {isOwner && (
          <div className="detail-zone">
            <h2 className="tasks-heading">
              <button
                type="button"
                className="collapsible-toggle"
                onClick={() => setAccessExpanded((prev) => !prev)}
                aria-expanded={accessExpanded}
              >
                <span className={`chevron ${accessExpanded ? '' : 'collapsed'}`} aria-hidden="true">
                  ▾
                </span>
                Manage Access
              </button>
            </h2>

            {accessExpanded && <ManageAccess project={currentProject} />}
          </div>
        )}

        {error && <p className="error">{error}</p>}

        {loading ? (
          <p className="charter-status">Loading...</p>
        ) : (
          <div className="project-nav-shell">
            <ProjectNav project={currentProject} />
            <div className="project-nav-content">
              <Outlet context={outletContext} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ProjectDetailLayout
