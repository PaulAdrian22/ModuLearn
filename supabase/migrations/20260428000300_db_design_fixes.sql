-- Database design fixes — addresses the audit findings.
--
-- Categories of change in this single migration:
--   A. Skill-name standardization (kills the silent-join bug from
--      'Problem-Solving' vs 'Problem Solving')
--   B. Skill BKT parameters extracted to a 5-row reference table
--      (drops p_learn/p_slip/p_guess from bkt_models; they were always
--      identical to the constants in python_services/bkt_engine.py)
--   C. Legacy assessment types removed
--   D. Dead/transient state columns dropped (post_test_l, w_lesson)
--   E. `questions` table dropped — every editor stores questions as jsonb
--      arrays on `modules`; the `questions` table was never populated, so
--      its FKs from user_answers/bkt_item_responses/bkt_diagnostic_results
--      were unresolvable. question_id columns become TEXT (opaque editor IDs).
--   F. Three unwritten tables dropped (bkt_sessions, bkt_time_rules,
--      learning_skills)
--   G. Constraint enforcing progress.completion_rate ↔ is_completed
--   H. Composite indexes for the BKT aggregation hot path
--   I. Views updated to remove dropped columns

-- ============================================================
-- A. Canonical skill names (no hyphen anywhere)
-- ============================================================
-- learning_skills will be dropped in step F so we don't need to migrate it,
-- but if any rows exist on a legacy deployment we normalize first to avoid
-- CHECK violations on the intermediate state. Wrapped in EXISTS guard so
-- fresh installs (where the table was never created) skip cleanly.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'learning_skills'
  ) then
    update public.learning_skills
       set skill_category = 'Problem Solving'
     where skill_category = 'Problem-Solving';
  end if;
end $$;

-- ============================================================
-- F. Drop unused tables (do this early so later constraints don't refer to them)
-- ============================================================
drop table if exists public.bkt_sessions cascade;
drop table if exists public.bkt_time_rules cascade;
drop table if exists public.learning_skills cascade;

-- ============================================================
-- B. skill_parameters reference table
-- (table may already exist if initial_schema was applied first)
-- ============================================================
create table if not exists public.skill_parameters (
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
    ('Problem Solving',         0.01, 0.13, 0.12, 0.45)
on conflict (skill_name) do nothing;

alter table public.skill_parameters enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'skill_parameters'
      and policyname = 'skill_parameters: read for all authenticated'
  ) then
    execute $p$
      create policy "skill_parameters: read for all authenticated"
          on public.skill_parameters for select
          to authenticated using (true)
    $p$;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'skill_parameters'
      and policyname = 'skill_parameters: admin write'
  ) then
    execute $p$
      create policy "skill_parameters: admin write"
          on public.skill_parameters for all
          using (public.is_admin(auth.uid()))
          with check (public.is_admin(auth.uid()))
    $p$;
  end if;
end $$;

-- Drop now-redundant per-user copies of the skill-level constants.
alter table public.bkt_models
    drop column if exists p_learn,
    drop column if exists p_slip,
    drop column if exists p_guess,
    drop column if exists post_test_l;       -- D: transient scratch

-- ============================================================
-- C. Trim legacy assessment types
-- ============================================================
alter table public.assessments
    drop constraint if exists assessments_type_check;

alter table public.assessments
    add constraint assessments_type_check check (type in (
        'Initial','Diagnostic','Review','Simulation','Final'
    ));

-- ============================================================
-- D. Drop w_lesson (constant 0.9/7)
-- ============================================================
alter table public.bkt_lesson_mastery
    drop column if exists w_lesson;

-- ============================================================
-- E. Replace `questions` FKs with opaque text IDs
--    The editor (AddLesson) stores questions as jsonb arrays on modules.
--    BKT/user_answers should reference the editor-supplied id from those
--    jsonb objects, not a phantom row in `questions`.
-- ============================================================
alter table public.user_answers
    drop constraint if exists user_answers_question_id_fkey,
    alter column question_id type text using question_id::text;

alter table public.bkt_item_responses
    drop constraint if exists bkt_item_responses_question_id_fkey,
    alter column question_id type text using question_id::text;

alter table public.bkt_diagnostic_results
    drop constraint if exists bkt_diagnostic_results_question_id_fkey,
    drop constraint if exists bkt_diagnostic_results_equivalent_question_id_fkey,
    alter column question_id type text using question_id::text,
    alter column equivalent_question_id type text using equivalent_question_id::text;

drop table if exists public.questions cascade;

