# UI Design System — Gap Analysis

Updated 2026-07-17 (second pass). First pass captured `design/before/` on 2026-07-16/17
and flagged two items needing a decision before touching code (Login, and the
generated-document preview pattern). Both have since shipped and are re-verified below,
along with fresh dark-mode captures of Dashboard, Gantt/Phases, and the Documents detail
view.

Target tokens:

| Token | Value |
|---|---|
| Background | near-black charcoal-purple `#151220` |
| Card/panel background | `#1E1A29` |
| Primary accent (buttons, active nav, progress fills, logo) | violet-purple `#7C5CFC` |
| Success/status pill | mint green `#4ADE80` |
| Warning/in-progress pill | amber `#F5A623` |
| Text primary | off-white `#F2F0F7` |
| Text secondary | muted gray-purple `#9994A8` |

**Methodology note:** the app is light-by-default and only applies the palette above via
`@media (prefers-color-scheme: dark)` (`src/index.css`). Automated screenshots must
emulate a dark `colorScheme` or they render the (also real, but not the audited) light
variant — this tripped up the first attempt at today's new captures and two light-mode
shots had to be discarded and redone.

---

## Resolved since the first pass

### Login
Was the furthest screen from the target system: bluer-than-brand right panel, a lighter
periwinkle "Sign in" button, slate-blue inputs. Fixed in `0d71474` ("update brand tokens to
target palette, fix Login theme override"). Confirmed against `design/after/login.png`:
violet-purple `#7C5CFC`-toned Sign in button, charcoal-purple background across both
panels, violet input focus ring. Matches tokens.

### Documents (Charter) / Post-Mortem — generated-document preview
Previously an undecided pattern: a hardcoded near-white "paper" card (`#fdfdfb`, no border,
heavy `0 20px 40px` drop shadow) floating on the dark canvas. Decision made to keep the
light-paper metaphor deliberately (it's a print/export preview, not a themed panel) and
formalize it, landed in `85a93ec`: warm off-white `#F5F3F0` background, `1px solid #E0DDD8`
border, soft `0 2px 8px rgba(0,0,0,0.16)` shadow. Confirmed in
`Screenshot 2026-07-17 Documents Detail.png` — the Charter card now reads as an
intentional paper surface with a visible edge and lift, not a stray unstyled panel.

### Post-Mortem row box-sizing
`3b093b5` fixed a box-sizing mismatch between button and div rendering in post-mortem rows
(cosmetic misalignment, not a token/palette issue). No longer visible in current captures.

---

## Aligned — no work needed

### Dashboard (portfolio overview)
Re-captured in `Screenshot 2026-07-17 Dashboard.png` with dark mode correctly emulated.
Near-black background, left-accent-bar project cards (violet border = on track, amber
border = at risk), mint "On Track" pill, amber "At Risk" pill, neutral gray "Not
evaluated" pill, mint outline "+Demo" pill, violet "New Project" button, violet active
"Dashboard" nav underline. Matches target tokens cleanly.

### Project Detail — Gantt Chart / Phases, Documents list
Re-captured in `Screenshot 2026-07-17 Gantt.png` (cross-checked against a second,
independently-taken dark snip, `Screenshot 2026-07-17 063007.png` — same result). Dark
panel, violet task bars for scheduled/single-date items, mint green for completed, mint
"Generated"/"7 Milestones"/"12 Tasks" pills, amber "At Risk"/"High priority" pills. Text
and gridlines stay readable on the dark background. The Documents list below it uses the
same left-accent-bar + status-dot + pill treatment as Dashboard, consistently.
**One standing flag (carried over, still true):** the "Today" marker uses red, which isn't
in the defined token set. Reasonable as a dedicated temporal marker rather than a status
color — still worth an explicit decision to keep or restate, not a regression.

### Documents detail view (Charter open, full page)
`Screenshot 2026-07-17 Documents Detail.png` — the dark app chrome around the document
(toolbar, section headers, sibling Documents-list rows) is fully aligned with tokens, and
the paper preview itself now reads as the deliberate light-surface variant confirmed
above.

### Project Detail (Backlog / Sprint Board / Sprint Retro)
Dark card panels, left-accent-bar section headers with colored status dots, mint-green
pills ("Generated", "4 Sprints", "3 Retros", "83 points in backlog"), amber "In Progress"
pill on Communications. Consistent with the Dashboard/All Projects card treatment. No
changes needed.

### Backlog
Dark background, mint "83 points in backlog" pill, violet "Add" button, dark input
fields, mint "Done" status pills. Aligned. (Spot-checked directly this pass against
`Screenshot 2026-07-16 192357.png` — confirms token-for-token: near-black background,
dark card panel, mint pill, violet button.)

### Sprint Board
Dark panel, violet "Create Sprint" button, mint pill counters, column headers readable on
dark bg. Aligned.

### Manage Access (expanded)
Dark panel, dark bordered "Editor" dropdown, violet "Invite" button, muted-gray
"No collaborators yet" secondary text. Aligned, per the original 2026-07-16/17 capture.

### Budget Tracker (generation wizard)
Dark panel, violet-highlighted selected option box, violet "AI suggestion" link text,
violet primary buttons ("Add 5 Selected Line Items"), dark input/checkbox styling in the
line-item review table. Aligned.

### Evaluate Project / Project Evaluation output
Dark card, amber "At Risk" pill, muted-gray "0% of committed sprint points completed"
neutral pill, muted secondary body text, dark-bordered "Export PDF/Word" buttons.
Aligned.

---

## Coverage gap — still open

**Budget Tracker steady-state** (the populated line-item table — categories vs. actual
spend once line items exist, not the AI-generation wizard) has never been captured. This
was flagged in the first pass and carried into today's audit round specifically to close
it, but repeated attempts to drive it via an automated headed browser had the browser
window close mid-session before reaching it. Everything else captured so far is aligned,
so there's no reason to expect a surprise here, but it hasn't been visually confirmed —
worth grabbing by hand before calling the audit fully closed.

### Stray capture, disregard
`Screenshot 2026-07-17 062540.png` is a light-mode snip taken mid-troubleshooting (before
dark-mode emulation was fixed in the capture script) — it duplicates the Gantt Chart
screen and can be deleted; superseded by `Screenshot 2026-07-17 Gantt.png` and
`Screenshot 2026-07-17 063007.png`.

---

## Other notes
- Three pill variants now exist in practice: success (mint), warning (amber), and neutral
  (gray, e.g. "Not evaluated", "0% completed"). Only two were specified in the target
  token list — worth adding the neutral gray as a formal third pill token so it's not
  reinvented ad hoc per screen.
- The circular ring-gauge stat widget called out as a "new" component target does not
  exist on the real Dashboard today (it only appeared in the discarded AI-mockup images).
  Building it is in scope per the original design brief, but per the standing guardrail,
  confirm data sourcing (must come from existing live data, not new snapshot tables)
  before implementing.
