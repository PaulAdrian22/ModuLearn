// POST /functions/v1/admin-delete-user
// Body: { userId: uuid }
//
// Deletes a Supabase Auth user (and via cascade, their profile + all related
// rows). Requires the caller to be an admin. Replaces legacy
// DELETE /api/users/delete/:id.
//
// Self-deletion variant: pass `{ userId: 'self' }` to delete the caller's
// own account. The frontend's Profile page uses this for "delete my account."

import { authenticate, errorResponse, isAdmin, jsonResponse, preflight } from '../_shared/http.ts';

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const ctx = await authenticate(req); if (ctx instanceof Response) return ctx;

  let body: { userId?: string };
  try { body = await req.json(); }
  catch { return errorResponse('Invalid JSON body', 400); }

  const target = body.userId === 'self' ? ctx.userId : body.userId;
  if (!target) return errorResponse('userId is required', 400);

  if (target !== ctx.userId) {
    if (!(await isAdmin(ctx))) return errorResponse('Admins only', 403);
  }

  const { error } = await ctx.serviceClient.auth.admin.deleteUser(target);
  if (error) return errorResponse(error.message, 500);

  return jsonResponse({ ok: true, deletedUserId: target });
});
