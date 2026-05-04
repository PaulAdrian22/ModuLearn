-- ModuLearn initial schema (Postgres / Supabase)
-- Consolidates database/schema.sql and all add_*.sql / bkt_full_migration.sql
-- from the legacy MySQL backend into a single Supabase-native migration.
--
-- Conventions:
--   * snake_case identifiers (Postgres standard; `user` is reserved)
--   * UUID PKs (compatible with auth.users.id)
--   * timestamptz with default now()
--   * jsonb for flexible content blobs
--   * text + check constraints in lieu of MySQL ENUMs
--   * RLS policies live in a separate migration

create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ============================================================
-- profiles  (replaces legacy `user` table; 1:1 with auth.users)
-- ============================================================
create table public.profiles (
    id                      uuid primary key references auth.users(id) on delete cascade,
    name                    text not null,
    username                text unique,
    age                     int check (age >= 15 and age <= 65),
    gender                  text check (gender in ('Male','Female','Prefer not to say')),
    educational_background  text,
    role                    text not null default 'student'
                            check (role in ('student', 'admin')),
    profile_picture         text,
    avatar_type             text default 'default'
                            check (avatar_type in ('default', 'custom')),
    default_avatar          text default 'avatar1.svg',
    last_login              timestamptz,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);
create index idx_profiles_username on public.profiles(username);
create index idx_profiles_role     on public.profiles(role);

-- Auto-create a profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, name, username, age, gender)
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
        nullif(new.raw_user_meta_data->>'age', '')::int,
        nullif(new.raw_user_meta_data->>'gender', '')
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- Generic updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger trg_profiles_updated_at
    before update on public.profiles
    for each row execute function public.set_updated_at();

-- ============================================================
-- modules  (replaces `module`)
-- ============================================================
create table public.modules (
    id                  uuid primary key default gen_random_uuid(),
    title               text not null,
    description         text,
    lesson_order        int not null,
    tesda_reference     text,
    is_unlocked         boolean not null default false,
    is_completed        boolean not null default false,
    -- Lesson content (admin-edited, JSON blobs)
    sections            jsonb,
    diagnostic_questions jsonb,
    review_questions    jsonb,
    final_questions     jsonb,
    final_instruction   text,
    lesson_time         jsonb,           -- {hours, minutes}
    difficulty          text default 'Easy',
    -- soft-delete (used by AdminLessons recycle bin) — see 20260428000100
    -- migration if rebasing.
    is_deleted          boolean not null default false,
    deleted_at          timestamptz,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);
create index idx_modules_lesson_order on public.modules(lesson_order);
create index idx_modules_is_deleted   on public.modules(is_deleted);

create trigger trg_modules_updated_at
    before update on public.modules
    for each row execute function public.set_updated_at();

-- ============================================================
-- assessments
--   Type values match the General Process diagram exactly. Legacy
--   Pre-Test/Quiz/Post-Test were dropped in migration 20260428000300.
-- ============================================================
create table public.assessments (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references public.profiles(id) on delete cascade,
    -- module_id is NULL for cross-cutting assessments (e.g. Initial which
    -- spans all 7 lessons). For Review/Simulation/Final it must be set;
    -- enforcement is left to the API layer for now.
    module_id       uuid references public.modules(id) on delete set null,
    type            text not null
                    check (type in ('Initial','Diagnostic','Review','Simulation','Final')),
    date_taken      timestamptz not null default now(),
    total_score     numeric(5,2) not null default 0,
    result_status   text not null default 'In Progress'
                    check (result_status in ('Pass','Fail','In Progress')),
    retake_count    int not null default 0
);
create index idx_assessments_user on public.assessments(user_id);
create index idx_assessments_date on public.assessments(date_taken);

-- ============================================================
-- user_answers
--
-- question_id is an opaque text id supplied by the editor. The editor
-- (AddLesson) stores questions as jsonb arrays on
-- modules.diagnostic_questions / review_questions / final_questions,
-- with each question carrying its own UUID. We do NOT have a normalized
-- `questions` table anymore — the editor is the source of truth.
-- ============================================================
create table public.user_answers (
    id              uuid primary key default gen_random_uuid(),
    assessment_id   uuid not null references public.assessments(id) on delete cascade,
    question_id     text not null,
    user_answer     text not null,
    is_correct      boolean not null,
    response_time   int not null default 0,    -- seconds
    skill_tag       text check (skill_tag in (
        'Memorization','Technical Comprehension','Analytical Thinking',
        'Critical Thinking','Problem Solving'
    )),
    attempt_number  int not null default 1,
    created_at      timestamptz not null default now()
);
create index idx_user_answers_assessment on public.user_answers(assessment_id);
create index idx_user_answers_question   on public.user_answers(question_id);

