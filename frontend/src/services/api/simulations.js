import { supabase } from '../../lib/supabase';
import { adaptSimulation } from './_adapters';

export const simulationsApi = {
  async list() {
    const { data, error } = await supabase
      .from('simulations')
      .select('*, simulation_progress(*)')
      .order('simulation_order', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(adaptSimulation);
  },

  async get(id) {
    const { data, error } = await supabase
      .from('simulations')
      .select('*, simulation_progress(*)')
      .eq('id', id)
      .single();
    if (error) throw error;
    return adaptSimulation(data);
  },

  async start(simulationId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in');
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('simulation_progress')
      .upsert({
        user_id:           user.id,
        simulation_id:     simulationId,
        completion_status: 'In Progress',
        date_started:      now,
      }, { onConflict: 'user_id,simulation_id' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async complete(simulationId, { score, timeSpent }) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in');
    const { data, error } = await supabase
      .from('simulation_progress')
      .upsert({
        user_id:           user.id,
        simulation_id:     simulationId,
        score,
        time_spent:        timeSpent ?? 0,
        completion_status: 'Completed',
        date_completed:    new Date().toISOString(),
      }, { onConflict: 'user_id,simulation_id' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};
