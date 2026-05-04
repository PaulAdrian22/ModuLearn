# ModuLearn — Sustainability Plan

This document is the runbook for keeping ModuLearn alive after thesis
defense. It addresses the three sustainability concerns the thesis
evaluation raised — internet dependency, device dependency, and hosting
cost — plus the operational concerns no-one raises until they bite
(backups, monitoring, dependency rot, succession).

If you're picking up this project from the original team, read this first.

---

## 1. Cost trajectory

### Steady state (recommended)

| Service        | Tier              | Monthly cost | What pays for it |
|----------------|-------------------|-------------:|------------------|
| Vercel         | Hobby (free)      | $0           | hobby/educational projects allowed |
| Supabase       | Free              | $0           | up to 500 MB DB, 1 GB storage, 50K MAU |
| Modal          | Free + credit     | ~$0          | $30/mo credit covers ~50K BKT calls |
| Domain         | optional          | ~$1          | namecheap/porkbun .com — skip if Vercel subdomain is fine |
| **Total**      |                   | **$0–1**     | viable indefinitely at thesis scale |

### When you outgrow free tiers

Trigger: >50K monthly active users, >500 MB database, or >1 GB storage.

| Service        | Tier              | Monthly cost |
|----------------|-------------------|-------------:|
| Vercel Pro     | $20/seat          | $20          |
| Supabase Pro   | $25 base          | $25          |
| Modal          | usage-based       | ~$5–20       |
| **Total**      |                   | **~$50–65/mo** |