-- ============================================================
-- progress
-- ============================================================
create table public.progress (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references public.profiles(id) on delete cascade,
    module_id       uuid not null references public.modules(id) on delete cascade,
    completion_rate numeric(5,2) not null default 0,
    -- is_unlocked / is_completed are the per-user authoritative state. See
    -- migration 20260428000200_per_user_lesson_unlock.sql for the cascade
    -- trigger. Defining them here so a fresh `supabase db reset` produces
    -- the final schema in one step.
    is_unlocked     boolean not null default false,
    is_completed    boolean not null default false,
    date_started    timestamptz not null default now(),
    date_completion timestamptz,
    unique (user_id, module_id),
    -- Enforce that completion_rate and is_completed agree.
    constraint progress_completion_consistency check (
        (is_completed = true  and completion_rate >= 100) or
        (is_completed = false and completion_rate <  100)
    )
);
create index idx_progress_user   on public.progress(user_id);
create index idx_progress_module on public.progress(module_id);

-- ============================================================
-- skill_parameters — reference table, single source of truth for the
-- 5 thesis-defined BKT skill parameters. Was previously denormalized
-- into bkt_models.p_learn/p_slip/p_guess (5 rows per user, all identical).
-- ============================================================
create table public.skill_parameters (
    skill_name text primary key check (skill_name in (
        'Memorization','Technical Comprehension','Analytical Thinking',
        'Critical Thinking','Problem Solving'
    )),
    p_init     numeric(10,6) not null,
    p_guess    numeric(10,6) not null,
    p_learn    numeric(10,6) not null,
    p_slip     numeric(10,6) not null
);

insert into public.skill_parameters (skill_name, p_init, p_guess, p_learn, p_slip) values
    ('Memorization',            0.01, 0.15, 0.10, 0.40),
    ('Technical Comprehension', 0.01, 0.15, 0.10, 0.40),
    ('Analytical Thinking',     0.01, 0.14, 0.11, 0.43),
    ('Critical Thinking',       0.01, 0.13, 0.12, 0.45),
    ('Problem Solving',         0.01, 0.13, 0.12, 0.45);

-- ============================================================
-- bkt_models — per-user mastery only. Skill parameters live in
-- skill_parameters. The legacy schema's post_test_l scratch column has
-- been dropped; it was reset to 0 every assessment.
-- ============================================================
create table public.bkt_models (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references public.profiles(id) on delete cascade,
    skill_name   text not null check (skill_name in (
        'Memorization','Technical Comprehension','Analytical Thinking',
        'Critical Thinking','Problem Solving'
    )),
    p_known      numeric(10,6) not null default 0.010000,
    base_l       numeric(10,6) not null default 0.010000,
    current_l    numeric(10,6) not null default 0.010000,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    unique (user_id, skill_name)
);
create index idx_bkt_models_user  on public.bkt_models(user_id);
create index idx_bkt_models_skill on public.bkt_models(skill_name);

create trigger trg_bkt_models_updated_at
    before update on public.bkt_models
    for each row execute function public.set_updated_at();

