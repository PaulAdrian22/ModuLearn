import { supabase } from '../../lib/supabase';

export const usersApi = {
  async stats() {
    // Returns the legacy nested shape consumed by Dashboard / DashboardOverview.
    // Skills/BKT mastery values are zero here — real values arrive once a
    // dedicated stats Edge Function aggregates from bkt_overall_mastery.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return {
        modules: { total: 0, completed: 0 },
        averageProgress: 0,
        skills: { total: 0, mastered: 0 },
        timeSpentMinutes: 0,
      };
    }
    const [{ data: modules }, { data: progressRows }] = await Promise.all([
      supabase.from('modules').select('id'),
      supabase.from('progress').select('completion_rate, date_completion'),
    ]);
    const total = (modules ?? []).length;
    const rows = progressRows ?? [];
    const completed = rows.filter((p) => p.date_completion).length;
    const avg = rows.length
      ? Math.round(rows.reduce((s, p) => s + Number(p.completion_rate || 0), 0) / rows.length)
      : 0;
    return {
      modules: { total, completed },
      averageProgress: avg,
      skills: { total: 0, mastered: 0 },
      timeSpentMinutes: 0,
    };
  },

  async learningProgressSummary() {
    // Mirrors the legacy /users/learning-progress-summary endpoint:
    // returns rows from v_user_progress_summary (RLS-filtered to caller).
    const { data, error } = await supabase
      .from('v_user_progress_summary')
      .select('*');
    if (error) throw error;
    return data ?? [];
  },
};
