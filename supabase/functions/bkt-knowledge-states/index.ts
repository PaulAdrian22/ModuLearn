// GET /functions/v1/bkt-knowledge-states
// Returns the caller's BKT model rows joined with overall mastery, plus a
// proficiency_level enrichment. Replaces legacy GET /api/bkt/knowledge-states.

import { authenticate, errorResponse, jsonResponse, preflight } from '../_shared/http.ts';
import { getProficiencyLevel } from '../_shared/bkt.ts';

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);

  const ctx = await authenticate(req); if (ctx instanceof Response) return ctx;

  // Three reads: per-user mastery (bkt_models), overall (bkt_overall_mastery),
  // and the skill_parameters reference table for G/T/S enrichment in the
  // response (which used to live denormalized on every bkt_models row).
  const [modelsRes, overallRes, paramsRes] = await Promise.all([
    ctx.userClient.from('bkt_models').select('*').order('skill_name'),
    ctx.userClient.from('bkt_overall_mastery').select('*'),
    ctx.userClient.from('skill_parameters').select('*'),
  ]);
  if (modelsRes.error) return errorResponse(modelsRes.error.message, 500);
  if (overallRes.error) return errorResponse(overallRes.error.message, 500);
  if (paramsRes.error) return errorResponse(paramsRes.error.message, 500);

  const overallBySkill = new Map((overallRes.data ?? []).map((o) => [o.skill_name, o]));
  const paramsBySkill = new Map((paramsRes.data ?? []).map((p) => [p.skill_name, p]));

  // Re-emit with legacy PascalCase aliases so existing frontend consumers
  // (Progress.js, App.js token-tracker) keep parsing without changes.
  const enriched = (modelsRes.data ?? []).map((m) => {
    const o = overallBySkill.get(m.skill_name);
    const sp = paramsBySkill.get(m.skill_name);
    const overallMastery = Number(o?.overall_mastery ?? 0);
    return {
      ...m,
      SkillName: m.skill_name,
      PKnown: m.p_known,
      CurrentL: m.current_l,
      // Skill-level params now sourced from skill_parameters table.
      PLearn: sp?.p_learn ?? 0,
      PSlip:  sp?.p_slip  ?? 0,
      PGuess: sp?.p_guess ?? 0,
      InitialL: o?.initial_l ?? 0,
      WMInitial: o?.wm_initial ?? 0,
      RemainingL: o?.remaining_l ?? 1,
      TMLesson: o?.tm_lesson ?? 0,
      OverallMastery: overallMastery,
      IsMastered: o?.is_mastered ?? false,
      OverallMasteryPercent: o?.overall_mastery_percent ?? 0,
      TotalQuestionsMastered: o?.total_questions_mastered ?? 0,
      TotalQuestions: o?.total_questions ?? 0,
      proficiencyLevel: getProficiencyLevel(overallMastery),
    };
  });

  return jsonResponse(enriched);
});
