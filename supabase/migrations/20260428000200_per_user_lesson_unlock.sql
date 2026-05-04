-- Per-user lesson unlock + completion state.
--
-- Bug being fixed:
--   The legacy schema kept `is_unlocked` and `is_completed` only on the
--   `modules` table. When user A completed lesson 1, the server flipped
--   `modules.is_unlocked = true` on lesson 2 — which immediately exposed
--   lesson 2 to every other user. The first completer in any cohort
--   unlocked the gate for everyone behind them.
--
-- Resolution:
--   * `modules.is_unlocked` / `is_completed` are now the GLOBAL DEFAULT
--     (set by admins via AdminLessons; affects new users / new progress rows).
--   * `progress.is_unlocked` / `is_completed` are per-user overrides.
--   * Effective unlock for a user is read via the `v_user_modules` view,
--     which falls back to the module default when no progress row exists.
--   * A trigger on `progress.is_completed` flipping to true unlocks the
--     next-by-lesson_order module FOR THAT USER ONLY.

-- ============================================================
-- 1. Add per-user columns
-- ============================================================
alter table public.progress
    add column if not exists is_unlocked  boolean not null default false,
    add column if not exists is_completed boolean not null default false;

-- ============================================================
-- 2. Backfill existing rows from the (current) module defaults so prior
--    state is preserved when this migration first runs against a populated DB.
-- ============================================================
update public.progress p
set is_unlocked  = coalesce(m.is_unlocked, false),
    is_completed = coalesce(p.date_completion is not null, false)
from public.modules m
where p.module_id = m.id;

-- ============================================================
-- 3. Trigger: when a progress row is INSERTED, seed `is_unlocked` from the
--    module's default if the caller didn't set it explicitly.
-- ============================================================
create or replace function public.seed_progress_unlock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.is_unlocked is null or new.is_unlocked = false then
        select coalesce(m.is_unlocked, false)
            into new.is_unlocked
        from public.modules m
        where m.id = new.module_id;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_progress_seed_unlock on public.progress;
create trigger trg_progress_seed_unlock
    before insert on public.progress
    for each row execute function public.seed_progress_unlock();

-- ============================================================
-- 4. Trigger: when `is_completed` transitions to true, unlock the
--    next-by-lesson_order module for the SAME user. Idempotent: re-running
--    on an already-unlocked next module is a no-op.
-- ============================================================
create or replace function public.cascade_unlock_next_lesson()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    current_order int;
    next_module_id uuid;
begin
    -- Only fire on the false → true edge.
    if new.is_completed is not true then return new; end if;
    if old.is_completed is true then return new; end if;

    select lesson_order into current_order
        from public.modules where id = new.module_id;

    if current_order is null then return new; end if;

    select id into next_module_id
        from public.modules
        where lesson_order = current_order + 1
          and is_deleted = false
        order by lesson_order
        limit 1;

    if next_module_id is null then return new; end if;

    -- Upsert: create the row if missing, set is_unlocked=true if existing.
    insert into public.progress (user_id, module_id, is_unlocked)
    values (new.user_id, next_module_id, true)
    on conflict (user_id, module_id) do update
        set is_unlocked = true
        where public.progress.is_unlocked = false;

    return new;
end;
$$;

drop trigger if exists trg_progress_cascade_unlock on public.progress;
create trigger trg_progress_cascade_unlock
    after update of is_completed on public.progress
    for each row execute function public.cascade_unlock_next_lesson();

-- ============================================================
-- 5. View: per-user effective module state.
--    `security_invoker = true` so the existing RLS on `progress` applies —
--    each authenticated caller only sees their own progress rows joined
--    against the (publicly-readable) modules table.
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
    m.is_deleted,
    m.created_at,
    m.updated_at,
    -- Defaults (admin-controlled)
    m.is_unlocked  as module_default_is_unlocked,
    m.is_completed as module_default_is_completed,
    -- Effective per-user state
    coalesce(p.is_unlocked,  m.is_unlocked,  false) as is_unlocked,
    coalesce(p.is_completed,                  false) as is_completed,
    coalesce(p.completion_rate, 0)                   as completion_rate,
    p.date_started,
    p.date_completion
from public.modules m
left join public.progress p
    on p.module_id = m.id and p.user_id = auth.uid();

-- ============================================================
-- 6. Bootstrap: ensure every user has lesson_order = 1 unlocked.
--    For new users this is handled when they hit progressApi.start(lesson_1).
--    For existing users with no progress on lesson 1, we leave as-is — the
--    module default already covers them through the view's coalesce.
-- ============================================================

-- ============================================================
-- 7. Documentation
-- ============================================================
comment on column public.modules.is_unlocked is
    'Global default unlock state, used as the seed for new progress rows. '
    'Per-user effective state lives in progress.is_unlocked.';
comment on column public.modules.is_completed is
    'Global default; per-user effective state lives in progress.is_completed. '
    'Kept on modules for backward compatibility.';
comment on column public.progress.is_unlocked is
    'Per-user unlock state. Authoritative; falls back to modules.is_unlocked '
    'via v_user_modules when no progress row exists.';
comment on column public.progress.is_completed is
    'Per-user completion. Triggers cascade_unlock_next_lesson() on true.';
