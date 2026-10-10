I'm continuing the CalmSky_Redesign of ConfidantPM (repo yankfan21/pm-app). The work is in the git worktree ~/pm-app-redesign on branch claude/wonderful-lovelace-7l64oi. Switch the session to that folder first, then read CLAUDE.md (the "CalmSky_Redesign and white-label branding" section at the bottom).

Standing rules:
- Don't merge, push or deploy anything without asking. Local commits are fine.
- Don't run any migration against my production Supabase. Test on a throwaway project first.
- White-label branding is PARKED. Don't work on it.
- Everything is behind VITE_CALMSKY_REDESIGN=true; with it unset the shipped navy theme must stay unchanged.

Where we are: the decided look is the "Friendly" dark theme with the Calm Sky accent (warm charcoal base, sky #7ab8f0 for primary actions, nav and Today only, round shapes, Schibsted Grotesk + Hanken Grotesk, open-C logo). Done and committed locally: theme tokens, logo, shell and dashboard, Q&A step (ghost-text suggestion), Gantt, stray navy/blue sweep, the mobile app (home, contrast fixes, and every project screen checked), the Gantt (legend arrows, milestones, critical path viewed), a hover/focus/modal crawl (design/tools/), and the login/forgot/reset/privacy/marketing pages. (To view login, run a second vite with VITE_DEV_BYPASS_AUTH=false and dummy VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY, because the bypass signs you in.) Reference mockups are in design/dark/, real-app screenshots in design/screens/ (desktop) and design/screens/mobile/.

To preview: .env.local has VITE_DEV_BYPASS_AUTH=true and VITE_CALMSKY_REDESIGN=true. Run the calmsky-dev preview (port 5183; 5173 is usually another project's server). Desktop is at /dashboard, phone screens are under /m/...

First thing to do: the open items listed in CLAUDE.md. Items 1-3 from earlier (remaining mobile screens, Gantt arrows/milestones/critical path, modals/hidden forms/hover states) are DONE. What is left, in this order unless I say otherwise: (1) decide the Gantt critical-path colour (bright orange clashes with the palette; propose muted amber or sky with a heavier stroke and show me both); (2) scan the mobile delete-account modal, which the crawler skipped; (3) a real-device or simulator check of the mobile app. Launch steps (public/ icons, theme-color, manifest, fixing the shipped-CSS bugs listed in CLAUDE.md) and the dashboard AI note / "Waiting for your decision" list wait for my go-ahead.

For phone screenshots, headless Chrome won't go narrower than ~500px, so use the repo's puppeteer (node_modules/puppeteer) with executablePath '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' and page.setViewport({width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true}). Ready-made scripts: design/tools/shoot.mjs (phone screenshots + colour scan) and design/tools/crawl.mjs (hover/focus/click-everything scan). The scan flags hue 190-270, saturation > 0.15, minus the sky accent.

When I ask to "see" screens, I mean the MOBILE app unless I say desktop. Send me full-size screenshots as files (SendUserFile) rather than pointing at the browser pane. Ask before pushing, before launch steps (swapping public/ favicons and icons), and before building anything that needs product decisions (the dashboard AI note and "Waiting for your decision" list have no data behind them yet).
