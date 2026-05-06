-- Fix SECURITY DEFINER warnings: recreate all three views with security_invoker = true
-- so RLS policies of the querying user are enforced, not the view creator's.

drop view if exists public.v_user_progress_summary;
create view public.v_user_progress_summary
with (security_invoker = true)
as
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

drop view if exists public.v_bkt_knowledge_state;
create view public.v_bkt_knowledge_state
with (security_invoker = true)
as
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

drop view if exists public.v_lesson_mastery_summary;
create view public.v_lesson_mastery_summary
with (security_invoker = true)
as
select
    p.id as user_id, p.name,
    m.id as module_id, m.title as module_title, m.lesson_order,
    lm.skill_name, lm.review_l, lm.simulation_l, lm.final_l,
    lm.m_lesson, lm.wm_lesson, lm.is_passed, lm.retake_count
from public.profiles p
join public.bkt_lesson_mastery lm on p.id = lm.user_id
join public.modules m on lm.module_id = m.id
order by p.id, m.lesson_order, lm.skill_name;
