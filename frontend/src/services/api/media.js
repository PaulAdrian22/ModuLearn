import { supabase } from '../../lib/supabase';

export const mediaApi = {
  async upload(file, { folder = '' } = {}) {
    const ext = file.name?.split('.').pop() ?? 'bin';
    const safeName = String(file.name ?? `file.${ext}`).replace(/[^a-z0-9._-]/gi, '_');
    const key = `${folder ? folder.replace(/\/+$/, '') + '/' : ''}${Date.now()}-${safeName}`;
    const { error } = await supabase.storage
      .from('lesson-media')
      .upload(key, file, { upsert: false, contentType: file.type });
    if (error) throw error;
    return {
      key,
      url: supabase.storage.from('lesson-media').getPublicUrl(key).data.publicUrl,
    };
  },
};
