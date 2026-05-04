import { supabase } from '../../lib/supabase';
import { adaptProgress } from './_adapters';
import { enqueue, isOnline } from '../writeQueue';

export const progressApi = {
  async list() {
    const { data, error } = await supabase
      .from('progress')
      .select('*, modules(*)')
      .order('date_started', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(adaptProgress);
  },

  // Idempotent: creates if missing, no-op if already started.
  // The seed_progress_unlock() trigger fills is_unlocked from the module's
  // global default.
  async start(moduleId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in');
    const { data, error } = await supabase
      .from('progress')
      .upsert(
        { user_id: user.id, module_id: moduleId },
        { onConflict: 'user_id,module_id', ignoreDuplicates: true }
      )
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async update(moduleId, patch) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in');
    // Auto-set is_completed when caller writes completion_rate >= 100. The
    // cascade_unlock_next_lesson() trigger uses is_completed to unlock the
    // next lesson for this user.
    const enriched = { ...patch };
    if (typeof enriched.completion_rate === 'number' && enriched.completion_rate >= 100) {
      enriched.is_completed = true;
      enriched.date_completion = enriched.date_completion ?? new Date().toISOString();
    }
    // Offline → queue the write, replay on reconnect.
    if (!isOnline()) {
      enqueue('progress.update', { moduleId, patch: enriched });
      return { ...enriched, _queued: true };
    }
    const { data, error } = await supabase
      .from('progress')
      .update(enriched)
      .eq('user_id', user.id)
      .eq('module_id', moduleId)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  // Time-tracking pings — append-only, write-best-effort.
  // ModuleView flushes ~30s at a time while the lesson tab is visible.
  async trackTime(moduleId, seconds) {
    const s = Math.max(0, Math.min(600, Math.floor(Number(seconds) || 0)));
    if (!moduleId || s <= 0) return null;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    if (!isOnline()) {
      enqueue('progress.trackTime', { moduleId, seconds: s });
      return { _queued: true };
    }
    const { data, error } = await supabase
      .from('lesson_time_logs')
      .insert({ user_id: user.id, module_id: moduleId, seconds: s })
      .select()
      .maybeSingle();
    if (error) {
      console.warn('trackTime failed (non-fatal)', error.message);
      return null;
    }
    return data;
  },
};
