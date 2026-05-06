// POST /functions/v1/bkt-batch-update
// Replaces the Modal Python service. Runs the same BKT math using the shared
// TypeScript engine and writes results to the same DB tables.

import { authenticate, errorResponse, jsonResponse, preflight } from '../_shared/http.ts';
import {
  normalizeAssessmentType,
  getSkillParams,
  itemInteraction,
  computeWMInitial,
  computeRemainingL,
  computeMLesson,
  computeWLesson,
  computeWMLesson,
  computeOverallMastery,
  applyReviewTimeRules,
  applyFinalTimeRules,
} from '../_shared/bkt.ts';

interface AnswerInput {
  skill?: string;
  isCorrect?: boolean;
  responseTime?: number;
  questionType?: string;
  questionId?: string;
  attemptNumber?: number;
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const ctx = await authenticate(req); if (ctx instanceof Response) return ctx;
  const { userId, serviceClient } = ctx;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return errorResponse('Invalid JSON body', 400); }

  const answersRaw: AnswerInput[] = Array.isArray(body.answers) ? body.answers : [];
  if (!answersRaw.length) return errorResponse('answers array is required', 400);

  const assessmentType = normalizeAssessmentType(body.assessmentType as string);
  const moduleId: string | null = (body.moduleId as string) ?? null;
  const timeSpentSeconds: number = Number(body.timeSpentSeconds ?? 0);

  // Group by skill, skip 'No Skill'
  const grouped = new Map<string, AnswerInput[]>();
  for (const a of answersRaw) {
    const skill = a.skill || 'Memorization';
    if (skill === 'No Skill') continue;
    if (!grouped.has(skill)) grouped.set(skill, []);
    grouped.get(skill)!.push(a);
  }

  const skillResults: unknown[] = [];
  const timeRules: unknown[] = [];

  // Diagnostic: record responses only, no mastery update
  if (assessmentType === 'Diagnostic') {
    for (const [skillName, answers] of grouped) {
      const diagRows = answers
        .filter((a) => a.questionId)
        .map((a) => ({
          user_id: userId,
          module_id: moduleId,
          question_id: a.questionId,
          skill_name: skillName,
          is_correct: Boolean(a.isCorrect),
        }));
      if (diagRows.length) {
        await serviceClient.from('bkt_diagnostic_results').insert(diagRows);
      }
      skillResults.push({
        skillName,
        questionsAnswered: answers.length,
        questionsCorrect: answers.filter((a) => a.isCorrect).length,
        finalL: null,
      });
    }
    return jsonResponse({ ok: true, assessmentType: 'Diagnostic', moduleId, skills: skillResults, timeRules: [] });
  }

  for (const [skillName, answers] of grouped) {
    const params = getSkillParams(skillName);

    // Load or create the bkt_models row
    const { data: existing } = await serviceClient
      .from('bkt_models')
      .select('current_l, p_known')
      .eq('user_id', userId)
      .eq('skill_name', skillName)
      .maybeSingle();

    let currentL: number = existing
      ? Number(existing.current_l ?? existing.p_known ?? params.pInit)
      : params.pInit;

    if (!existing) {
      await serviceClient.from('bkt_models').insert({
        user_id: userId, skill_name: skillName,
        p_known: params.pInit, base_l: params.pInit, current_l: params.pInit,
      });
    }

    const interactions: unknown[] = [];
    let correctCount = 0;

    for (const a of answers) {
      const isCorrect = Boolean(a.isCorrect);
      const result = itemInteraction(currentL, skillName, isCorrect);
      if (isCorrect) correctCount++;
      currentL = result.currentL_after;

      interactions.push({
        question_id: a.questionId ?? null,
        is_correct: isCorrect,
        response_time: Number(a.responseTime ?? 0),
        attempt_number: Number(a.attemptNumber ?? 1),
        base_l_before: result.baseL_before,
        transition_l: result.transitionL,
        post_test_l: result.postTestL,
        current_l_after: result.currentL_after,
      });

      // Time rules
      if (assessmentType === 'Review') {
        const rule = applyReviewTimeRules(
          Number(a.responseTime ?? 0),
          Number(a.attemptNumber ?? 1),
          isCorrect,
        );
        timeRules.push({ skillName, ...rule });
      } else if (assessmentType === 'Final') {
        const rule = applyFinalTimeRules(
          Number(a.responseTime ?? 0),
          (a.questionType as 'Easy' | 'Situational') ?? 'Easy',
          isCorrect,
        );
        timeRules.push({ skillName, questionType: a.questionType, ...rule });
      }
    }

    // Persist item snapshots
    const itemRows = (interactions as Array<Record<string, unknown>>)
      .filter((i) => i.question_id)
      .map((i) => ({
        user_id: userId,
        module_id: moduleId,
        skill_name: skillName,
        assessment_type: assessmentType === 'Quiz' ? 'Review' : assessmentType,
        question_id: i.question_id,
        is_correct: i.is_correct,
        response_time: i.response_time,
        attempt_number: i.attempt_number,
        base_l_before: i.base_l_before,
        transition_l: i.transition_l,
        post_test_l: i.post_test_l,
        current_l_after: i.current_l_after,
      }));
    if (itemRows.length) {
      await serviceClient.from('bkt_item_responses').insert(itemRows);
    }

    const finalL = currentL;

    if (assessmentType === 'Initial') {
      const wmInit = computeWMInitial(finalL);
      const rem = computeRemainingL(wmInit);
      await serviceClient.from('bkt_overall_mastery').upsert(
        { user_id: userId, skill_name: skillName, initial_l: finalL, wm_initial: wmInit, remaining_l: rem },
        { onConflict: 'user_id,skill_name' },
      );
      await serviceClient.from('bkt_assessment_mastery').upsert(
        { user_id: userId, module_id: null, skill_name: skillName, assessment_type: 'Initial',
          mastery_value: finalL, questions_answered: answers.length, questions_correct: correctCount },
        { onConflict: 'user_id,module_id,skill_name,assessment_type' },
      );
    } else {
      await serviceClient.from('bkt_models').update({ current_l: finalL, p_known: finalL })
        .eq('user_id', userId).eq('skill_name', skillName);

      if (['Review', 'Simulation', 'Final'].includes(assessmentType)) {
        await serviceClient.from('bkt_assessment_mastery').upsert(
          { user_id: userId, module_id: moduleId, skill_name: skillName, assessment_type: assessmentType,
            mastery_value: finalL, questions_answered: answers.length, questions_correct: correctCount },
          { onConflict: 'user_id,module_id,skill_name,assessment_type' },
        );

        if (moduleId) {
          const { data: perAssessment } = await serviceClient
            .from('bkt_assessment_mastery')
            .select('assessment_type, mastery_value')
            .eq('user_id', userId).eq('module_id', moduleId).eq('skill_name', skillName);

          const byType: Record<string, number> = {};
          for (const r of perAssessment ?? []) byType[r.assessment_type] = Number(r.mastery_value ?? 0);

          const mLesson = computeMLesson(byType['Review'] ?? 0, byType['Final'] ?? 0, byType['Simulation'] ?? 0);
          const wLesson = computeWLesson();
          const wmLesson = computeWMLesson(mLesson, wLesson);

          await serviceClient.from('bkt_lesson_mastery').upsert(
            { user_id: userId, module_id: moduleId, skill_name: skillName,
              review_l: byType['Review'] ?? 0, simulation_l: byType['Simulation'] ?? 0,
              final_l: byType['Final'] ?? 0, m_lesson: mLesson, wm_lesson: wmLesson,
              is_passed: mLesson >= 0.85 },
            { onConflict: 'user_id,module_id,skill_name' },
          );
        }

        const { data: lessonRows } = await serviceClient
          .from('bkt_lesson_mastery').select('wm_lesson')
          .eq('user_id', userId).eq('skill_name', skillName);

        const tmLesson = Math.round(
          (lessonRows ?? []).reduce((s: number, r: Record<string, unknown>) => s + Number(r.wm_lesson ?? 0), 0) * 1_000_000
        ) / 1_000_000;

        const { data: overallRow } = await serviceClient
          .from('bkt_overall_mastery').select('wm_initial')
          .eq('user_id', userId).eq('skill_name', skillName).maybeSingle();

        const wmInitial = Number(overallRow?.wm_initial ?? 0);
        const overall = computeOverallMastery(wmInitial, tmLesson);

        await serviceClient.from('bkt_overall_mastery').upsert(
          { user_id: userId, skill_name: skillName, tm_lesson: tmLesson,
            overall_mastery: overall.overallMastery, is_mastered: overall.isMastered },
          { onConflict: 'user_id,skill_name' },
        );
      }
    }

    skillResults.push({ skillName, questionsAnswered: answers.length, questionsCorrect: correctCount, finalL });
  }

  return jsonResponse({ ok: true, assessmentType, moduleId, skills: skillResults, timeRules });
});
