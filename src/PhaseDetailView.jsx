import { supabase } from './supabaseClient'

// Fixed Initiation -> Planning -> Execution -> Closing grouping layer for
// Waterfall/Hybrid projects (phases_schema.sql) - no add/remove/reorder yet,
// so unlike MilestonesView there's no create form here, just the 4 existing
// rows. Each phase shows its effective date range plus which mode produced
// it (Auto, from the tasks assigned to it, vs. Custom, a PM-set override),
// and a toggle to switch between the two - the tool computes a suggestion,
// the PM decides whether to keep it.
function PhaseDetailView({ phases, setPhases, canEdit, expanded, onToggle }) {
  const sorted = [...phases].sort((a, b) => a.phase_number - b.phase_number)

  async function setMode(phase, isCustom) {
    const { data, error } = await supabase
      .from('phases')
      .update({ is_custom_mode: isCustom })
      .eq('id', phase.id)
      .select()
      .single()

    if (!error && data) {
      setPhases((prev) => prev.map((p) => (p.id === phase.id ? data : p)))
    }
  }

  async function setCustomDate(phase, field, value) {
    const { data, error } = await supabase
      .from('phases')
      .update({ [field]: value || null })
      .eq('id', phase.id)
      .select()
      .single()

    if (!error && data) {
      setPhases((prev) => prev.map((p) => (p.id === phase.id ? data : p)))
    }
  }

  return (
    <div className="phases">
      <h2 className="tasks-heading">
        <button
          type="button"
          className="collapsible-toggle toggle-header-with-badge"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <span className="toggle-header-main">
            <span className={`chevron ${expanded ? '' : 'collapsed'}`} aria-hidden="true">
              ▾
            </span>
            <span className={`status-dot ${sorted.length > 0 ? 'done' : 'pending'}`} aria-hidden="true" />
            Phases
          </span>
          <span className={`doc-status-badge ${sorted.length > 0 ? 'done' : 'pending'}`}>
            {sorted.length > 0 ? `${sorted.length} Phase${sorted.length === 1 ? '' : 's'}` : 'Not seeded'}
          </span>
        </button>
      </h2>

      {expanded && (
        <ul className="backlog-list phase-list">
          {sorted.map((phase) => (
            <li key={phase.id} className="backlog-item phase-item">
              <div className="backlog-item-main">
                <div className="backlog-item-title-row">
                  <span className="backlog-item-title">
                    {phase.phase_number}. {phase.phase_name}
                  </span>
                  <span className="story-points-badge">
                    {phase.effective_start_date || 'TBD'} &rarr; {phase.effective_end_date || 'TBD'}
                  </span>
                </div>

                <div className="phase-mode-toggle" role="group" aria-label={`${phase.phase_name} date mode`}>
                  <button
                    type="button"
                    className={!phase.is_custom_mode ? 'selected' : ''}
                    disabled={!canEdit}
                    onClick={() => setMode(phase, false)}
                  >
                    Auto (based on tasks)
                  </button>
                  <button
                    type="button"
                    className={phase.is_custom_mode ? 'selected' : ''}
                    disabled={!canEdit}
                    onClick={() => setMode(phase, true)}
                  >
                    Custom dates
                  </button>
                </div>

                {!phase.is_custom_mode && (
                  <p className="charter-status phase-auto-note">
                    {phase.auto_start_date || phase.auto_end_date
                      ? `Calculated from this phase's tasks: ${phase.auto_start_date || 'TBD'} → ${phase.auto_end_date || 'TBD'}`
                      : "No dated tasks assigned to this phase yet."}
                  </p>
                )}

                {phase.is_custom_mode && (
                  <div className="task-dates phase-custom-dates">
                    <label className="task-date-field">
                      Start
                      <input
                        type="date"
                        value={phase.custom_start_date || ''}
                        disabled={!canEdit}
                        onChange={(e) => setCustomDate(phase, 'custom_start_date', e.target.value)}
                      />
                    </label>
                    <label className="task-date-field">
                      End
                      <input
                        type="date"
                        value={phase.custom_end_date || ''}
                        disabled={!canEdit}
                        onChange={(e) => setCustomDate(phase, 'custom_end_date', e.target.value)}
                      />
                    </label>
                  </div>
                )}
              </div>
            </li>
          ))}
          {sorted.length === 0 && (
            <li className="empty">
              No phases yet - re-run the phases migration's backfill, or recreate the project, to seed them.
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

export default PhaseDetailView
