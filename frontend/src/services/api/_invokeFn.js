// Shared helper for calling Supabase Edge Functions.
// Used by bktApi (knowledge-states, final-history), adminApi.users.delete,
// and adminApi.users.details (learner-metrics).

import { supabase } from '../../lib/supabase';

export const invokeFn = async (name, options = {}) => {
  const { data, error } = await supabase.functions.invoke(name, options);
  if (error) throw error;
  return data;
};
