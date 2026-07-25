// Desktop <-> mobile route equivalence map (Phase 2 Chunk 4 investigation) -
// consumed by DeviceModeGate.jsx for auto/override-driven redirects and by
// the manual toggle UI (Settings.jsx, MobileDesktopLink.jsx) to land on the
// right page rather than just the mode's home.
//
// Desktop-only pages (Gantt editing, Backlog, Phases, List/Team views,
// Sprint Retro, Documents' AI-generation flows) have no mobile equivalent -
// they hard-redirect to the project home (/m/projects/:id) rather than
// attempting to render at mobile width. Mobile-only pages (task detail w/
// comments, /m/notifications, the mobile project index stub, /m/more) have
// no desktop equivalent - they fall back to the project's Overview (or "/"
// outside a project).
//
// /settings is a genuinely shared, non-prefixed route (same component both
// modes) - exempt from redirection entirely.

const SHARED_PATHS = new Set(['/settings'])

const ID = '([^/]+)'

function table(pairs) {
  return pairs.map(([pattern, build]) => [new RegExp(pattern), build])
}

const DESKTOP_TO_MOBILE = table([
  ['^/$', () => '/m/dashboard'],
  ['^/projects$', () => '/m/dashboard'],
  [`^/projects/${ID}/overview$`, (id) => `/m/projects/${id}/metrics`],
  [`^/projects/${ID}/planning/tasks$`, (id) => `/m/projects/${id}/tasks`],
  [`^/projects/${ID}/execution/sprint-board$`, (id) => `/m/projects/${id}/sprint-board`],
  [`^/projects/${ID}/documents$`, (id) => `/m/projects/${id}/more/documents`],
  // Everything else under /projects/:id/* (desktop-only pages - Gantt,
  // Backlog, Phases, List/Team, Sprint Retro - plus any unmapped/unknown
  // sub-path) - project-home fallback rather than a per-page mapping.
  [`^/projects/${ID}(?:/.*)?$`, (id) => `/m/projects/${id}`],
])

const MOBILE_TO_DESKTOP = table([
  ['^/m/dashboard$', () => '/'],
  ['^/m/notifications$', () => '/'],
  ['^/m/more$', () => '/'],
  [`^/m/projects/${ID}/tasks$`, (id) => `/projects/${id}/planning/tasks`],
  [`^/m/projects/${ID}/tasks/[^/]+$`, (id) => `/projects/${id}/overview`],
  [`^/m/projects/${ID}/sprint-board$`, (id) => `/projects/${id}/execution/sprint-board`],
  [`^/m/projects/${ID}/metrics$`, (id) => `/projects/${id}/overview`],
  [`^/m/projects/${ID}/more/documents$`, (id) => `/projects/${id}/documents`],
  [`^/m/projects/${ID}/more/risks$`, (id) => `/projects/${id}/documents`],
  [`^/m/projects/${ID}/more/status-update$`, (id) => `/projects/${id}/documents`],
  [`^/m/projects/${ID}/more/comms$`, (id) => `/projects/${id}/documents`],
  [`^/m/projects/${ID}/more$`, (id) => `/projects/${id}/overview`],
  [`^/m/projects/${ID}$`, (id) => `/projects/${id}/overview`],
])

function firstMatch(routeTable, pathname) {
  for (const [re, build] of routeTable) {
    const m = pathname.match(re)
    if (m) return build(m[1])
  }
  return null
}

export function isMobilePath(pathname) {
  return pathname === '/m' || pathname.startsWith('/m/')
}

// Locked-in "/" <-> "/m/dashboard" home/home pairing (role match, not
// content match) - used as the fallback landing target whenever a toggle
// isn't leaving from a page with a more specific mapped equivalent (e.g.
// toggling from the shared /settings page).
export const MOBILE_HOME = '/m/dashboard'
export const DESKTOP_HOME = '/'

// Returns the path to redirect to for `pathname` under `mode`, or null if
// no redirect is needed (already consistent, or a shared path).
export function resolveDeviceModeTarget(mode, pathname) {
  if (SHARED_PATHS.has(pathname)) return null

  const onMobilePath = isMobilePath(pathname)

  if (mode === 'mobile' && !onMobilePath) {
    return firstMatch(DESKTOP_TO_MOBILE, pathname) || MOBILE_HOME
  }
  if (mode === 'desktop' && onMobilePath) {
    return firstMatch(MOBILE_TO_DESKTOP, pathname) || DESKTOP_HOME
  }
  return null
}
