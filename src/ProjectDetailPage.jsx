import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from './supabaseClient'
import AppHeader from './AppHeader'
import ProjectDetail from './ProjectDetail'

function ProjectDetailPage() {
  const { projectId } = useParams()
  const [project, setProject] = useState(null)
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

      if (error) setError(error.message)
      else if (!data) setError('Project not found.')
      else setProject(data)
      setLoading(false)
    }

    loadProject()
    return () => {
      cancelled = true
    }
  }, [projectId])

  if (loading) {
    return (
      <div className="app">
        <AppHeader />
        <p className="charter-status">Loading...</p>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="app">
        <AppHeader />
        <p className="error">{error || 'Project not found.'}</p>
        <Link to="/projects" className="btn-secondary back-link">
          &larr; Back to projects
        </Link>
      </div>
    )
  }

  return <ProjectDetail project={project} />
}

export default ProjectDetailPage
