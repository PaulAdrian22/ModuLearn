import { adaptQuestion } from './_adapters';
import { modulesApi } from './modules';

// The `questions` table was dropped (migration 20260428000300) — questions
// live as jsonb arrays on modules.diagnostic_questions / review_questions /
// final_questions, edited by AdminLessons.
export const questionsApi = {
  async forModule(moduleId) {
    const m = await modulesApi.get(moduleId);
    const buckets = [
      ...(Array.isArray(m?.diagnostic_questions) ? m.diagnostic_questions : []),
      ...(Array.isArray(m?.review_questions)     ? m.review_questions     : []),
      ...(Array.isArray(m?.final_questions)      ? m.final_questions      : []),
    ];
    return buckets.map(adaptQuestion);
  },
};
