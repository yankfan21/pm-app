import { useEffect, useRef, useState } from 'react'

export function todayLocalDateString() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatSprintLabel(sprint) {
  if (sprint.start_date && sprint.end_date) {
    return `${sprint.name} (${sprint.start_date} – ${sprint.end_date})`
  }
  return sprint.name
}

// Shared by Sprint Board and Sprint Retro's sprint picker: defaults to
// whichever sprint's date range contains today, once, on first load - if
// none matches, selection stays null (empty state, manual pick still
// works) rather than re-triggering every time the sprints list changes.
export function useSprintSelection(sprints) {
  const [selectedSprintId, setSelectedSprintId] = useState(null)
  const autoSelectedRef = useRef(false)

  useEffect(() => {
    if (autoSelectedRef.current || sprints.length === 0) return
    autoSelectedRef.current = true

    const todayStr = todayLocalDateString()
    const current = sprints.find(
      (s) => s.start_date && s.end_date && s.start_date <= todayStr && todayStr <= s.end_date
    )
    if (current) setSelectedSprintId(current.id)
  }, [sprints])

  return [selectedSprintId, setSelectedSprintId]
}
