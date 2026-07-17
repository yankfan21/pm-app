# Gantt chart visual polish pass

Styling-only changes to the existing Gantt chart. No schema, prop, or data-model changes.

## Files touched

- `src/GanttChart.jsx`
- `src/App.css`

## What changed

1. **Dependency connectors** — replaced the straight `<line>` between predecessor/successor bars with an orthogonal `<path>` (`buildElbowPath` in `GanttChart.jsx`): horizontal → vertical → horizontal, elbowing at the midpoint between the two bars (or a fixed 14px kick when they're close/overlapping in time).
2. **Gridlines** — added a `.gantt-gridlines` layer that renders one vertical line per date tick, spanning the full chart height, sitting behind the bars/today-marker (`z-index: 0`).
3. **Row consistency** — `.gantt-row-label` is now a flex container with `min-height`, balanced `line-height` (1.45) and vertical padding, so 1-line and 2-line task titles both keep the row's bar centered and rows stay evenly spaced (`row-gap` bumped 8px → 14px).
4. **Color distinction** — single-date-only bars (tasks with only one of start/due set) now render in `var(--card-accent-amber)` (amber) instead of the same purple as start–due range bars; completed still overrides to green. Legend swatch updated to match.
5. **Bar spacing** — track height 20px → 24px, bar inset 2px → 1px (bar is visually taller), row-gap increased as above.
6. **Legend** — each item is now a bordered pill (`border` + `border-radius: 999px` + `background: var(--card-bg)`) instead of a bare icon+text pair, so items read as distinct chips.
7. **Today line** — unchanged dashed red styling, but now explicitly layered above both the new gridlines and the bars (`z-index: 3`, gridlines at `0`, bars at `2`, dependency overlay at `4`) so it stays legible against the new grid.

## Verification

- `npm run build` and `npx oxlint` both pass clean.
- The Gantt chart only renders on an auth-gated route (`/projects/:projectId`, behind `RequireAuth`), so it could not be screenshotted from this session — please click through a project with tasks/dependencies and confirm the connectors, gridlines, colors, and legend look right.
