// BKT API
//   knowledge-states / final-history → Supabase Edge Functions (pure SQL)
//   batch-update                     → Modal Python service running pyBKT
//                                      (the thesis-cited library)

import { supabase } from '../../lib/supabase';
import { invokeFn } from './_invokeFn';
import { enqueue, isOnline } from '../writeQueue';

const BKT_BATCH_UPDATE_URL = process.env.REACT_APP_BKT_BATCH_UPDATE_URL;

async function callModalBatchUpdate(body) {
  if (!BKT_BATCH_UPDATE_URL) {
    throw new Error(
      'REACT_APP_BKT_BATCH_UPDATE_URL is not set. Deploy the Modal service ' +
      '(python_services/modal_app.py) and put the URL in frontend/.env.local.'
    );
  }
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not signed in');

  const res = await fetch(BKT_BATCH_UPDATE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `BKT batch-update failed (${res.status})`);
  }
  return res.json();
}

export const bktApi = {
  knowledgeStates() {
    return invokeFn('bkt-knowledge-states', { method: 'GET' });
  },

  finalHistory(moduleId) {
    return invokeFn(`bkt-final-history?moduleId=${encodeURIComponent(moduleId)}`, { method: 'GET' });
  },

  batchUpdate({ answers, assessmentType = 'Review', moduleId = null, timeSpentSeconds }) {
    // Offline → queue the BKT update so the learner's mastery isn't lost.
    // Replay happens automatically on reconnect (App-level OfflineSync).
    if (!isOnline()) {
      enqueue('bkt.batchUpdate', { answers, assessmentType, moduleId, timeSpentSeconds });
      return Promise.resolve({ ok: true, _queued: true, skills: [], timeRules: [] });
    }
    return callModalBatchUpdate({ answers, assessmentType, moduleId, timeSpentSeconds });
  },
};
