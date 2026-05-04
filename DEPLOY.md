# ModuLearn — Deployment Guide

The rebuild stack is **Supabase** (Postgres + Auth + Storage + Edge Functions),
**Vercel** (React frontend), and **Modal** (Python serverless running pyBKT
for the BKT batch-update endpoint). No Node backend, no MySQL, no Netlify.

```
                ┌────────────────────┐
                │  React (CRA)       │
   browser ───▶ │  hosted on Vercel  │
                └─────┬───────────┬──┘
        supabase-js   │           │  fetch(modal_url)
                      ▼           ▼
   ┌──────────────────────┐   ┌──────────────────────────┐
   │ Supabase project     │   │ Modal Python service     │
   │  ├─ Postgres + RLS   │   │  └─ pyBKT batch-update   │
   │  ├─ Auth             │   │     (writes to Supabase  │
   │  ├─ Storage          │   │      via service role)   │
   │  └─ Edge Functions:  │   └──────────────────────────┘
   │     bkt-knowledge-   │
   │     states,          │
   │     bkt-final-       │
   │     history,         │
   │     admin-delete-    │
   │     user             │
   └──────────────────────┘
```

The BKT batch-update math runs in Python on Modal so we can use **pyBKT**
(Badrinath, Wang, & Pardos, 2021) — the library cited in the thesis
literature review. The other two BKT endpoints are pure SELECT queries and
stay on Supabase Edge Functions.

---

## 1. Create the Supabase project

