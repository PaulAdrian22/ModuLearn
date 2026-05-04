// Shared HTTP/auth helpers for Edge Functions.
//
// Supabase Edge Functions run on Deno. Browsers call them via
// supabase.functions.invoke(...) which sends the user's JWT as
// `Authorization: Bearer <token>`. We:
//   1. answer CORS preflight,
//   2. pull the user's id from the JWT (no extra DB round-trip),
//   3. open a service-role Supabase client for DB writes that bypass RLS
//      (writes are scoped to the verified userId so this is safe).

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

export function errorResponse(message: string, status = 500, extra: Record<string, unknown> = {}): Response {
  return jsonResponse({ error: message, ...extra }, { status });
}

export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  return null;
}

export interface AuthedContext {
  userId: string;
  userClient: SupabaseClient;     // operates as the caller; RLS applies
  serviceClient: SupabaseClient;  // bypasses RLS — only do scoped writes
}

export async function authenticate(req: Request): Promise<AuthedContext | Response> {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return errorResponse('Missing bearer token', 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });

  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return errorResponse('Invalid or expired token', 401);

  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  return { userId: user.id, userClient, serviceClient };
}

export async function isAdmin(ctx: AuthedContext): Promise<boolean> {
  const { data, error } = await ctx.serviceClient
    .from('profiles')
    .select('role')
    .eq('id', ctx.userId)
    .single();
  if (error) return false;
  return data?.role === 'admin';
}
