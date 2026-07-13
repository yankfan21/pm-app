-- Adds a numeric completion metric alongside the existing qualitative
-- health_status, so the Project Evaluation card and dashboard project
-- cards can show a color-coded number instead of just the health badge.
--
-- jsonb, not separate numeric columns, because the shape genuinely
-- differs by methodology (Waterfall: one task-completion fraction; Agile:
-- one velocity ratio; Hybrid: both a milestone-completion fraction and a
-- velocity ratio) - a jsonb bag of whichever keys apply avoids a pile of
-- always-partially-null numeric columns. Nullable, no default: older
-- evaluations that predate this column stay NULL (genuinely "no metrics
-- data"), distinguishable from a current evaluation whose ratio happened
-- to compute to null internally (e.g. no sprint has committed points yet)
-- but still has a metrics object with a null field inside it.
--
-- Shape written by supabase/functions/project-eval/index.ts:
--   Waterfall: { "task_pct_complete": 0.0-1.0 | null }
--   Agile:     { "velocity_ratio": 0.0-1.0+ | null }
--   Hybrid:    { "milestone_pct_complete": 0.0-1.0 | null, "velocity_ratio": 0.0-1.0+ | null }

alter table project_evaluations add column if not exists metrics jsonb;
