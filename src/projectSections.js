// Single source of truth for the two-tier project detail nav (primary
// strip + secondary panel) and the nested routes under
// /projects/:projectId - mirrors the DOCUMENT_TYPES pattern in
// documentTypes.jsx (one config, multiple consumers) so ProjectNav.jsx and
// App.jsx's route tree can't drift out of sync with each other.
//
// `side` gates a section's visibility using the same visibleSides()
// definition ProjectDetail.jsx already uses for Waterfall/Agile/Hybrid
// show-hide logic - 'waterfall' | 'agile' | null (always visible).
//
// Documents has no entries in SECTIONS_BY_CATEGORY below - it's one flat
// checklist page (DocumentsRoute.jsx), not broken into further sections, so
// like Overview it renders no secondary panel.
//
// `group` is presentation-only: 'phase' for the three categories that track
// where a project is in its lifecycle, 'reference' for the ones that don't.
// ProjectNav.jsx draws a divider wherever the group changes between two
// consecutive entries, so grouping is expressed here rather than by
// hardcoding a category name in the nav component. Order is unchanged -
// entries must stay sorted by group for the divider to read correctly.
export const PRIMARY_CATEGORIES = [
  { key: 'overview', label: 'Overview', icon: '◈', group: 'phase' },
  { key: 'planning', label: 'Planning', icon: '▤', group: 'phase' },
  { key: 'execution', label: 'Execution', icon: '▶', group: 'phase' },
  { key: 'documents', label: 'Documents', icon: '▦', group: 'reference' },
]

export const SECTIONS_BY_CATEGORY = {
  planning: [
    { key: 'phases', label: 'Phases', path: 'phases', side: 'waterfall' },
    { key: 'tasks', label: 'Tasks and Milestones', path: 'tasks', side: 'waterfall' },
    { key: 'backlog', label: 'Backlog', path: 'backlog', side: 'agile' },
  ],
  execution: [
    { key: 'gantt', label: 'Gantt Chart', path: 'gantt', side: 'waterfall' },
    { key: 'list-waterfall', label: 'List (Tasks)', path: 'list-waterfall', side: 'waterfall' },
    { key: 'team-waterfall', label: 'Team (Tasks)', path: 'team-waterfall', side: 'waterfall' },
    { key: 'sprint-board', label: 'Sprint Board', path: 'sprint-board', side: 'agile' },
    { key: 'sprint-retro', label: 'Sprint Retro', path: 'sprint-retro', side: 'agile' },
    { key: 'list-agile', label: 'List (Backlog)', path: 'list-agile', side: 'agile' },
    { key: 'team-agile', label: 'Team (Backlog)', path: 'team-agile', side: 'agile' },
    { key: 'risk-log', label: 'Log a Risk', path: 'risk-log' },
    { key: 'issue-log', label: 'Log an Issue', path: 'issue-log' },
  ],
  documents: [],
}

// Which "side" (Waterfall: Phases/Tasks/Gantt, Agile: Backlog/Sprint
// Board/Sprint Retro) is visible for a given methodology - copied here
// verbatim from ProjectDetail.jsx's visibleSides() rather than imported, so
// this config module has no dependency on the (soon to shrink, eventually
// retired) ProjectDetail.jsx file. Hybrid shows both.
export function visibleSides(methodology) {
  return {
    waterfall: methodology !== 'agile',
    agile: methodology !== 'waterfall',
  }
}

// Sections in `category` that are visible for the given methodology - the
// single filter both ProjectNav's secondary panel and the category index
// redirect routes use, so "what's visible" can't drift between the list a
// PM sees and where an empty/bare category URL lands them.
export function visibleSectionsForCategory(category, methodology) {
  const sides = visibleSides(methodology)
  return (SECTIONS_BY_CATEGORY[category] || []).filter((s) => !s.side || sides[s.side])
}
