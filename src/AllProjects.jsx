import { useState } from 'react'
import ProjectList from './ProjectList'

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'archived', label: 'Archived' },
]

const SORT_OPTIONS = [
  { key: 'priority', label: 'Priority' },
  { key: 'deadline', label: 'Deadline' },
  { key: 'updated', label: 'Recently Updated' },
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

function AllProjects({ projects, loading, onSelect }) {
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('priority')

  let filtered = projects
  if (filter === 'active') filtered = projects.filter((p) => p.status !== 'Archived')
  if (filter === 'archived') filtered = projects.filter((p) => p.status === 'Archived')

  const sorted = sortProjects(filtered, sort)

  return (
    <div className="all-projects">
      <div className="list-controls">
        <div className="toggle-group">
          {FILTER_OPTIONS.map(({ key, label }) => (
            <button
              type="button"
              key={key}
              className={filter === key ? 'selected' : ''}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="toggle-group">
          <span className="toggle-group-label">Sort</span>
          {SORT_OPTIONS.map(({ key, label }) => (
            <button
              type="button"
              key={key}
              className={sort === key ? 'selected' : ''}
              onClick={() => setSort(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ProjectList
        projects={sorted}
        loading={loading}
        onSelect={onSelect}
        emptyMessage="No projects match this filter"
      />
    </div>
  )
}

export default AllProjects
