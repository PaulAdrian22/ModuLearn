import { supabase } from '../../lib/supabase';
import { adaptModule } from './_adapters';

// Reads from `v_user_modules` (RLS-scoped per-user view that merges
// progress.is_unlocked / is_completed onto each module — fixes the
// multi-user lesson unlock bug). Admin pages should use adminApi.modules
// for the raw modules table.
export const modulesApi = {
  async list({ language } = {}) {
    let q = supabase
      .from('v_user_modules')
      .select('*')
      .eq('is_deleted', false)
      .order('lesson_order', { ascending: true });
    if (language) q = q.eq('lesson_language', language);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(adaptModule);
  },

  async get(id) {
    const { data, error } = await supabase
      .from('v_user_modules')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return adaptModule(data);
  },
};
