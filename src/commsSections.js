// Config shared by CommsFlow/CommsFollowUp/CommsView/commsExport - the two
// Stakeholder Comms Plan document types (Exec Comms Plan, Team Newsletter)
// share one Q&A intake but differ in output shape/tone, so everything about
// that difference is parameterized through this "variant" config rather than
// duplicating the component files.
export const COMMS_VARIANTS = {
  exec: {
    table: 'exec_comms_plans',
    title: 'Exec Comms Plan',
    pageSubtitle: 'Executive Communications',
    sections: [
      { key: 'status_summary', label: 'Status Summary' },
      { key: 'key_decisions', label: 'Key Decisions Needed' },
      { key: 'risks_blockers', label: 'Risks & Blockers' },
      { key: 'ask', label: 'The Ask' },
    ],
  },
  newsletter: {
    table: 'team_newsletters',
    title: 'Team Newsletter',
    pageSubtitle: 'Team Newsletter',
    sections: [
      { key: 'highlights', label: 'Highlights & Wins' },
      { key: 'upcoming_milestones', label: 'Upcoming Milestones' },
      { key: 'shoutouts', label: 'Shoutouts' },
      { key: 'links', label: 'Links & Resources' },
    ],
  },
}
