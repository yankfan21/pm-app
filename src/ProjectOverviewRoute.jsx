import { useOutletContext } from 'react-router-dom'
import KeyMetricsDashboard from './KeyMetricsDashboard'
import { ProjectEvalSection } from './ProjectDocSectionRoutes'
import DocReminderCard from './components/DocReminderCard'

// Overview - project goal/purpose (as entered at creation) plus the Key
// Metrics Dashboard content (Project Status/Progress %/Critical Issues) as
// a snapshot, per the original nav spec. Tasks-and-Milestones and the
// Documents checklist used to render here too (Phase 1's interim home for
// both - see projectSections.js), but have since moved to their own
// routes: PlanningTasksRoute.jsx (/planning/tasks) and DocumentsRoute.jsx
// (/documents).
//
// Project Evaluation came the other way: it was a Documents checklist row,
// and Overview is where it lands after the IA restructure, since the Project
// Status and Progress cards above it are both reading its latest snapshot.
// This is a functional relocation only - ProjectEvalView/ProjectEvalFlow are
// rendered as-is (via ProjectDocSectionRoutes' shared DocSection, same as the
// tracking-group routes). Whether it stays a section at the bottom of Overview
// or becomes a widget/sub-nav of its own is a deferred call for a future
// Overview redesign.
function ProjectOverviewRoute() {
  // milestones/collaborators were already loaded by ProjectDetailLayout and
  // sitting unused in outlet context - Upcoming Milestones and Team Hotspots
  // read them, so neither panel costs a query. docs.project_evaluation is the
  // same array the Project Evaluation section below renders, newest first -
  // KeyMetricsDashboard reads [0] for its Project Status/Progress cards
  // instead of issuing its own latest-evaluation query, so running an
  // evaluation down there updates them immediately.
  const { project, canEdit, tasks, phases, milestones, collaborators, docs, setDocs, docsLoading } =
    useOutletContext()

  // Update Progress rewrites the latest evaluation's metrics/updated_at in
  // place (project-eval's metrics_only action). Patching the array here
  // rather than re-fetching keeps this the single copy of that row on the
  // page: the metric cards above and ProjectEvalSection below both render
  // from docs.project_evaluation, so one setDocs moves both.
  //
  // Deliberately a no-op on an empty array. The edge function only ever
  // persists when a row already exists, so "nothing to patch" and "nothing
  // was written" are the same case - the button falls back to showing an
  // unsaved figure instead.
  function patchLatestEvaluation(patch) {
    setDocs((prev) => {
      const list = prev.project_evaluation || []
      if (list.length === 0) return prev
      return { ...prev, project_evaluation: [{ ...list[0], ...patch }, ...list.slice(1)] }
    })
  }

  const scopingMissing = !docsLoading && !docs.scoping
  const scopingThin = !docsLoading && !!docs.scoping && docs.scoping.sufficient === false

  return (
    <>
      {scopingMissing && (
        <DocReminderCard
          storageKey="cpm_overview_scoping_reminder_dismissed_at"
          heading="No scoping yet"
          body="Want the assistant to help you map out constraints and unknowns before you Charter this?"
          ctaLabel="Start Scoping"
          ctaTo="../documents"
        />
      )}

      {scopingThin && (
        <DocReminderCard
          storageKey="cpm_overview_scoping_reminder_dismissed_at"
          heading="Scoping is still thin"
          body="A few of the vital scoping answers were pretty bare - worth firming up, since Charter and Risk Log will lean on them."
          ctaLabel="Revisit Scoping"
          ctaTo="../documents"
        />
      )}

      {!docsLoading && !docs.charter && (
        <DocReminderCard
          storageKey="cpm_overview_charter_reminder_dismissed_at"
          heading="No charter yet"
          body="Want the assistant to help you draft one?"
          ctaLabel="Generate Charter"
          ctaTo="../documents"
        />
      )}

      {!docsLoading && !docs.risk_log && (
        <DocReminderCard
          storageKey="cpm_overview_riskLog_reminder_dismissed_at"
          heading="No risk log yet"
          body="Want the assistant to help you identify risks?"
          ctaLabel="Generate Risk Log"
          ctaTo="../risk-log"
        />
      )}

      <KeyMetricsDashboard
        project={project}
        canEdit={canEdit}
        tasks={tasks}
        phases={phases}
        milestones={milestones}
        collaborators={collaborators}
        riskLog={docs.risk_log}
        issueLog={docs.issue_log}
        evaluations={docs.project_evaluation}
        evaluationsLoading={docsLoading}
        onMetricsPersisted={patchLatestEvaluation}
        expanded
      />

      <ProjectEvalSection />
    </>
  )
}

export default ProjectOverviewRoute
