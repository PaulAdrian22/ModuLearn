// GET /functions/v1/bkt-final-history?moduleId=<uuid>
// Returns a learner's Final Assessment attempt history for a module.
// Replaces legacy GET /api/bkt/lesson/:moduleId/final/history.

import { authenticate, errorResponse, jsonResponse, preflight } from '../_shared/http.ts';

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);

  const ctx = await authenticate(req); if (ctx instanceof Response) return ctx;

  const url = new URL(req.url);
  const moduleId = url.searchParams.get('moduleId');
  if (!moduleId) return errorResponse('moduleId query param is required', 400);

  const { data, error } = await ctx.userClient
    .from('assessments')
    .select('id, total_score, result_status, date_taken')
    .eq('module_id', moduleId)
    .eq('type', 'Final')
    .neq('result_status', 'In Progress')
    .order('date_taken', { ascending: false });
  if (error) return errorResponse(error.message, 500);

  const attempts = (data ?? []).map((a, idx, arr) => ({
    attemptNumber: arr.length - idx,
    score: Number(a.total_score),
    status: a.result_status,
    date: a.date_taken,
  }));

  return jsonResponse({ totalAttempts: attempts.length, attempts });
});
