import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import ProjectList from './ProjectList'
import NeedsAttention from './components/NeedsAttention'
import AiNote, { DISMISS_KEY, readDismissed } from './components/AiNote'
import useAttentionData from './useAttentionData'
import { attentionProjects, computeAiNoteFact } from './needsAttention'
import MobileAppTeaserCard from './components/MobileAppTeaserCard'
import { useAuth } from './AuthContext'
import { CALMSKY } from './redesign'
import { METHODOLOGIES, METHODOLOGY_LABELS } from './methodology'

const SORT_OPTIONS = [
  { key: 'priority', label: 'Priority' },
  { key: 'deadline', label: 'Deadline' },
  { key: 'updated', label: 'Recently Updated' },
]

const METHODOLOGY_FILTERS = [
  { key: 'all', label: 'All' },
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

function greetingFor(hour) {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

// First name guessed from the email's local part (no profile name exists).
function firstNameFromEmail(email) {
  const first = (email || '').split('@')[0].split(/[.\-_+]+/).filter(Boolean)[0] || ''
  return first ? first[0].toUpperCase() + first.slice(1) : ''
}

const DEMO_HIDE_AT = 3

function summaryLine(active) {
  const count = active.length
  const soon = Date.now() + 30 * 24 * 60 * 60 * 1000
  const goLives = active.filter((p) => p.deadline && new Date(p.deadline).getTime() <= soon && new Date(p.deadline).getTime() >= Date.now() - 86400000).length
  const parts = [`${count} active ${count === 1 ? 'project' : 'projects'}`]
  if (goLives > 0) parts.push(`${goLives} ${goLives === 1 ? 'go-live' : 'go-lives'} in the next 30 days`)
  return parts.join(' · ')
}

function Dashboard() {
  const { projects, loading, hideProject } = useOutletContext()
  const { user } = useAuth()
  const [tab, setTab] = useState('active')
  const [sort, setSort] = useState('deadline')
  const [query, setQuery] = useState('')
  const [methodology, setMethodology] = useState('all')

  const [showDemos, setShowDemos] = useState(false)
  const allActive = projects.filter((p) => p.status !== 'Archived')
  // Demo projects step aside once the user has DEMO_HIDE_AT or more real
  // projects on the dashboard. Display only; search still finds them.
  const demoRuleApplies = allActive.filter((p) => !p.is_demo).length >= DEMO_HIDE_AT
  const demosHidden = demoRuleApplies && !showDemos
  const active = demosHidden ? allActive.filter((p) => !p.is_demo) : allActive
  const demoCount = allActive.length - allActive.filter((p) => !p.is_demo).length
  const isSearching = query.trim() !== ''
  const scoped = projects.filter((p) => matchesMethodology(p, methodology) && !(demosHidden && !isSearching && p.is_demo))

  const [dismissedNotes, setDismissedNotes] = useState(readDismissed)
  function dismissNote(key) {
    const next = [...dismissedNotes, key]
    setDismissedNotes(next)
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next.slice(-50)))
    } catch {
      // storage unavailable: dismissal lasts for this visit only
    }
  }

  const factProjects = attentionProjects(active)
  const attentionData = useAttentionData(factProjects)

  const noteFact = CALMSKY && !loading && attentionData ? computeAiNoteFact(factProjects, attentionData) : null
  const noteShown = noteFact && !dismissedNotes.includes(noteFact.key)

  let display
  if (isSearching) {
    const matches = scoped.filter((p) => matchesQuery(p, query))
    const activeMatches = matches.filter((p) => p.status !== 'Archived').sort(byName)
    const archivedMatches = matches.filter((p) => p.status === 'Archived').sort(byName)
    display = [...activeMatches, ...archivedMatches]
  } else if (tab === 'archived') {
    display = scoped.filter((p) => p.status === 'Archived').sort(byRecentlyArchived)
  } else {
    display = sortProjects(scoped.filter((p) => p.status !== 'Archived'), sort)
  }

  return (
    <div className="dashboard">
      {CALMSKY ? (
        <>
          <h2 className="page-title view-title dashboard-greeting">
            {greetingFor(new Date().getHours())}
            {firstNameFromEmail(user?.email) ? `, ${firstNameFromEmail(user.email)}` : ''}.
          </h2>
          <p className="dashboard-subtitle">
            {loading ? 'Loading your projects...' : summaryLine(active)}.
          </p>
        </>
      ) : (
        <>
          <h2 className="page-title view-title">Dashboard</h2>
          <p className="dashboard-subtitle">
            Your projects.
          </p>
        </>
      )}
      {noteShown && <AiNote fact={noteFact} dismissed={dismissedNotes} onDismiss={dismissNote} />}
      <MobileAppTeaserCard />
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
      {demoRuleApplies && demoCount > 0 && !isSearching && (
        <button type="button" className="demo-toggle" onClick={() => setShowDemos((v) => !v)}>
          {showDemos ? 'Hide demo projects' : `Show demo projects (${demoCount})`}
        </button>
      )}
      <NeedsAttention
        projects={factProjects}
        data={attentionData}
        loading={loading}
        hideKeys={noteShown ? [noteFact.covers] : []}
      />
    </div>
  )
}

export default Dashboard
