Confidant PM

I'm continuing work on ConfidantPM (repo yankfan21/pm-app, live at confidantpm.com). Work in the git worktree ~/pm-app-redesign on branch claude/wonderful-lovelace-7l64oi. Switch the session to that folder first, then read CLAUDE.md all the way through, especially "Dashboard + All Projects merge", "iOS App Store release" and "Android / Google Play".

Standing rules:
- Ask before pushing or deploying anything (main auto-deploys to Vercel). Local commits are fine. I'll say "yes, push it".
- Never run the white-label branding migration against production. Branding is PARKED; don't work on it.
- android/gradle.properties (Windows JDK path) stays uncommitted; design/appstore/ is untracked on purpose.
- Verify changes in the dev preview (calmsky-dev, port 5183, fake Supabase data) before saying they work, and check a deploy by its asset hash, not just Vercel's success status.
- Keep answers short, say plainly what you did and did not test, and when you give me something to copy put it in a file or a fenced block.

Where we are (2026-10-12): the CalmSky redesign is live and the Dashboard + All Projects merge is built, pushed and live (top bar and footer on /dashboard only, one filter row, project cards, a "Needs your attention" list, demos hidden at 3+ real projects, /projects redirects to /dashboard). The "See all" expansion and the "All caught up" state of the attention list were checked in the dev preview on 2026-10-12 and look right. The dashboard AI note is removed but its code is kept (AiNote.jsx, computeAiNoteFact); CLAUDE.md says how to bring it back once there is real AI wording. If Vercel ever fails a deploy within seconds with "Git information retrieval failed", click Redeploy in the Vercel dashboard (it's a Vercel-GitHub connection fault, not the code).

iOS: 1.2 (1) was rejected on 2026-10-12 (guideline 2.1(a), launch crash on iPad Air M3, iPadOS 27.0.1) because the app had no UIScene lifecycle. Fixed with ios/App/App/SceneDelegate.swift plus a UIApplicationSceneManifest in Info.plist; build 1.2 (2) was archived, uploaded, tested on my iPad (27.0.1) and iPhone, and resubmitted on 2026-10-12 at 2:35 AM (status Waiting for Review). Everything is pushed to main (last commit faad50e, deploy verified). Capacitor 8.4.2 has no scene support of its own, so keep SceneDelegate when running cap sync or upgrading; this Mac only has an iOS 26.5 simulator, so test iOS 27 on a device.

Open items, in this order unless I say otherwise:
1. iOS 1.2 (2) App Review result (I'll tell you; if rejected again, I'll paste the message and any new crash logs).
2. Google Play 1.1 (versionCode 20) was submitted 2026-10-11. When it's approved and I give you the store link, record it in CLAUDE.md and enable the muted Google Play badge in src/components/AppStoreBadges.jsx (ask before pushing).
3. Play short description review, only after Google approves 1.1 (don't edit the listing while the review is pending).
Decided: "View desktop site" stays on mobile web (hidden in the native apps on purpose). Deferred on purpose: a pending-proposals inbox; real AI recommendations on the dashboard (would need an Edge Function).

Ask me which of these I want to start with.
