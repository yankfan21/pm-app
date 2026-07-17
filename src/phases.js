// The fixed Initiation -> Planning -> Execution -> Closing sequence every
// Waterfall/Hybrid project gets seeded with (see phases_schema.sql) -
// Agile projects never get phases, and there's no customization yet
// (rename/reorder/add/remove is a stated future enhancement). Shared by
// NewProjectFlow.jsx (seeding on creation) and ProjectDetail.jsx (seeding
// on a later switch into Waterfall/Hybrid), so the two can't drift apart.
export const DEFAULT_PHASES = [
  { phase_number: 1, phase_name: 'Initiation' },
  { phase_number: 2, phase_name: 'Planning' },
  { phase_number: 3, phase_name: 'Execution' },
  { phase_number: 4, phase_name: 'Closing' },
]
