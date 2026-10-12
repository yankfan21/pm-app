Confidant PM

I'm continuing work on ConfidantPM (repo yankfan21/pm-app, live at confidantpm.com). Work in the git worktree ~/pm-app-redesign on branch claude/wonderful-lovelace-7l64oi. Switch the session to that folder first, then read CLAUDE.md all the way through, especially "Dashboard + All Projects merge", "iOS App Store release" and "Android / Google Play".

Standing rules:
- Ask before pushing or deploying anything (main auto-deploys to Vercel). Local commits are fine. I'll say "yes, push it".
- Never run the white-label branding migration against production. Branding is PARKED; don't work on it.
- android/gradle.properties (Windows JDK path) stays uncommitted; design/appstore/ is untracked on purpose.
- Verify changes in the dev preview (calmsky-dev, port 5183, fake Supabase data) before saying they work, and check a deploy by its asset hash, not just Vercel's success status.
- Keep answers short, say plainly what you did and did not test, and when you give me something to copy put it in a file or a fenced block.

Where we are (2026-10-11): the CalmSky redesign is live. The Dashboard + All Projects merge is built, pushed and live: top bar and footer on /dashboard only, one filter row (search, methodology pills, Active/Archived switch, sort dropdown), project cards in an auto-fit grid with the Demo badge on the deadline row, a "Needs your attention" list (go-live passed, overdue tasks, passed milestone with open tasks, overdue status update; max 3), demo projects hidden once there are 3+ real projects (with a "Show demo projects" link), /projects redirects to /dashboard. The dashboard AI note was removed (templated wording, duplicated the list); its code is kept (AiNote.jsx, computeAiNoteFact) and CLAUDE.md says how to bring it back once there is real AI wording. If Vercel ever fails a deploy within seconds with "Git information retrieval failed", click Redeploy in the Vercel dashboard (it's a Vercel-GitHub connection fault, not the code).

Open items, in this order unless I say otherwise:
1. iOS 1.2 App Review status (submitted 2026-10-10; check on the Mac).
2. Google Play 1.1 (versionCode 20) was submitted 2026-10-11. When I give you the store link, record it in CLAUDE.md and enable the muted Google Play badge in src/components/AppStoreBadges.jsx (ask before pushing).
3. Play short description review.
4. "View desktop site" on mobile web (src/mobile/MobileDesktopLink.jsx): I haven't decided whether to remove it.
5. Not yet seen rendered: the "All caught up" state and "See all" in the attention list. Worth a quick check with fixture data if we touch the dashboard again.
Deferred on purpose: a pending-proposals inbox; real AI recommendations on the dashboard (would need an Edge Function).

Ask me which of these I want to start with.
