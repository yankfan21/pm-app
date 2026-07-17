import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import ProjectList from './ProjectList'
import { METHODOLOGIES, METHODOLOGY_LABELS } from './methodology'

const SORT_OPTIONS = [
  { key: 'priority', label: 'Priority' },
  { key: 'deadline', label: 'Deadline' },
  { key: 'updated', label: 'Recently Updated' },
]

const METHODOLOGY_FILTERS = [
  { key: 'all', label: 'All Projects' },
  ...METHODOLOGIES.map((key) => ({ key, label: METHODOLOGY_LABELS[key] })),
]

const PRIORITY_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3 }

function sortProjects(projects, sort) {
  return [...projects].sort((a, b) => {
    if (sort === 'priority') {
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    }
    if (sort === 'deadline') {
      if (a.deadline == null && b.deadline == null) return 0
      if (a.deadline == null) return 1
      if (b.deadline == null) return -1
      return a.deadline.localeCompare(b.deadline)
    }
    const aUpdated = a.updated_at || a.created_at
    const bUpdated = b.updated_at || b.created_at
    return bUpdated.localeCompare(aUpdated)
  })
}

function byRecentlyArchived(a, b) {
  const aUpdated = a.updated_at || a.created_at
  const bUpdated = b.updated_at || b.created_at
  return bUpdated.localeCompare(aUpdated)
}

function byName(a, b) {
  return a.name.localeCompare(b.name)
}

function matchesMethodology(project, methodology) {
  return methodology === 'all' || project.methodology === methodology
}

function matchesQuery(project, query) {
  const q = query.trim().toLowerCase()
  return (
    project.name.toLowerCase().includes(q) ||
    (project.goal || '').toLowerCase().includes(q)
  )
}

function AllProjects() {
  const { projects, loading, hideProject } = useOutletContext()
  const [tab, setTab] = useState('active')
  const [sort, setSort] = useState('priority')
  const [query, setQuery] = useState('')
  const [methodology, setMethodology] = useState('all')

  const isSearching = query.trim() !== ''
  const scoped = projects.filter((p) => matchesMethodology(p, methodology))

  let display
  if (isSearching) {
    const matches = scoped.filter((p) => matchesQuery(p, query))
    const activeMatches = matches.filter((p) => p.status !== 'Archived').sort(byName)
    const archivedMatches = matches.filter((p) => p.status === 'Archived').sort(byName)
    display = [...activeMatches, ...archivedMatches]
  } else if (tab === 'archived') {
    display = scoped.filter((p) => p.status === 'Archived').sort(byRecentlyArchived)
  } else {
    display = sortProjects(
      scoped.filter((p) => p.status !== 'Archived'),
      sort
    )
  }

  return (
    <div className="all-projects">
      <h2 className="page-title view-title">All Projects</h2>

      <div className="controls-zone">
        <input
          type="text"
          className="search-input"
          placeholder="Search projects by name or goal..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="filter-tabs">
          {METHODOLOGY_FILTERS.map(({ key, label }) => (
            <button
              type="button"
              key={key}
              className={`filter-tab ${methodology === key ? 'selected' : ''}`}
              onClick={() => setMethodology(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {!isSearching && (
          <div className="list-controls">
            <button
              type="button"
              className={`status-tab ${tab === 'active' ? 'selected' : ''}`}
              onClick={() => setTab('active')}
            >
              Active
            </button>

            {tab === 'active' && (
              <div className="sort-controls">
                <span className="sort-controls-label">Sort by</span>
                {SORT_OPTIONS.map(({ key, label }) => (
                  <button
                    type="button"
                    key={key}
                    className={`sort-option ${sort === key ? 'selected' : ''}`}
                    onClick={() => setSort(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              className={`status-tab ${tab === 'archived' ? 'selected' : ''}`}
              onClick={() => setTab('archived')}
            >
              Archived
            </button>
          </div>
        )}
      </div>

      <ProjectList
        projects={display}
        loading={loading}
        emptyMessage={
          isSearching ? 'No projects match your search' : 'No projects match this filter'
        }
        onHide={hideProject}
      />
    </div>
  )
}

export default AllProjects
