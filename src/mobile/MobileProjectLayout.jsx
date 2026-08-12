import { useEffect, useState } from 'react'
import { Link, Outlet, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../AuthContext'
import ConfidantLogo from '../ConfidantLogo'
import AppStoreBadges from '../components/AppStoreBadges'
import { METHODOLOGY_LABELS } from '../methodology'
import MobileProjectTabBar from './MobileProjectTabBar'
import MobileDesktopLink from './MobileDesktopLink'
import './mobile.css'

// Persistent layout for every /m/projects/:projectId/* route. Deliberately
// its own minimal fetch (project row + role only) rather than reusing
// ProjectDetailPage/ProjectDetailLayout from the desktop tree - those
// eager-load every project resource (tasks, sprints, docs, etc.) for the
// desktop's all-sections-on-one-page nav. Phone screens are purpose-built
// per section, so each one (MobileProjectTasks, MobileProjectMetrics, ...)
// fetches only what it needs, once built.
function MobileProjectLayout() {
  const { projectId } = useParams()
  const { user } = useAuth()
  const [project, setProject] = useState(null)
  const [isOwner, setIsOwner] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadProject() {
      setLoading(true)
      setError(null)

      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .maybeSingle()

      if (cancelled) return

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      if (!data) {
        setError('Project not found.')
        setLoading(false)
        return
      }

      setProject(data)

      if (data.owner_id === user.id) {
        setIsOwner(true)
        setCanEdit(true)
        setLoading(false)
        return
      }

      const { data: collaboratorRow, error: collabError } = await supabase
        .from('project_collaborators')
        .select('role')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (cancelled) return

      if (collabError) setError(collabError.message)
      else setCanEdit(collaboratorRow?.role === 'owner' || collaboratorRow?.role === 'editor')
      setLoading(false)
    }

    loadProject()
    return () => {
      cancelled = true
    }
  }, [projectId, user?.id])

  if (loading) {
    return (
      <div className="mobile-app">
        <div className="mobile-app-body">
          <p className="mobile-screen-stub">Loading...</p>
        </div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="mobile-app">
        <div className="mobile-app-body">
          <p className="mobile-screen-stub">{error || 'Project not found.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mobile-app">
      <div className="mobile-topbar">
        {/* Leading slot in the topbar's existing flex row - the only
            one-tap route back to the project list. Before this it was two
            taps (More tab -> Projects Dashboard, MobileProjectMore.jsx). */}
        <Link to="/m/dashboard" className="mobile-topbar-back" aria-label="All Projects">
          <span aria-hidden="true">&#8592;</span>
        </Link>
        {/* Name and meta are separate <p>s rather than one inline run: on a
            long project name the shared line let the name push the
            methodology/date text out past the title block, over the back
            arrow and brand mark. Split, the name owns its own line and
            truncates there (see .mobile-topbar-name-text) while the meta
            line keeps its position regardless of name length. */}
        <div className="mobile-topbar-title">
          <p className="mobile-topbar-name-line">
            <span className="mobile-topbar-name-text">{project.name}</span>
          </p>
          <p className="mobile-topbar-meta-line">
            {project.is_demo && <span className="mobile-demo-badge">✦ Demo</span>}
            {METHODOLOGY_LABELS[project.methodology] ?? project.methodology}
            {' | Target Go Live: '}
            {project.deadline ?? 'TBD'}
          </p>
          {project.goal && <p className="mobile-topbar-goal">{project.goal}</p>}
        </div>
        {/* Trailing brand mark - icon only, no wordmark. flex-shrink: 0 so
            the title block absorbs every squeeze before the icon does. */}
        <span className="mobile-topbar-mark">
          <ConfidantLogo size={20} />
        </span>
      </div>

      <div className="mobile-app-body">
        <Outlet context={{ project, isOwner, canEdit }} />
        <MobileDesktopLink />
        {/* See MobileShell.jsx - same footer slot, kept in sync deliberately. */}
        <AppStoreBadges />
      </div>

      <MobileProjectTabBar projectId={projectId} methodology={project.methodology} />
    </div>
  )
}

export default MobileProjectLayout
