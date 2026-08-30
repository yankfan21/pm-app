// Visual 2x2 stakeholder-priority picker (Influence x Interest / Mendelow
// matrix). Standalone component, same src/components/ home as the other
// reusable field pickers (DependencyPicker.jsx, AssigneePicker.jsx) - used
// inside StakeholderRegistryRoute.jsx's Add/Edit form, but has no dependency
// on that file.
//
// QUADRANTS is exported as the single source of truth for the four db
// values (matches the `quadrant` check constraint on the `stakeholders`
// table - see supabase/migrations/stakeholder_registry_schema.sql) plus
// their display label and badge color, so the route's table column reads
// off the same list rather than a second copy.
//
// Grid position is plain DOM order (2-column CSS grid, row-major) rather
// than a position class per cell - top-left/top-right/bottom-left/
// bottom-right falls out of the array order below, with no extra markup
// needed to place each cell.
export const QUADRANTS = [
  { key: 'keep_satisfied', label: 'Keep Satisfied', badgeClass: 'high' },
  { key: 'manage_closely', label: 'Manage Closely', badgeClass: 'critical' },
  { key: 'monitor', label: 'Monitor', badgeClass: 'low' },
  { key: 'keep_informed', label: 'Keep Informed', badgeClass: 'medium' },
]

function QuadrantPicker({ value, onChange, disabled }) {
  return (
    <div className="quadrant-picker">
      <div className="quadrant-picker-yaxis" aria-hidden="true">
        <span>High Influence</span>
        <span>Low Influence</span>
      </div>
      <div className="quadrant-picker-main">
        <div className="quadrant-picker-grid" role="radiogroup" aria-label="Stakeholder quadrant">
          {QUADRANTS.map((q) => (
            <button
              key={q.key}
              type="button"
              role="radio"
              aria-checked={value === q.key}
              className={`quadrant-picker-cell ${value === q.key ? 'selected' : ''}`}
              disabled={disabled}
              onClick={() => onChange(q.key)}
            >
              {q.label}
            </button>
          ))}
        </div>
        <div className="quadrant-picker-xaxis" aria-hidden="true">
          <span>Low Interest</span>
          <span>High Interest</span>
        </div>
      </div>
    </div>
  )
}

export default QuadrantPicker