-- ============================================================
-- BKT detail tables
-- ============================================================
-- bkt_item_responses — per-question BKT state snapshot
-- question_id is opaque text (matches the editor's jsonb question id).
create table public.bkt_item_responses (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references public.profiles(id) on delete cascade,
    assessment_id   uuid references public.assessments(id) on delete cascade,
    question_id     text not null,
    module_id       uuid references public.modules(id) on delete set null,
    skill_name      text not null check (skill_name in (
        'Memorization','Technical Comprehension','Analytical Thinking',
        'Critical Thinking','Problem Solving'
    )),
    assessment_type text not null check (assessment_type in (
        'Initial','Diagnostic','Review','Simulation','Final')),
    is_correct      boolean not null,
    response_time   int not null default 0,
    attempt_number  int not null default 1,
    base_l_before   numeric(10,6) not null,
    transition_l    numeric(10,6) not null,
    post_test_l     numeric(10,6) not null,
    current_l_after numeric(10,6) not null,
    created_at      timestamptz not null default now()
);
create index idx_bkt_resp_user        on public.bkt_item_responses(user_id);
create index idx_bkt_resp_assessment  on public.bkt_item_responses(assessment_id);
create index idx_bkt_resp_skill       on public.bkt_item_responses(skill_name);
create index idx_bkt_resp_user_skill  on public.bkt_item_responses(user_id, skill_name);
create index idx_bkt_resp_uatm
    on public.bkt_item_responses(user_id, assessment_type, module_id);

create table public.bkt_assessment_mastery (
    id                  uuid primary key default gen_random_uuid(),
    user_id             uuid not null references public.profiles(id) on delete cascade,
    module_id           uuid references public.modules(id) on delete cascade,
    skill_name          text not null check (skill_name in (
        'Memorization','Technical Comprehension','Analytical Thinking',
        'Critical Thinking','Problem Solving'
    )),
    assessment_type     text not null check (assessment_type in (
        'Initial','Review','Simulation','Final')),
    mastery_value       numeric(10,6) not null default 0,
    questions_answered  int not null default 0,
    questions_correct   int not null default 0,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    unique (user_id, module_id, skill_name, assessment_type)
);
create index idx_bkt_amastery_user   on public.bkt_assessment_mastery(user_id);
create index idx_bkt_amastery_module on public.bkt_assessment_mastery(module_id);
create index idx_bkt_amastery_user_module_skill
    on public.bkt_assessment_mastery(user_id, module_id, skill_name);

create trigger trg_bkt_amastery_updated_at
    before update on public.bkt_assessment_mastery
    for each row execute function public.set_updated_at();

-- w_lesson dropped — it's a global constant (0.9/7), no need to persist
-- on every row.
create table public.bkt_lesson_mastery (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references public.profiles(id) on delete cascade,
    module_id     uuid not null references public.modules(id) on delete cascade,
    skill_name    text not null check (skill_name in (
        'Memorization','Technical Comprehension','Analytical Thinking',
        'Critical Thinking','Problem Solving'
    )),
    review_l      numeric(10,6) not null default 0,
    simulation_l  numeric(10,6) not null default 0,
    final_l       numeric(10,6) not null default 0,
    m_lesson      numeric(10,6) not null default 0,
    wm_lesson     numeric(10,6) not null default 0,
    retake_count  int not null default 0,
    is_passed     boolean not null default false,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    unique (user_id, module_id, skill_name)
);
create index idx_bkt_lmastery_user        on public.bkt_lesson_mastery(user_id);
create index idx_bkt_lmastery_module      on public.bkt_lesson_mastery(module_id);
create index idx_bkt_lmastery_user_skill  on public.bkt_lesson_mastery(user_id, skill_name);

create trigger trg_bkt_lmastery_updated_at
    before update on public.bkt_lesson_mastery
    for each row execute function public.set_updated_at();

create table public.bkt_overall_mastery (
    id                        uuid primary key default gen_random_uuid(),
    user_id                   uuid not null references public.profiles(id) on delete cascade,
    skill_name                text not null check (skill_name in (
        'Memorization','Technical Comprehension','Analytical Thinking',
        'Critical Thinking','Problem Solving'
    )),
    initial_l                 numeric(10,6) not null default 0,
    wm_initial                numeric(10,6) not null default 0,
    remaining_l               numeric(10,6) not null default 1,
    tm_lesson                 numeric(10,6) not null default 0,
    overall_mastery           numeric(10,6) not null default 0,
    is_mastered               boolean not null default false,
    total_questions_mastered  int not null default 0,
    total_questions           int not null default 0,
    overall_mastery_percent   numeric(5,2) not null default 0,
    created_at                timestamptz not null default now(),
    updated_at                timestamptz not null default now(),
    unique (user_id, skill_name)
);
create index idx_bkt_omastery_user     on public.bkt_overall_mastery(user_id);
create index idx_bkt_omastery_mastered on public.bkt_overall_mastery(is_mastered);

create trigger trg_bkt_omastery_updated_at
    before update on public.bkt_overall_mastery
    for each row execute function public.set_updated_at();

-- bkt_diagnostic_results — records diagnostic responses for the
-- equivalent-question-removal rule. question_id is opaque text (matches
-- the editor's jsonb question id).
create table public.bkt_diagnostic_results (
    id                     uuid primary key default gen_random_uuid(),
    user_id                uuid not null references public.profiles(id) on delete cascade,
    module_id              uuid not null references public.modules(id) on delete cascade,
    question_id            text not null,
    skill_name             text not null check (skill_name in (
        'Memorization','Technical Comprehension','Analytical Thinking',
        'Critical Thinking','Problem Solving'
    )),
    is_correct             boolean not null,
    remove_from_lesson     boolean not null default false,
    equivalent_question_id text,
    created_at             timestamptz not null default now()
);
create index idx_bkt_diag_user_module
    on public.bkt_diagnostic_results(user_id, module_id);

-- bkt_time_rules / bkt_sessions tables intentionally NOT defined.
-- They were allocated by the legacy schema but never written. Diagnostic
-- removed-question tracking lives in bkt_diagnostic_results; the time-rule
-- decisions are returned in the Modal batch-update response and consumed
-- client-side without persistence (which matches their use as one-shot
-- routing decisions).

-- ============================================================
-- simulations
-- ============================================================
create table public.simulations (
    id                uuid primary key default gen_random_uuid(),
    module_id         uuid not null references public.modules(id) on delete cascade,
    title             text not null,
    description       text,
    activity_type     text,
    max_score         int not null default 10,
    time_limit        int not null default 0,    -- minutes; 0 = unlimited
    instructions      text,
    simulation_order  int not null default 1,
    is_locked         boolean not null default true,
    zone_data         jsonb,                     -- admin meta + timeline overrides
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);
create index idx_simulations_module on public.simulations(module_id);
create index idx_simulations_order  on public.simulations(simulation_order);

create trigger trg_simulations_updated_at
    before update on public.simulations
    for each row execute function public.set_updated_at();

create table public.simulation_progress (
    id                uuid primary key default gen_random_uuid(),
    user_id           uuid not null references public.profiles(id) on delete cascade,
    simulation_id     uuid not null references public.simulations(id) on delete cascade,
    score             numeric(5,2) not null default 0,
    attempts          int not null default 0,
    time_spent        int not null default 0,
    completion_status text not null default 'Not Started'
                      check (completion_status in ('Not Started','In Progress','Completed')),
    date_started      timestamptz,
    date_completed    timestamptz,
    last_attempt      timestamptz not null default now(),
    unique (user_id, simulation_id)
);
create index idx_simprogress_user on public.simulation_progress(user_id);
create index idx_simprogress_sim  on public.simulation_progress(simulation_id);

create trigger trg_simprogress_updated_at
    before update on public.simulation_progress
    for each row execute function public.set_updated_at();

-- ============================================================
-- Helper: is_admin(uid) — used by RLS policies and Edge Functions
-- ============================================================
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.profiles
        where id = uid and role = 'admin'
    );
$$;

-- ============================================================
-- Views (analytics; same intent as legacy v_* views)
-- ============================================================
create or replace view public.v_user_progress_summary as
select
    p.id           as user_id,
    p.name,
    m.id           as module_id,
    m.title        as module_title,
    pr.completion_rate,
    pr.date_started,
    pr.date_completion
from public.profiles p
left join public.progress pr on p.id = pr.user_id
left join public.modules m   on pr.module_id = m.id;

create or replace view public.v_bkt_knowledge_state as
select
    p.id        as user_id,
    p.name,
    bkt.skill_name,
    bkt.p_known,
    bkt.current_l,
    -- Skill-level params now sourced from skill_parameters reference table.
    sp.p_learn,
    sp.p_slip,
    sp.p_guess,
    om.wm_initial,
    om.tm_lesson,
    om.overall_mastery,
    om.overall_mastery_percent,
    om.is_mastered,
    case
        when om.overall_mastery >= 0.85 then 'Mastered'
        when om.overall_mastery >= 0.70 then 'Advanced'
        when om.overall_mastery >= 0.50 then 'Intermediate'
        when om.overall_mastery >= 0.30 then 'Beginner'
        else 'Novice'
    end as proficiency_level
from public.profiles p
left join public.bkt_models bkt on p.id = bkt.user_id
left join public.skill_parameters sp on bkt.skill_name = sp.skill_name
left join public.bkt_overall_mastery om
    on p.id = om.user_id and bkt.skill_name = om.skill_name;

create or replace view public.v_lesson_mastery_summary as
select
    p.id as user_id, p.name,
    m.id as module_id, m.title as module_title, m.lesson_order,
    lm.skill_name, lm.review_l, lm.simulation_l, lm.final_l,
    lm.m_lesson, lm.wm_lesson, lm.is_passed, lm.retake_count
from public.profiles p
join public.bkt_lesson_mastery lm on p.id = lm.user_id
join public.modules m on lm.module_id = m.id
order by p.id, m.lesson_order, lm.skill_name;
