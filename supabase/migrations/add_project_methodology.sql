-- Adds a "methodology" column to projects, capturing the choice made in the
-- first step of the New Project wizard (Waterfall / Agile / Hybrid). Purely
-- additive and backward compatible: defaults to 'waterfall' so every
-- existing project (all created before this choice existed, and all
-- actually run as waterfall) is correctly tagged without manual backfill.

alter table projects
  add column if not exists methodology text
  not null default 'waterfall'
  check (methodology in ('waterfall', 'agile', 'hybrid'));