-- ============================================================
-- A continued. Re-pin skill_name CHECKs on remaining tables to the canonical
--    set. Drop-before-add makes these idempotent across rebase/replay.
-- ============================================================
alter table public.bkt_item_responses
    drop constraint if exists bkt_item_responses_skill_name_check;
alter table public.bkt_item_responses
    add constraint bkt_item_responses_skill_name_check
    check (skill_name in (
        'Memorization','Technical Comprehension','Analytical Thinking',
        'Critical Thinking','Problem Solving'
    ));

alter table public.bkt_assessment_mastery
    drop constraint if exists bkt_assessment_mastery_skill_name_check;
alter table public.bkt_assessment_mastery
    add constraint bkt_assessment_mastery_skill_name_check
    check (skill_name in (
        'Memorization','Technical Comprehension','Analytical Thinking',
        'Critical Thinking','Problem Solving'
    ));

alter table public.bkt_lesson_mastery
    drop constraint if exists bkt_lesson_mastery_skill_name_check;
alter table public.bkt_lesson_mastery
    add constraint bkt_lesson_mastery_skill_name_check
    check (skill_name in (
        'Memorization','Technical Comprehension','Analytical Thinking',
        'Critical Thinking','Problem Solving'
    ));

alter table public.bkt_overall_mastery
    drop constraint if exists bkt_overall_mastery_skill_name_check;
alter table public.bkt_overall_mastery
    add constraint bkt_overall_mastery_skill_name_check
    check (skill_name in (
        'Memorization','Technical Comprehension','Analytical Thinking',
        'Critical Thinking','Problem Solving'
    ));

alter table public.bkt_diagnostic_results
    drop constraint if exists bkt_diagnostic_results_skill_name_check;
alter table public.bkt_diagnostic_results
    add constraint bkt_diagnostic_results_skill_name_check
    check (skill_name in (
        'Memorization','Technical Comprehension','Analytical Thinking',
        'Critical Thinking','Problem Solving'
    ));

-- ============================================================
-- G. Enforce progress.completion_rate ↔ is_completed
-- ============================================================
alter table public.progress
    drop constraint if exists progress_completion_consistency;
alter table public.progress
    add constraint progress_completion_consistency
    check (
        (is_completed = true  and completion_rate >= 100) or
        (is_completed = false and completion_rate <  100)
    );

-- ============================================================
-- H. Composite indexes for the Modal aggregation hot path.
--    `bkt-batch-update` reads these tables for every Review/Sim/Final write
--    to recompute MLesson and OverallM.
-- ============================================================
create index if not exists idx_bkt_amastery_user_module_skill
    on public.bkt_assessment_mastery(user_id, module_id, skill_name);

create index if not exists idx_bkt_lmastery_user_skill
    on public.bkt_lesson_mastery(user_id, skill_name);

create index if not exists idx_bkt_resp_user_skill
    on public.bkt_item_responses(user_id, skill_name);

-- ============================================================
-- I. View updates (drop refs to removed columns)
-- ============================================================
drop view if exists public.v_bkt_knowledge_state;
create view public.v_bkt_knowledge_state as
select
    p.id        as user_id,
    p.name,
    bkt.skill_name,
    bkt.p_known,
    bkt.current_l,
    sp.p_guess,
    sp.p_learn,
    sp.p_slip,
    om.wm_initial,
    om.tm_lesson,
    om.overall_mastery,
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

drop view if exists public.v_lesson_mastery_summary;
create view public.v_lesson_mastery_summary as
select
    p.id as user_id, p.name,
    m.id as module_id, m.title as module_title, m.lesson_order,
    lm.skill_name, lm.review_l, lm.simulation_l, lm.final_l,
    lm.m_lesson, lm.wm_lesson, lm.is_passed, lm.retake_count
from public.profiles p
join public.bkt_lesson_mastery lm on p.id = lm.user_id
join public.modules m on lm.module_id = m.id
order by p.id, m.lesson_order, lm.skill_name;

-- ============================================================
-- Documentation
-- ============================================================
comment on table public.skill_parameters is
    'Reference table — 5 BKT skill parameters per the thesis. P(L0), P(G), '
    'P(T), P(S) per skill. Single source of truth; bkt_models no longer '
    'duplicates these per user.';
comment on column public.bkt_models.p_known is
    'Per-user current mastery P(L) for this skill. The only mastery value '
    'that varies per learner under standard BKT theory.';
comment on column public.user_answers.question_id is
    'Opaque editor-supplied question id from the jsonb question array on '
    'modules.diagnostic_questions / review_questions / final_questions.';
