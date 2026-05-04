import { supabase } from '../../lib/supabase';
import { adaptAssessment } from './_adapters';

export const assessmentsApi = {
  async get(id) {
    const { data, error } = await supabase
      .from('assessments')
      .select('*, user_answers(*)')
      .eq('id', id)
      .single();
    if (error) throw error;
    return adaptAssessment(data);
  },

  async create({ moduleId, type }) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in');
    const { data, error } = await supabase
      .from('assessments')
      .insert({ user_id: user.id, module_id: moduleId, type })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async submitAnswer({ assessmentId, questionId, userAnswer, isCorrect, responseTime, skillTag, attemptNumber }) {
    const { data, error } = await supabase
      .from('user_answers')
      .insert({
        assessment_id:  assessmentId,
        question_id:    questionId,
        user_answer:    userAnswer,
        is_correct:     isCorrect,
        response_time:  responseTime ?? 0,
        skill_tag:      skillTag ?? null,
        attempt_number: attemptNumber ?? 1,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async finalize(id, { totalScore, resultStatus }) {
    const { data, error } = await supabase
      .from('assessments')
      .update({ total_score: totalScore, result_status: resultStatus })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};
