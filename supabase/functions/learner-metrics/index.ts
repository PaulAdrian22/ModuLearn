// GET /functions/v1/learner-metrics?userId=<uuid>
//
// Returns the AdminLearners "lesson metrics" aggregation: per-lesson
// progress, completion, time spent, mastery, retake counts. Replaces the
// legacy /users/:id/details endpoint that returned a server-side
// `lessonMetrics` array.
//
// Auth: caller must be admin OR the user themselves.

import { authenticate, errorResponse, isAdmin, jsonResponse, preflight } from '../_shared/http.ts';

interface LessonMetric {
  moduleId: string;
  lessonOrder: number | null;
  title: string;
  isCompleted: boolean;
  isUnlocked: boolean;
  completionRate: number;
  timeSpentSeconds: number;
  retakeCount: number;
  masteryAvg: number;       // average MLesson across skills (0..1)
  masteryPercent: number;   // 0..100
  perSkillMastery: Record<string, number>;
  finalAttempts: number;
  finalBestScore: number;
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);

  const ctx = await authenticate(req); if (ctx instanceof Response) return ctx;

  const url = new URL(req.url);
  const targetUserId = url.searchParams.get('userId');
  if (!targetUserId) return errorResponse('userId query param is required', 400);

  // Authz: caller must be the target user or an admin.
  if (targetUserId !== ctx.userId && !(await isAdmin(ctx))) {
    return errorResponse('Forbidden', 403);
  }

  const db = ctx.serviceClient;

  // Pull everything we need in parallel.
  const [
    profileRes, modulesRes, progressRes, timeLogsRes,
    lessonMasteryRes, finalsRes,
  ] = await Promise.all([
    db.from('profiles').select('id, name, username, role, last_login, created_at').eq('id', targetUserId).single(),
    db.from('modules').select('id, title, lesson_order, is_deleted').eq('is_deleted', false).order('lesson_order'),
    db.from('progress').select('module_id, completion_rate, is_unlocked, is_completed, date_started, date_completion').eq('user_id', targetUserId),
    db.from('lesson_time_logs').select('module_id, seconds').eq('user_id', targetUserId),
    db.from('bkt_lesson_mastery').select('module_id, skill_name, m_lesson, retake_count, is_passed').eq('user_id', targetUserId),
    db.from('assessments').select('module_id, total_score, result_status').eq('user_id', targetUserId).eq('type', 'Final'),
  ]);

  if (profileRes.error)        return errorResponse(profileRes.error.message, 500);
  if (modulesRes.error)        return errorResponse(modulesRes.error.message, 500);
  if (progressRes.error)       return errorResponse(progressRes.error.message, 500);
  if (timeLogsRes.error)       return errorResponse(timeLogsRes.error.message, 500);
  if (lessonMasteryRes.error)  return errorResponse(lessonMasteryRes.error.message, 500);
  if (finalsRes.error)         return errorResponse(finalsRes.error.message, 500);

  const progressByModule = new Map((progressRes.data ?? []).map((p) => [p.module_id, p]));

  // Sum time logs per module.
  const timeByModule = new Map<string, number>();
  for (const log of timeLogsRes.data ?? []) {
    timeByModule.set(log.module_id, (timeByModule.get(log.module_id) ?? 0) + Number(log.seconds || 0));
  }

  // Group lesson_mastery rows by module.
  const masteryByModule = new Map<string, { skills: Record<string, number>; retakeCount: number }>();
  for (const lm of lessonMasteryRes.data ?? []) {
    const slot = masteryByModule.get(lm.module_id) ?? { skills: {}, retakeCount: 0 };
    slot.skills[lm.skill_name] = Number(lm.m_lesson || 0);
    slot.retakeCount = Math.max(slot.retakeCount, Number(lm.retake_count || 0));
    masteryByModule.set(lm.module_id, slot);
  }

  // Group Final attempts by module.
  const finalsByModule = new Map<string, { count: number; best: number }>();
  for (const a of finalsRes.data ?? []) {
    const slot = finalsByModule.get(a.module_id) ?? { count: 0, best: 0 };
    if (a.result_status !== 'In Progress') {
      slot.count += 1;
      slot.best = Math.max(slot.best, Number(a.total_score || 0));
    }
    finalsByModule.set(a.module_id, slot);
  }

  const lessonMetrics: LessonMetric[] = (modulesRes.data ?? []).map((m) => {
    const p = progressByModule.get(m.id);
    const time = timeByModule.get(m.id) ?? 0;
    const mastery = masteryByModule.get(m.id);
    const finals = finalsByModule.get(m.id) ?? { count: 0, best: 0 };

    const skillValues = mastery ? Object.values(mastery.skills) : [];
    const masteryAvg = skillValues.length
      ? skillValues.reduce((s, v) => s + v, 0) / skillValues.length
      : 0;

    return {
      moduleId: m.id,
      lessonOrder: m.lesson_order ?? null,
      title: m.title,
      isCompleted: !!p?.is_completed,
      isUnlocked: !!p?.is_unlocked,
      completionRate: Number(p?.completion_rate ?? 0),
      timeSpentSeconds: time,
      retakeCount: mastery?.retakeCount ?? 0,
      masteryAvg: Math.round(masteryAvg * 1_000_000) / 1_000_000,
      masteryPercent: Math.round(masteryAvg * 100),
      perSkillMastery: mastery?.skills ?? {},
      finalAttempts: finals.count,
      finalBestScore: finals.best,
    };
  });

  // Roll-ups for the AdminLearners summary tile.
  const summary = {
    lessonsCompleted: lessonMetrics.filter((l) => l.isCompleted).length,
    lessonsTotal: lessonMetrics.length,
    totalTimeSpentSeconds: lessonMetrics.reduce((s, l) => s + l.timeSpentSeconds, 0),
    averageCompletionRate: lessonMetrics.length
      ? Math.round(lessonMetrics.reduce((s, l) => s + l.completionRate, 0) / lessonMetrics.length)
      : 0,
    averageMasteryPercent: lessonMetrics.length
      ? Math.round(lessonMetrics.reduce((s, l) => s + l.masteryPercent, 0) / lessonMetrics.length)
      : 0,
    finalAssessmentsTaken: lessonMetrics.reduce((s, l) => s + l.finalAttempts, 0),
  };

  return jsonResponse({
    profile: profileRes.data,
    summary,
    lessonMetrics,
  });
});
