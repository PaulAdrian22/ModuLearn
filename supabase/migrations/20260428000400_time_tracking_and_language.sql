-- Time tracking + lesson language.
--
-- Adds:
--   * lesson_time_logs — fine-grained per-lesson time pings, replacing the
--     legacy /progress/track-time endpoint that the rebuild dropped. The
--     AdminLearners metrics aggregation (learner-metrics Edge Function)
--     reads from this.
--   * modules.lesson_language — restores the Taglish/English filter the
--     legacy backend supported via ?language= query param.

-- ============================================================
-- profiles.preferred_language — restores cross-device language sync.
-- Phase 4 dropped server persistence in favor of localStorage; we add it
-- back here so the Profile/Dashboard language selector survives logout.
-- ============================================================
alter table public.profiles
    add column if not exists preferred_language text not null default 'English'
    check (preferred_language in ('English', 'Taglish'));

-- ============================================================
-- modules.lesson_language
-- ============================================================
alter table public.modules
    add column if not exists lesson_language text not null default 'English'
    check (lesson_language in ('English', 'Taglish'));

create index if not exists idx_modules_lesson_language
    on public.modules(lesson_language);

-- ============================================================
-- lesson_time_logs
-- ============================================================
create table if not exists public.lesson_time_logs (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references public.profiles(id) on delete cascade,
    module_id     uuid not null references public.modules(id) on delete cascade,
    -- Seconds buffered into a single ping. ModuleView flushes ~30s at a
    -- time, plus a final flush on visibility-change. Each row is one ping.
    seconds       int not null check (seconds >= 0 and seconds <= 600),
    logged_at     timestamptz not null default now()
);
create index if not exists idx_lesson_time_user
    on public.lesson_time_logs(user_id);
create index if not exists idx_lesson_time_user_module
    on public.lesson_time_logs(user_id, module_id);
create index if not exists idx_lesson_time_logged_at
    on public.lesson_time_logs(logged_at desc);

alter table public.lesson_time_logs enable row level security;

create policy "lesson_time_logs: self insert"
    on public.lesson_time_logs for insert
    to authenticated
    with check (auth.uid() = user_id);

create policy "lesson_time_logs: self read"
    on public.lesson_time_logs for select
    using (auth.uid() = user_id);

create policy "lesson_time_logs: admin all"
    on public.lesson_time_logs for all
    using (public.is_admin(auth.uid()))
    with check (public.is_admin(auth.uid()));

-- ============================================================
-- Documentation
-- ============================================================
comment on table public.lesson_time_logs is
    'Append-only log of time spent per lesson. ModuleView flushes a row '
    'every ~30s while the lesson tab is visible. Aggregations (e.g. total '
    'time spent on lesson N by user U) sum the `seconds` column.';
comment on column public.modules.lesson_language is
    'Display language for this lesson. The frontend filters modulesApi.list '
    'by the user''s preferred language so Taglish learners see Taglish '
    'lessons. English is the canonical default.';

-- ============================================================
-- Update v_user_modules to expose lesson_language so the frontend filter
-- works against the per-user view.
-- ============================================================
drop view if exists public.v_user_modules;
create view public.v_user_modules
with (security_invoker = true)
as
select
    m.id,
    m.title,
    m.description,
    m.lesson_order,
    m.tesda_reference,
    m.sections,
    m.diagnostic_questions,
    m.review_questions,
    m.final_questions,
    m.final_instruction,
    m.lesson_time,
    m.difficulty,
    m.lesson_language,
    m.is_deleted,
    m.created_at,
    m.updated_at,
    m.is_unlocked  as module_default_is_unlocked,
    m.is_completed as module_default_is_completed,
    coalesce(p.is_unlocked,  m.is_unlocked,  false) as is_unlocked,
    coalesce(p.is_completed,                  false) as is_completed,
    coalesce(p.completion_rate, 0)                   as completion_rate,
    p.date_started,
    p.date_completion
from public.modules m
left join public.progress p
    on p.module_id = m.id and p.user_id = auth.uid();
