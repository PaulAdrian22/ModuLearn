import { supabase } from '../../lib/supabase';
import { adaptModule, adaptProfileRow, adaptSimulation } from './_adapters';
import { invokeFn } from './_invokeFn';

const PROTECTED_LESSON_ORDERS = [1, 2, 3, 4, 5, 6, 7];

// AddLesson still posts PascalCase keys ({ ModuleTitle, LessonOrder, ... }).
// Translate to the snake_case columns the new schema actually has, dropping
// fields we don't store anymore (roadmapStages, selectedSimulationId).
const MODULE_FIELD_MAP = {
  ModuleTitle:         'title',
  Description:         'description',
  LessonOrder:         'lesson_order',
  Tesda_Reference:     'tesda_reference',
  Is_Unlocked:         'is_unlocked',
  Is_Completed:        'is_completed',
  Is_Deleted:          'is_deleted',
  LessonTime:          'lesson_time',
  Difficulty:          'difficulty',
  LessonLanguage:      'lesson_language',
  sections:            'sections',
  diagnosticQuestions: 'diagnostic_questions',
  reviewQuestions:     'review_questions',
  finalQuestions:      'final_questions',
  finalInstruction:    'final_instruction',
};
function translateModulePayload(input) {
  if (!input || typeof input !== 'object') return input;
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    const mapped = MODULE_FIELD_MAP[k];
    if (mapped) out[mapped] = v;
    else if (k in { id: 1, created_at: 1, updated_at: 1 }) continue;
    else if (Object.values(MODULE_FIELD_MAP).includes(k)) out[k] = v; // already snake_case
    // unknown legacy keys (roadmapStages, etc.) silently dropped.
  }
  return out;
}

const adminModules = {
  async listAll({ includeDeleted = true } = {}) {
    let q = supabase.from('modules').select('*').order('lesson_order', { ascending: true });
    if (!includeDeleted) q = q.eq('is_deleted', false);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(adaptModule);
  },

  async create(payload) {
    const { data, error } = await supabase
      .from('modules').insert(translateModulePayload(payload)).select().single();
    if (error) throw error;
    return adaptModule(data);
  },

  async update(id, patch) {
    const { data, error } = await supabase
      .from('modules').update(translateModulePayload(patch)).eq('id', id).select().single();
    if (error) throw error;
    return adaptModule(data);
  },

  async setLockState(id, isUnlocked) {
    return this.update(id, { is_unlocked: !!isUnlocked });
  },

  async setCompletion(id, isCompleted) {
    return this.update(id, { is_completed: !!isCompleted });
  },

  // Soft-delete (recycle bin). Refuses on protected lesson_order 1..7.
  async softDelete(id) {
    const { data: row, error: readErr } = await supabase
      .from('modules').select('id, lesson_order, is_deleted').eq('id', id).single();
    if (readErr) throw readErr;
    if (PROTECTED_LESSON_ORDERS.includes(Number(row.lesson_order))) {
      throw new Error('Lessons 1-7 are protected and cannot be deleted.');
    }
    if (row.is_deleted) return { id, isDeleted: true };
    return this.update(id, { is_deleted: true, deleted_at: new Date().toISOString() });
  },

  async restore(id) {
    return this.update(id, { is_deleted: false, deleted_at: null });
  },

  async hardDelete(id) {
    const { data: row, error: readErr } = await supabase
      .from('modules').select('lesson_order').eq('id', id).single();
    if (readErr) throw readErr;
    if (PROTECTED_LESSON_ORDERS.includes(Number(row.lesson_order))) {
      throw new Error('Lessons 1-7 are protected and cannot be deleted.');
    }
    const { error } = await supabase.from('modules').delete().eq('id', id);
    if (error) throw error;
  },
};

const adminUsers = {
  async listAll() {
    const { data, error } = await supabase
      .from('profiles').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(adaptProfileRow);
  },

  // Aggregated per-lesson metrics come from the learner-metrics Edge Function.
  // Returns { profile, summary, lessonMetrics, progress, assessments }.
  async details(id) {
    const metrics = await invokeFn(
      `learner-metrics?userId=${encodeURIComponent(id)}`,
      { method: 'GET' },
    );
    const [{ data: progress }, { data: assessments }] = await Promise.all([
      supabase.from('progress').select('*, modules(*)').eq('user_id', id),
      supabase.from('assessments').select('*').eq('user_id', id).order('date_taken', { ascending: false }),
    ]);
    return {
      ...metrics,
      progress: progress ?? [],
      assessments: assessments ?? [],
    };
  },

  async delete(id) {
    return invokeFn('admin-delete-user', { method: 'POST', body: { userId: id } });
  },
};

const adminSimulations = {
  async list() {
    const { data, error } = await supabase
      .from('simulations').select('*')
      .order('module_id', { ascending: true })
      .order('simulation_order', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(adaptSimulation);
  },

  async get(id) {
    const { data, error } = await supabase
      .from('simulations').select('*').eq('id', id).single();
    if (error) throw error;
    return adaptSimulation(data);
  },

  async update(id, patch) {
    const { data, error } = await supabase
      .from('simulations').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return adaptSimulation(data);
  },
};

const adminDashboard = {
  async reportCount() {
    const { count, error } = await supabase
      .from('reports').select('*', { count: 'exact', head: true }).eq('status', 'open');
    if (error) throw error;
    return { count: count ?? 0 };
  },

  async certifiedCount() {
    // "Certified" = users whose overall mastery >= 0.85 across at least one skill.
    const { count, error } = await supabase
      .from('bkt_overall_mastery').select('*', { count: 'exact', head: true }).eq('is_mastered', true);
    if (error) throw error;
    return { count: count ?? 0 };
  },

  async recentActivity({ limit = 10 } = {}) {
    const { data, error } = await supabase
      .from('assessments')
      .select('id, type, total_score, date_taken, user_id, profiles(name)')
      .order('date_taken', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  },

  async notifications() {
    // Pending reports double as admin notifications for now.
    const { data, error } = await supabase
      .from('reports')
      .select('id, message, category, created_at, status, user_id, profiles(name)')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    return data ?? [];
  },
};

export const adminApi = {
  modules:     adminModules,
  users:       adminUsers,
  simulations: adminSimulations,
  dashboard:   adminDashboard,
};
