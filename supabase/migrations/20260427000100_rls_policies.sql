-- Row Level Security policies for ModuLearn
--
-- Model:
--   * Anonymous: no access.
--   * Authenticated student: full access to their own rows; read-only on
--     content tables (modules, questions, simulations).
--   * Admin (profiles.role = 'admin'): full access everywhere.
--
-- Edge Functions that bypass RLS use the service_role key.

-- ============================================================
-- Enable RLS on every table
-- ============================================================
-- Tables `questions`, `learning_skills`, `bkt_time_rules`, `bkt_sessions`
-- were dropped in migration 20260428000300 (or never existed in fresh
-- schemas). Their RLS policies are gone with them.
alter table public.profiles               enable row level security;
alter table public.skill_parameters       enable row level security;
alter table public.modules                enable row level security;
alter table public.assessments            enable row level security;
alter table public.user_answers           enable row level security;
alter table public.progress               enable row level security;
alter table public.bkt_models             enable row level security;
alter table public.bkt_item_responses     enable row level security;
alter table public.bkt_assessment_mastery enable row level security;
alter table public.bkt_lesson_mastery     enable row level security;
alter table public.bkt_overall_mastery    enable row level security;
alter table public.bkt_diagnostic_results enable row level security;
alter table public.simulations            enable row level security;
alter table public.simulation_progress    enable row level security;

-- ============================================================
-- profiles
-- ============================================================
create policy "profiles: self read"
    on public.profiles for select
    using (auth.uid() = id);

create policy "profiles: self update"
    on public.profiles for update
    using (auth.uid() = id)
    with check (auth.uid() = id);

create policy "profiles: admin all"
    on public.profiles for all
    using (public.is_admin(auth.uid()))
    with check (public.is_admin(auth.uid()));

-- ============================================================
-- skill_parameters (reference table — readable by all auth'd users)
-- ============================================================
create policy "skill_parameters: read for authenticated"
    on public.skill_parameters for select
    to authenticated using (true);

create policy "skill_parameters: admin write"
    on public.skill_parameters for all
    using (public.is_admin(auth.uid()))
    with check (public.is_admin(auth.uid()));

-- ============================================================
-- modules / questions / simulations  (public-read content)
-- ============================================================
create policy "modules: read for authenticated"
    on public.modules for select
    to authenticated using (true);

create policy "modules: admin write"
    on public.modules for all
    using (public.is_admin(auth.uid()))
    with check (public.is_admin(auth.uid()));

-- (questions table dropped — questions live in modules.*_questions jsonb)

create policy "simulations: read for authenticated"
    on public.simulations for select
    to authenticated using (true);

create policy "simulations: admin write"
    on public.simulations for all
    using (public.is_admin(auth.uid()))
    with check (public.is_admin(auth.uid()));

-- ============================================================
-- Per-user data: assessments, user_answers, progress, learning_skills,
-- bkt_*, simulation_progress
-- ============================================================

-- Helper macro pattern: own-row policy + admin override.
-- Repeated for each per-user table.

create policy "assessments: self all"
    on public.assessments for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
create policy "assessments: admin all"
    on public.assessments for all
    using (public.is_admin(auth.uid()))
    with check (public.is_admin(auth.uid()));

create policy "user_answers: self all"
    on public.user_answers for all
    using (exists (
        select 1 from public.assessments a
        where a.id = user_answers.assessment_id and a.user_id = auth.uid()
    ))
    with check (exists (
        select 1 from public.assessments a
        where a.id = user_answers.assessment_id and a.user_id = auth.uid()
    ));
create policy "user_answers: admin all"
    on public.user_answers for all
    using (public.is_admin(auth.uid()))
    with check (public.is_admin(auth.uid()));

create policy "progress: self all"
    on public.progress for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
create policy "progress: admin all"
    on public.progress for all
    using (public.is_admin(auth.uid()))
    with check (public.is_admin(auth.uid()));

-- (learning_skills dropped — bkt_assessment_mastery covers the same intent)

create policy "bkt_models: self all"
    on public.bkt_models for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
create policy "bkt_models: admin all"
    on public.bkt_models for all
    using (public.is_admin(auth.uid()))
    with check (public.is_admin(auth.uid()));

create policy "bkt_item_responses: self all"
    on public.bkt_item_responses for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
create policy "bkt_item_responses: admin all"
    on public.bkt_item_responses for all
    using (public.is_admin(auth.uid()))
    with check (public.is_admin(auth.uid()));

create policy "bkt_assessment_mastery: self all"
    on public.bkt_assessment_mastery for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
create policy "bkt_assessment_mastery: admin all"
    on public.bkt_assessment_mastery for all
    using (public.is_admin(auth.uid()))
    with check (public.is_admin(auth.uid()));

create policy "bkt_lesson_mastery: self all"
    on public.bkt_lesson_mastery for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
create policy "bkt_lesson_mastery: admin all"
    on public.bkt_lesson_mastery for all
    using (public.is_admin(auth.uid()))
    with check (public.is_admin(auth.uid()));

create policy "bkt_overall_mastery: self all"
    on public.bkt_overall_mastery for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
create policy "bkt_overall_mastery: admin all"
    on public.bkt_overall_mastery for all
    using (public.is_admin(auth.uid()))
    with check (public.is_admin(auth.uid()));

create policy "bkt_diagnostic_results: self all"
    on public.bkt_diagnostic_results for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
create policy "bkt_diagnostic_results: admin all"
    on public.bkt_diagnostic_results for all
    using (public.is_admin(auth.uid()))
    with check (public.is_admin(auth.uid()));

-- (bkt_time_rules and bkt_sessions dropped — never written by the rebuild)

create policy "simulation_progress: self all"
    on public.simulation_progress for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
create policy "simulation_progress: admin all"
    on public.simulation_progress for all
    using (public.is_admin(auth.uid()))
    with check (public.is_admin(auth.uid()));
