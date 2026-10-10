I'm continuing the CalmSky_Redesign of ConfidantPM (repo yankfan21/pm-app). The work is in the git worktree ~/pm-app-redesign on branch claude/wonderful-lovelace-7l64oi. Switch the session to that folder first, then read CLAUDE.md (the "CalmSky_Redesign and white-label branding" section at the bottom).

Standing rules:
- Don't merge, push or deploy anything without asking. Local commits are fine.
- Don't run any migration against my production Supabase. Test on a throwaway project first.
- White-label branding is PARKED. Don't work on it.
- Everything is behind VITE_CALMSKY_REDESIGN=true; with it unset the shipped navy theme must stay unchanged.

Where we are: the decided look is the "Friendly" dark theme with the Calm Sky accent (warm charcoal base, sky #7ab8f0 for primary actions, nav and Today only, round shapes, Schibsted Grotesk + Hanken Grotesk, open-C logo). Done and committed locally: theme tokens, logo, shell and dashboard, Q&A step (ghost-text suggestion), Gantt, stray navy/blue sweep, and the mobile app home plus contrast fixes. Reference mockups are in design/dark/, real-app screenshots in design/screens/ (desktop) and design/screens/mobile/.

To preview: .env.local has VITE_DEV_BYPASS_AUTH=true and VITE_CALMSKY_REDESIGN=true. Run the calmsky-dev preview (port 5183; 5173 is usually another project's server). Desktop is at /dashboard, phone screens are under /m/...

First thing to do: the open items listed in CLAUDE.md, in this order unless I say otherwise: (1) login, forgot/reset password and marketing pages (to view login, run a second vite with VITE_DEV_BYPASS_AUTH=false, because the bypass signs you in); (2) the remaining mobile screens (Documents, Status update, Comms, Stakeholders, Issues, Settings detail); (3) Gantt dependency/legend arrows still using slate #94a3b8, milestone diamonds and critical-path view not yet seen; (4) closed modals, hidden forms and hover states the colour sweep could not see.

When I ask to "see" screens, I mean the MOBILE app unless I say desktop. Send me full-size screenshots as files (SendUserFile) rather than pointing at the browser pane. Ask before pushing, before launch steps (swapping public/ favicons and icons), and before building anything that needs product decisions (the dashboard AI note and "Waiting for your decision" list have no data behind them yet).
