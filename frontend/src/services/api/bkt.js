// BKT API
//   knowledge-states / final-history / batch-update → Supabase Edge Functions

import { invokeFn } from './_invokeFn';
import { enqueue, isOnline } from '../writeQueue';

export const bktApi = {
  knowledgeStates() {
    return invokeFn('bkt-knowledge-states', { method: 'GET' });
  },

  finalHistory(moduleId) {
    return invokeFn(`bkt-final-history?moduleId=${encodeURIComponent(moduleId)}`, { method: 'GET' });
  },

  batchUpdate({ answers, assessmentType = 'Review', moduleId = null, timeSpentSeconds }) {
    if (!isOnline()) {
      enqueue('bkt.batchUpdate', { answers, assessmentType, moduleId, timeSpentSeconds });
      return Promise.resolve({ ok: true, _queued: true, skills: [], timeRules: [] });
    }
    return invokeFn('bkt-batch-update', {
      method: 'POST',
      body: { answers, assessmentType, moduleId, timeSpentSeconds },
    });
  },
};
