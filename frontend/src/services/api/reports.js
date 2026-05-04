import { supabase } from '../../lib/supabase';

export const reportsApi = {
  async file({ moduleId, sectionId, category, message }) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in');
    const { data, error } = await supabase
      .from('reports')
      .insert({
        user_id:    user.id,
        module_id:  moduleId ?? null,
        section_id: sectionId ?? null,
        category:   category ?? null,
        message,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async list() {
    const { data, error } = await supabase
      .from('reports')
      .select('*, profiles(name, username)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async resolve(id) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('reports')
      .update({
        status:      'resolved',
        resolved_by: user?.id ?? null,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};