This is sustainable for a CvSU extension program budget. If even that's a
stretch, you can swap Supabase for self-hosted Postgres on a $5/mo VPS,
keep the rest free — see [appendix B](#appendix-b-self-hosted-fallback).

### Costs that creep up if you don't watch

- **Modal cold starts**: each one consumes a few CPU-seconds. If your
  traffic is bursty (students hammering the BKT endpoint during a Friday
  class, then nothing for a week), Modal spends most of its credit on
  spin-up. Set `min_containers=1` on the Modal app during active terms
  for ~$5/mo extra to keep one container warm.
- **Supabase storage**: every uploaded lesson media file is forever.
  Audit and delete unused files before each new term.
- **Egress bandwidth**: free tier includes 5 GB/mo on Supabase. A class
  of 30 students re-downloading 20 MB of lesson media each = 600 MB/mo.
  Fine for thesis scale; track it in the Supabase dashboard.

---

## 2. Internet dependency

The platform is web-first, but the rebuild adds three layers of
resilience for low-connectivity learners:

### a. Service worker (PWA)

[`frontend/public/service-worker.js`](frontend/public/service-worker.js)
is registered in production. It uses three cache strategies:

- **Network-first** for the app shell (HTML/JS/CSS). On reconnect-loss
  the learner sees the last-loaded shell instead of a "no internet"
  error page.
- **Cache-first** for lesson media (Supabase Storage public URLs).
  Once an image is downloaded over WiFi, it serves from cache forever.
- **Network-only** for live API calls (Supabase REST, Edge Functions,
  Modal). These never cache because stale data is worse than no data
  for adaptive learning.

The manifest ([`frontend/public/manifest.json`](frontend/public/manifest.json))
registers the app as installable. On Android Chrome, learners get an
"Add ModuLearn to Home Screen" prompt; the app then launches without
browser chrome.

### b. Offline write queue

[`frontend/src/services/writeQueue.js`](frontend/src/services/writeQueue.js)
intercepts the three writes that matter for adaptive-learning continuity:

- `progressApi.update` — lesson completion + completion-rate updates
- `progressApi.trackTime` — time-spent pings
- `bktApi.batchUpdate` — skill mastery deltas

When `navigator.onLine` is false, writes go to a localStorage queue
instead of the network. On reconnect, [`OfflineBanner`](frontend/src/components/OfflineBanner.js)
flushes the queue automatically and shows a "syncing N items" banner
during replay.

What's NOT queued: auth, profile edits, admin operations, simulation
score submissions. These need server confirmation; queueing them would
silently desync the UI from the server.

### c. Offline UX feedback

The OfflineBanner is mounted at the App root. Learners see:

- Red banner when offline, with the queued-actions count
- Blue "syncing N items" banner while the queue replays after reconnect
- Nothing when fully online and the queue is empty

### What still doesn't work offline

- **Login/register** — Supabase Auth is server-only.
- **Initial lesson load** — if a learner has never opened lesson 3
  online, opening it offline shows the offline banner and an empty
  page. Cache-first only helps after the first online visit.
- **Simulations** — drag-drop interactions work, but the post-completion
  upload of the score requires a network round-trip.

### Field test recipe

1. Open the app, sign in, open lesson 1 fully (read all sections).
2. In Chrome DevTools → Network → toggle "Offline".
3. Refresh the page — app shell loads from cache, banner appears.
4. Re-open lesson 1 — content still readable.
5. Submit a Quick Assessment — modal succeeds, banner shows "1 change
   will sync".
6. Toggle "Offline" off — banner switches to "Syncing 1 change…",
   then disappears.

If any of this regresses, the SW or write queue has been broken.

---

## 3. Device dependency

The rebuild improves but doesn't fully resolve mobile usability:

### What works on phones

- Login, Register, Dashboard, Lessons, Profile — all responsive.
  Login/Register cards scale down on short viewports but floor at
  0.85× so tap targets stay ≥44px (WCAG minimum).
- Dashboard + Lessons grids collapse to single columns on `<768px`.
- ModuleView lesson reader: padding adapts (`p-5 sm:p-10`), section
  grids reflow to single column on `<640px`.
- Global CSS: `@media (pointer: coarse) { button, [role="button"] {
  min-height: 44px; min-width: 44px; }}` enforces tap targets without
  bloating mouse-driven UIs.

### What still doesn't work well on phones

- **Simulations** (drag-drop with mouse-position math) — touch events
  fire but precise drag is hard on small screens. Keep these
  desktop-only or rebuild with proper touch handling. Estimated effort:
  2–3 days per simulation.
- **Admin pages** — designed for laptop-sized viewports. AdminLessons,
  AdminLearners use dense tables. Acceptable since admins work from
  laptops; document this expectation.
- **AddLesson editor** — explicitly desktop-only. Editing on a phone
  is not practical.

### Mobile gap closure plan, if you ever do it

1. Audit every page in DevTools at 360×640 (the cheapest Android phone
   resolution). Document every overflow.
2. Replace remaining `<table>` admin views with stacked card layouts.
3. Touch-rewrite SimulationActivity using pointer events instead of
   mouse-position math.

---

## 4. Operational sustainability

### Backups

**Supabase Free does NOT auto-backup.** This is the single biggest data
risk.

Options:

- **Pay $25/mo for Supabase Pro** — gets you daily backups for 7 days.
- **DIY weekly dump**, scheduled in GitHub Actions:

  ```yaml
  # .github/workflows/db-backup.yml
  on:
    schedule: [{ cron: '0 3 * * 0' }]  # Sunday 03:00 UTC
  jobs:
    dump:
      runs-on: ubuntu-latest
      steps:
        - run: |
            apt-get update && apt-get install -y postgresql-client
            pg_dump "$DATABASE_URL" > backup-$(date +%F).sql
        - uses: actions/upload-artifact@v4
          with: { name: db-backup, path: backup-*.sql, retention-days: 90 }
        env: { DATABASE_URL: ${{ secrets.SUPABASE_DB_URL }} }
  ```

  Free with GitHub free tier. Restore drill: `psql NEW_DATABASE_URL <
  backup-2026-04-28.sql` into a fresh project. Document the procedure
  before you need it.

### Monitoring

Without monitoring, when Modal returns 500s you find out via student
complaints. Bare minimum:

- **Vercel Analytics** (free) — front-end errors, page views.
- **Supabase logs** — already on, check Project → Logs after any
  reported issue.
- **Modal logs** — `modal app logs modulearn-bkt`. Set a weekly
  reminder to skim them for `ERROR` lines.
- **UptimeRobot** (free, 5-min interval, 50 monitors) — ping the
  Vercel URL and the Modal endpoint. Email on failure. Setup: 5 min.

### Dependency rot

Run `npm outdated` in `frontend/` every 6 months. Major version bumps
need testing; minor/patch bumps usually safe.

`pip list --outdated` in `python_services/` quarterly. **pyBKT is
slow-moving** — usually safe to leave on whatever version was tested.
Modal's SDK changes more often; check release notes when bumping.

Supabase JS major bumps (e.g. 2.x → 3.x) require code review against
their migration guide. Test in a Vercel preview deployment first.

### Succession plan

The two artifacts a successor needs to be productive in <1 day:

1. **This file.**
2. **[`DEPLOY.md`](DEPLOY.md)** — first-deploy walkthrough.

Things to do before handing off:

- Add the successor as **Owner** on Vercel, Supabase, and Modal accounts
  (not Member — owner permissions are required to rotate keys).
- Rotate the Supabase service-role key to a fresh value, redeploy
  Modal with the new secret. Confirms the successor can do it.
- Walk them through the smoke test in DEPLOY.md §10. If they get
  stuck, the docs need updating.
- Transfer the GitHub repo (Settings → Transfer Ownership) or add as
  collaborator with admin permissions.

If the project is being shelved (no successor, just maintenance mode),
take it offline cleanly:

- Turn the Vercel project off (Settings → General → Delete Project,
  with a final backup of the repo).
- Pause the Supabase project (Settings → General → Pause Project) —
  preserves data for 90 days at zero cost.
- Stop the Modal app: `modal app stop modulearn-bkt`.

---

## 5. Year-by-year action items

### Year 1 (post-defense)

- [ ] Confirm the GitHub Actions backup workflow is running every Sunday.
- [ ] Set up UptimeRobot monitors on Vercel + Modal URLs.
- [ ] Rotate the Supabase service-role key annually.
- [ ] Prune unused lesson media from the Supabase Storage bucket.

### Year 3

- [ ] `npm outdated` audit + apply minor/patch bumps.
- [ ] Review free-tier limits — if you've grown, decide whether to pay
      or shed users. Don't let free-tier limit kicks happen mid-term.
- [ ] Reproduce the smoke test in DEPLOY.md against a fresh Vercel
      preview deployment to confirm the deploy pipeline still works.

### Year 5

- [ ] Major React / Tailwind / Supabase JS bumps (now 2 majors behind).
      Plan for a sprint of testing.
- [ ] Re-evaluate hosting — by now there may be a cheaper or better
      managed option than Vercel/Supabase/Modal.
- [ ] Decide whether the project is still pedagogically relevant.
      TESDA standards drift; the lesson content may need refresh.

---

## Appendix A: What can't be made sustainable

Be honest about these in any handoff conversation.

- **The simulations require WebGL-style interaction.** Truly offline,
  truly mobile-first simulations need a different framework (React
  Native, Phaser, or native apps) — not a 1-day refactor.
- **Adaptive learning quality depends on data volume.** With <30
  responses per skill, BKT's parameter estimates are noisy. The
  platform will look smarter the more it's used. Below ~20 active
  learners, the adaptive value-add is mostly invisible.
- **The thesis evaluation flagged TO-SERVE needs assessment as
  missing.** If the platform is pitched to TO-SERVE again, do the
  needs assessment first. Not a code problem.

---

## Appendix B: Self-hosted fallback

If even Supabase Pro becomes unaffordable, the cheapest sustainable
alternative is:

- **Hetzner CX22** ($5/mo) — Ubuntu 24.04, 4 vCPU, 8 GB RAM
- Install: PostgreSQL 16, PostgREST (the open-source layer Supabase is
  built on), Caddy as reverse-proxy with auto-TLS.
- Auth: keep Supabase Auth (free tier 50K MAU is generous), or replace
  with self-hosted Lucia/Auth.js. The frontend already isolates auth
  in `lib/supabase.js` so the swap touches one file.
- Storage: replace Supabase Storage with the same Hetzner box's local
  filesystem behind Caddy, or use Backblaze B2 ($0.005/GB/mo).
- Modal pyBKT: keep on Modal free tier, or run a FastAPI app on the
  same Hetzner box.

Total: $5/mo. Operational cost: a few hours of Linux admin per quarter.
Worth it only if the project genuinely outlives all the free tiers.