1. Sign in at <https://supabase.com>, **New project**.
2. Pick a strong DB password (you won't need it again — Studio handles SQL).
3. Wait for provisioning. Note your **Project URL**, **anon key**, and
   **service_role key** (Settings → API).

## 2. Apply migrations + seed

Install the Supabase CLI:

```bash
npm install -g supabase
supabase login
```

From the repo root:

```bash
supabase init                                # creates supabase/config.toml
supabase link --project-ref <YOUR_REF>       # one-time
supabase db push                             # applies supabase/migrations/* in order
psql "$DATABASE_URL" -f supabase/seed.sql    # seeds modules + sample sims
```

(`DATABASE_URL` is on the project's database settings page.)

## 3. Deploy Edge Functions

```bash
supabase functions deploy bkt-knowledge-states
supabase functions deploy bkt-final-history
supabase functions deploy admin-delete-user
supabase functions deploy learner-metrics
```

The Edge Functions read `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` from the runtime environment — these are
populated by Supabase automatically; you don't need to set them.

> The BKT **batch-update** endpoint is NOT a Supabase Edge Function — it's a
> Python service on Modal so we can use pyBKT. See step 4.

## 4. Deploy the Modal pyBKT service

```bash
cd python_services
pip install modal
modal setup                                        # browser auth, one-time
# Create the secret in the Modal dashboard:
#   Name: modulearn-supabase
#   Keys: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET
#   (JWT secret: Supabase Dashboard → Settings → API → JWT Settings)
modal deploy modal_app.py
```

Modal prints the public URL — copy it for step 7 (`REACT_APP_BKT_BATCH_UPDATE_URL`).

Run the validation tests against pyBKT before deploying:

```bash
pip install -r requirements.txt
pytest -v
```

This is the answer to the thesis evaluation's "no external validation" gap —
every closed-form update we run is verified against pyBKT's HMM forward pass.

## 5. Promote your first admin

There's no UI to promote admins. Sign up once via the Register page, then in
Supabase Studio (SQL editor):

```sql
update public.profiles set role = 'admin' where username = 'YOUR_USERNAME';
```

## 6. Migrate media (optional, only if you want existing assets)

```bash
cd scripts
npm install
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
npm run migrate:media:dry        # preview
npm run migrate:media            # actual upload
```

This populates the `lesson-media`, `simulation-assets`, and `avatars` buckets
from the local `lesson images webp/`, `Simulations/`, `backend/uploads/...`,
and `backend/sim-assets/` directories. (`backend/` is gone now; the old paths
were already documented in `scripts/migrate_media_to_supabase.js`. Adjust
sources if your media lives elsewhere.)

## 7. Frontend env

Create `frontend/.env.local`:

```
REACT_APP_SUPABASE_URL=https://<ref>.supabase.co
REACT_APP_SUPABASE_ANON_KEY=<anon-public-key>
REACT_APP_BKT_BATCH_UPDATE_URL=https://<workspace>--modulearn-bkt-batch-update.modal.run
```

Local sanity check:

```bash
cd frontend
npm install
npm start
```

## 8. Deploy to Vercel

The repo root has [vercel.json](vercel.json) configured.

1. <https://vercel.com> → **Add New** → **Project** → import this Git repo.
2. **Framework Preset:** Other (vercel.json drives the build).
3. **Environment Variables**: add `REACT_APP_SUPABASE_URL`,
   `REACT_APP_SUPABASE_ANON_KEY`, and `REACT_APP_BKT_BATCH_UPDATE_URL` for
   **Production** + **Preview**.
4. Deploy. Builds run `cd frontend && npm install && npm run build` and serve
   `frontend/build` with SPA rewrites.

## 9. Supabase Auth settings

In **Authentication → URL Configuration**:

- **Site URL:** your Vercel production URL.
- **Redirect URLs:** add the production URL plus `http://localhost:3000` for dev.

In **Authentication → Policies → Password requirements**, set:

- **Minimum length:** 8
- **Lowercase, uppercase, digits, and symbols all required**

The frontend ([utils/passwordPolicy.js](frontend/src/utils/passwordPolicy.js))
mirrors this so users get instant feedback during registration. Keep the
two in sync — the dashboard setting is authoritative.

In **Authentication → Email Templates / Providers**:

- **Email** provider stays enabled. Username login is implemented as
  synthetic `username@modulearn.local` addresses; users never see them.
- If you want email-change confirmation off (so the Profile/AdminSettings
  email change is instant rather than via email link), disable
  *Confirm email change* in the Auth settings.

## 10. Smoke test

After first deploy, walk through:

- [ ] Register a new user (synthetic email created automatically)
- [ ] Login as that user
- [ ] Promote them to admin via the SQL snippet above
- [ ] Re-login → you should land on `/admin/dashboard`
- [ ] Open AdminLessons, toggle a lesson lock → should persist
- [ ] As a student account, open a lesson → BKT batch-update fires on review
- [ ] AdminDashboard "Reported Issues" — file one via `/module/<id>` Report
      button, see it appear in the admin list

---

## Multi-user lesson unlock — bug from legacy is fixed

The legacy app stored `is_unlocked` only on the `modules` table. When the
first user in a cohort completed lesson 1, the server flipped
`modules.is_unlocked = true` on lesson 2 — and every other user
immediately saw lesson 2 as unlocked.

The rebuild moves per-user state to `progress.is_unlocked` (per-user)
while keeping `modules.is_unlocked` as the admin-controlled global default.
The frontend reads from a `v_user_modules` view that merges the two with
RLS-scoped per-user fallback. A Postgres trigger handles the
"complete N → unlock N+1 for this user only" cascade. See migration
`20260428000200_per_user_lesson_unlock.sql`.

To verify after deploy: log in as user A, complete lesson 1, then in a
second browser log in as user B — user B should still see lesson 2 locked.

## Known regressions vs the legacy app

These are intentional simplifications during the rebuild — log them as
follow-ups rather than blockers.

- **Email-change confirmation** now happens through Supabase Auth's email
  flow, not an instant inline edit. Configurable per project.
- **Issue-report context fields** (`issueType` legacy field) are reduced
  to `category`. The schema supports anything; tweak Reports modal copy
  if you want richer fields.
- **Equivalent-question removal on Diagnostic** — schema column exists
  (`bkt_diagnostic_results.equivalent_question_id`) but the editor
  doesn't expose a way for admins to link equivalent questions yet.
- **"Pull another easy question"** on a Final Assessment retake when a
  prior answer was fast + correct — the time-rule decision is computed
  and returned, but the question-bank doesn't have the alternates set up
  to honor it.
- **Lesson retake content rewrite** — the diagram says items answered
  correctly should be turned into statements on retake; we currently
  re-pose them as questions. Needs a UI rendering branch in the review
  components.

### Resolved (previously listed here)

- ~~Detailed learner metrics~~ — `learner-metrics` Edge Function lands the
  per-lesson aggregation; AdminLearners shows real values.
- ~~Lesson-language filter~~ — `modules.lesson_language` column +
  `modulesApi.list({ language })` filter restored.
- ~~Server-side time tracking~~ — `lesson_time_logs` table writes from
  ModuleView's existing flush calls.

## After deploy: keep it alive

[SUSTAINABILITY.md](SUSTAINABILITY.md) — runbook for backups, monitoring,
dependency upgrades, succession planning, and what to do when free
tiers stop being enough.

## Where to find things

- Schema:        `supabase/migrations/*.sql`
- RLS policies:  `supabase/migrations/20260427000100_rls_policies.sql`
- Edge Functions: `supabase/functions/<name>/index.ts`
- Seed data:     `supabase/seed.sql`
- Frontend API layer: `frontend/src/services/api.js`
- Auth context:  `frontend/src/contexts/AuthContext.js`
