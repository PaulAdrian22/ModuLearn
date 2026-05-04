import { supabase } from '../../lib/supabase';
import { profileApi } from './profiles';

export const storageApi = {
  publicUrl(bucket, key) {
    if (!key) return '';
    return supabase.storage.from(bucket).getPublicUrl(key).data.publicUrl;
  },

  async uploadAvatar(file) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in');
    const ext = file.name.split('.').pop();
    const key = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(key, file, { upsert: true, contentType: file.type });
    if (uploadError) throw uploadError;
    const url = this.publicUrl('avatars', key);
    await profileApi.update({ profile_picture: url, avatar_type: 'custom' });
    return url;
  },

  async selectDefaultAvatar(avatarName) {
    return profileApi.update({
      avatar_type: 'default',
      default_avatar: avatarName,
      profile_picture: null,
    });
  },

  async deleteProfilePicture() {
    return profileApi.update({
      profile_picture: null,
      avatar_type: 'default',
    });
  },
};
