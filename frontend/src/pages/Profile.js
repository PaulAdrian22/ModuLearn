import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { profileApi, storageApi, adminApi } from '../services/api';
import { passwordErrorMessage } from '../utils/passwordPolicy';
import { useProfile } from '../contexts/ProfileContext';
import Navbar from '../components/Navbar';
import Notification from '../components/Notification';
import Avatar from '../components/Avatar';
import ImageCropper from '../components/ImageCropper';
import { applyAppearanceSettings, getStoredAppearanceSettings, saveAppearanceSettings } from '../utils/appearanceSettings';
import { API_SERVER_URL } from '../config/api';
import { themedConfirm } from '../utils/themedConfirm';

const toAvatarUrl = (value = '') => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  return `${API_SERVER_URL}${normalized}`;
};

const normalizePreferredLanguageValue = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();

  if (normalized === 'english') return 'English';
  if (normalized === 'taglish' || normalized === 'filipino' || normalized === 'tagalog') return 'Taglish';

  return 'English';
};

const getThemeDisplayLabel = (value, isTaglish = false) => {
  const normalized = String(value || '').trim();

  if (!isTaglish) {
    return normalized || 'Light Mode';
  }

  if (normalized === 'Light Mode') return 'Maliwanag';
  if (normalized === 'Dark Mode') return 'Madilim';
  if (normalized === 'Auto') return 'Awtomatiko';

  return normalized || 'Maliwanag';
};

const getFontSizeDisplayLabel = (value, isTaglish = false) => {
  const normalized = String(value || '').trim();

  if (!isTaglish) {
    return normalized || 'Default';
  }

  if (normalized === 'Small') return 'Maliit';
  if (normalized === 'Large') return 'Malaki';

  return normalized || 'Default';
};

const getUiSizeDisplayLabel = (value, isTaglish = false) => {
  const normalized = String(value || '').trim();

  if (!isTaglish) {
    return normalized || 'Default';
  }

  if (normalized === 'Small') return 'Compact';
  if (normalized === 'Large') return 'Komportable';

  return normalized || 'Default';
};

const Profile = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { profile, refreshProfile } = useProfile();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [theme, setTheme] = useState('Light Mode');
  const [fontSize, setFontSize] = useState('Default');
  const [uiSize, setUiSize] = useState('Default');
  const [preferredLanguage, setPreferredLanguage] = useState(() =>
    normalizePreferredLanguageValue(localStorage.getItem('preferredLanguage') || 'English')
  );
  const [loading, setLoading] = useState(false);
  const [showLoading, setShowLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '', show: false });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showFontSizeModal, setShowFontSizeModal] = useState(false);
  const [showUiSizeModal, setShowUiSizeModal] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showCropper, setShowCropper] = useState(false);
  const [imageToCrop, setImageToCrop] = useState(null);
  const isTaglish = preferredLanguage === 'Taglish';

  const settingsCopy = isTaglish
    ? {
      appearanceTitle: 'Itsura',
      themeLabel: 'Tema',
      fontSizeLabel: 'Laki ng Font',
      uiSizeLabel: 'Laki ng UI',
      languageLabel: 'Wika',
      accountTitle: 'Account',
      usernameLabel: 'Username',
      emailLabel: 'Email',
      passwordLabel: 'Password',
      changeAvatarLabel: 'Palitan ang Avatar',
      changeAvatarHint: 'Pumili ng default avatar o mag-upload ng sarili mo',
      notSet: 'Walang nakalagay',
      saving: 'Nagse-save...',
      saveChanges: 'I-save ang Changes',
      discardChanges: 'I-discard ang Changes',
    }
    : {
      appearanceTitle: 'Appearance',
      themeLabel: 'Theme',
      fontSizeLabel: 'Font Size',
      uiSizeLabel: 'UI Size',
      languageLabel: 'Language',
      accountTitle: 'Account',
      usernameLabel: 'Username',
      emailLabel: 'Email',
      passwordLabel: 'Password',
      changeAvatarLabel: 'Change Avatar',
      changeAvatarHint: 'Select a default avatar or upload your own',
      notSet: 'Not set',
      saving: 'Saving...',
      saveChanges: 'Save Changes',
      discardChanges: 'Discard Changes',
    };

  useEffect(() => {
    // Sync form data when profile loads
    if (profile) {
      setFormData({
        name: profile.Name,
        email: profile.Email || '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
    }
    
    // Load saved preferences
    const { theme: savedTheme, fontSize: savedFontSize, uiSize: savedUiSize } = getStoredAppearanceSettings(false);
    setTheme(savedTheme);
    setFontSize(savedFontSize);
    setUiSize(savedUiSize);
    applyAppearanceSettings({ theme: savedTheme, fontSize: savedFontSize, uiSize: savedUiSize });

    const resolvedLanguage = normalizePreferredLanguageValue(
      localStorage.getItem('preferredLanguage') || profile?.preferredLanguage || 'English'
    );
    setPreferredLanguage(resolvedLanguage);
    localStorage.setItem('preferredLanguage', resolvedLanguage);
  }, [profile]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const syncPreferredLanguage = (value) => {
      const normalized = normalizePreferredLanguageValue(value || 'English');
      setPreferredLanguage(normalized);
      localStorage.setItem('preferredLanguage', normalized);
    };

    const handleStorage = (event) => {
      if (event.key !== 'preferredLanguage') return;
      syncPreferredLanguage(event.newValue);
    };

    const handlePreferredLanguageChanged = (event) => {
      const eventLanguage = event?.detail?.language;
      syncPreferredLanguage(eventLanguage || localStorage.getItem('preferredLanguage'));
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('preferredLanguageChanged', handlePreferredLanguageChanged);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('preferredLanguageChanged', handlePreferredLanguageChanged);
    };
  }, []);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setHasChanges(true);
  };

  const handleSaveChanges = async () => {
    setSaving(true);
    setMessage({ type: '', text: '', show: false });

    try {
      // Appearance settings (theme, font size, UI size) are saved immediately when changed
      // This handler is for other profile settings if needed in the future
      
      setMessage({ type: 'success', text: 'Settings saved successfully!', show: true });
      setHasChanges(false);
    } catch (err) {
      console.error('Error saving settings:', err);
      setMessage({ type: 'error', text: 'Failed to save settings', show: true });
    } finally {
      setSaving(false);
    }
  };

  const handleDiscardChanges = () => {
    // Appearance settings are applied immediately, so reload from localStorage
    const { theme: savedTheme, fontSize: savedFontSize, uiSize: savedUiSize } = getStoredAppearanceSettings(false);
    setTheme(savedTheme);
    setFontSize(savedFontSize);
    setUiSize(savedUiSize);
    applyAppearanceSettings({ theme: savedTheme, fontSize: savedFontSize, uiSize: savedUiSize });
    setFormData({
      name: profile?.Name || '',
      email: profile?.Email || '',
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    });
    setHasChanges(false);
    setMessage({ type: '', text: '', show: false });
  };

  const handleUpdateUsername = async (newName) => {
    try {
      // "Username" UI label maps to the display `name` column.
      await profileApi.update({ name: newName });
      setMessage({ type: 'success', text: 'Username updated successfully!', show: true });
      await refreshProfile();
      setShowUsernameModal(false);
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to update username', show: true });
    }
  };

  const handleUpdateEmail = async (newEmail) => {
    // Email changes go through Supabase Auth (sends a confirmation flow if enabled).
    try {
      const { error } = await (await import('../lib/supabase')).supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;
      setMessage({ type: 'success', text: 'Email update requested. Check your inbox to confirm.', show: true });
      await refreshProfile();
      setShowEmailModal(false);
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to update email', show: true });
    }
  };

  const handleUpdateLanguage = async (newLanguage) => {
    const normalizedLanguage = normalizePreferredLanguageValue(newLanguage);

    try {
      // Persist server-side so the choice follows the user across devices,
      // and client-side for instant reads.
      await profileApi.update({ preferred_language: normalizedLanguage });
      localStorage.setItem('preferredLanguage', normalizedLanguage);
      setPreferredLanguage(normalizedLanguage);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('preferredLanguageChanged', {
            detail: { language: normalizedLanguage },
          })
        );
      }
      setMessage({ type: 'success', text: 'Language updated successfully!', show: true });
      setShowLanguageModal(false);
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to update language', show: true });
    }
  };

  const handleUpdatePassword = async (passwords) => {
    const issue = passwordErrorMessage(passwords.newPassword);
    if (issue) {
      setMessage({ type: 'error', text: issue, show: true });
      return;
    }
    try {
      // Supabase Auth doesn't require the current password to set a new one;
      // the confirm-current-password step is UI-only.
      await profileApi.changePassword(passwords.newPassword);
      setMessage({ type: 'success', text: 'Password updated successfully!', show: true });
      setShowPasswordModal(false);
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to update password', show: true });
    }
  };

  const handleDeletePicture = async () => {
    const shouldDeletePicture = await themedConfirm({
      title: 'Delete Profile Picture?',
      message: 'Are you sure you want to delete your profile picture?',
      confirmText: 'Delete',
      cancelText: 'Keep',
      variant: 'danger'
    });

    if (!shouldDeletePicture) {
      return;
    }

    try {
      setMessage({ type: '', text: '', show: false });
      await storageApi.deleteProfilePicture();
      setMessage({ type: 'success', text: 'Profile picture deleted successfully!', show: true });
      await refreshProfile();
    } catch (err) {
      console.error('Error deleting picture:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to delete picture', show: true });
    }
  };

  const handleDeleteAccount = async () => {
    const shouldDeleteAccount = await themedConfirm({
      title: 'Delete Account?',
      message: 'Are you sure you want to delete your account? This action cannot be undone.',
      confirmText: 'Continue',
      cancelText: 'Cancel',
      variant: 'danger'
    });

    if (!shouldDeleteAccount) {
      return;
    }

    const shouldDeletePermanently = await themedConfirm({
      title: 'Permanently Delete?',
      message: 'This will permanently delete all your progress and data. Are you absolutely sure?',
      confirmText: 'Delete Forever',
      cancelText: 'Keep Account',
      variant: 'danger'
    });

    if (!shouldDeletePermanently) {
      return;
    }

    try {
      await adminApi.users.delete('self');
      setMessage({ type: 'success', text: 'Account deleted successfully', show: true });
      setTimeout(() => {
        logout();
        navigate('/register');
      }, 2000);
    } catch (err) {
      console.error('Error deleting account:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to delete account', show: true });
    }
  };

  const handleSelectDefaultAvatar = async (avatarName) => {
    try {
      setMessage({ type: '', text: '', show: false });
      await storageApi.selectDefaultAvatar(avatarName);
      setMessage({ type: 'success', text: 'Avatar updated successfully!', show: true });
      await refreshProfile();
      setShowAvatarModal(false);
    } catch (err) {
      console.error('Error selecting avatar:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to update avatar', show: true });
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!validTypes.includes(file.type)) {
      setMessage({ type: 'error', text: '*Images must be in JPG or PNG format and no larger than 10 MB.', show: true });
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setMessage({ type: 'error', text: '*Images must be in JPG or PNG format and no larger than 10 MB.', show: true });
      return;
    }

    // Read file and open cropper
    const reader = new FileReader();
    reader.onload = () => {
      setImageToCrop(reader.result);
      setShowCropper(true);
      setShowAvatarModal(false);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveCroppedImage = async (croppedImageBlob) => {
    try {
      setUploading(true);
      setShowCropper(false);
      setMessage({ type: '', text: '', show: false });

      const file = new File([croppedImageBlob], 'avatar.jpg', { type: 'image/jpeg' });
      await storageApi.uploadAvatar(file);

      setMessage({ type: 'success', text: 'Profile picture uploaded successfully!', show: true });
      await refreshProfile();
    } catch (err) {
      console.error('Error uploading picture:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to upload picture', show: true });
    } finally {
      setUploading(false);
    }
  };

  const handleEditCurrentAvatar = () => {
    let imageUrl;
    
    if (profile?.avatar_type === 'custom' && profile?.profile_picture) {
      // Edit existing custom avatar
      imageUrl = toAvatarUrl(profile.profile_picture);
    } else if (profile?.avatar_type === 'default' && profile?.default_avatar) {
      // Edit preset avatar - load it from public folder
      imageUrl = `/images/avatars/${profile.default_avatar}`;
    } else {
      // Fallback - shouldn't happen but handle it
      return;
    }
    
    setImageToCrop(imageUrl);
    setShowCropper(true);
    setShowAvatarModal(false);
  };

  if (!profile) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <Notification 
        message={message.show ? message.text : ''}
        type={message.type}
        onClose={() => setMessage({ type: '', text: '', show: false })}
      />

      {/* Main Content */}
      <div className="w-full px-8 py-8 custom-scrollbar">
        {/* Appearance Section */}
        <div className="bg-white rounded-2xl shadow-sm p-8 mb-6">
          <div className="flex items-center gap-3 mb-6 pb-6 border-b-4 border-highlight">
            <svg className="w-8 h-8 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            <h2 className="text-3xl font-bold text-secondary">{settingsCopy.appearanceTitle}</h2>
          </div>

          <div className="space-y-4">
            {/* Theme */}
            <div 
              onClick={() => setShowThemeModal(true)}
              className="flex items-center justify-between py-3 px-4 rounded-lg cursor-pointer"
            >
              <div>
                <h3 className="font-semibold text-gray-800">{settingsCopy.themeLabel}</h3>
                <p className="text-gray-500">{getThemeDisplayLabel(theme, isTaglish)}</p>
              </div>
              <svg className="w-6 h-6 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>

            {/* Font Size */}
            <div 
              onClick={() => setShowFontSizeModal(true)}
              className="flex items-center justify-between py-3 px-4 rounded-lg cursor-pointer"
            >
              <div>
                <h3 className="font-semibold text-gray-800">{settingsCopy.fontSizeLabel}</h3>
                <p className="text-gray-500">{getFontSizeDisplayLabel(fontSize, isTaglish)}</p>
              </div>
              <svg className="w-6 h-6 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>

            {/* UI Size */}
            <div 
              onClick={() => setShowUiSizeModal(true)}
              className="flex items-center justify-between py-3 px-4 rounded-lg cursor-pointer"
            >
              <div>
                <h3 className="font-semibold text-gray-800">{settingsCopy.uiSizeLabel}</h3>
                <p className="text-gray-500">{getUiSizeDisplayLabel(uiSize, isTaglish)}</p>
              </div>
              <svg className="w-6 h-6 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>

            {/* Language */}
            <div
              onClick={() => setShowLanguageModal(true)}
              className="flex items-center justify-between py-3 px-4 rounded-lg cursor-pointer"
            >
              <div>
                <h3 className="font-semibold text-gray-800">{settingsCopy.languageLabel}</h3>
                <p className="text-gray-500">{preferredLanguage}</p>
              </div>
              <svg className="w-6 h-6 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>

        {/* Account Section */}
        <div className="bg-white rounded-2xl shadow-sm p-8 mb-6">
          <div className="flex items-center gap-3 mb-6 pb-6 border-b-4 border-highlight">
            <svg className="w-8 h-8 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <h2 className="text-3xl font-bold text-secondary">{settingsCopy.accountTitle}</h2>
          </div>

          <div className="space-y-4">
            {/* Username */}
            <div 
              onClick={() => setShowUsernameModal(true)}
              className="flex items-center justify-between py-3 px-4 rounded-lg cursor-pointer"
            >
              <div>
                <h3 className="font-semibold text-gray-800">{settingsCopy.usernameLabel}</h3>
                <p className="text-gray-500">{profile?.Name || settingsCopy.notSet}</p>
              </div>
              <svg className="w-6 h-6 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>

            {/* Email */}
            <div 
              onClick={() => setShowEmailModal(true)}
              className="flex items-center justify-between py-3 px-4 rounded-lg cursor-pointer"
            >
              <div>
                <h3 className="font-semibold text-gray-800">{settingsCopy.emailLabel}</h3>
                <p className="text-gray-500">{profile?.Email || user?.email || settingsCopy.notSet}</p>
              </div>
              <svg className="w-6 h-6 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>

            {/* Password */}
            <div 
              onClick={() => setShowPasswordModal(true)}
              className="flex items-center justify-between py-3 px-4 rounded-lg cursor-pointer"
            >
              <div>
                <h3 className="font-semibold text-gray-800">{settingsCopy.passwordLabel}</h3>
                <p className="text-gray-500">**********</p>
              </div>
              <svg className="w-6 h-6 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>

            {/* Change Avatar */}
            <div 
              onClick={() => setShowAvatarModal(true)}
              className="flex items-center justify-between py-3 px-4 rounded-lg cursor-pointer"
            >
              <div className="flex items-center gap-4">
                <Avatar user={profile} size="lg" />
                <div>
                  <h3 className="font-semibold text-gray-800">{settingsCopy.changeAvatarLabel}</h3>
                  <p className="text-sm text-gray-500">{settingsCopy.changeAvatarHint}</p>
                </div>
              </div>
              <svg className="w-6 h-6 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-4">
          <button
            onClick={handleSaveChanges}
            disabled={!hasChanges || saving}
            className="px-8 py-3 bg-highlight text-white rounded-lg font-semibold shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? settingsCopy.saving : settingsCopy.saveChanges}
          </button>
          <button
            onClick={handleDiscardChanges}
            disabled={!hasChanges}
            className="px-8 py-3 bg-error text-white rounded-lg font-semibold shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {settingsCopy.discardChanges}
          </button>
        </div>
      </div>

      {/* Modals */}
      {showThemeModal && (
        <ThemeModal
          currentTheme={theme}
          isTaglish={isTaglish}
          onSave={(newTheme) => {
            setTheme(newTheme);
            saveAppearanceSettings({ isAdmin: false, theme: newTheme });
            applyAppearanceSettings({ theme: newTheme, fontSize, uiSize });
            setHasChanges(true);
            setShowThemeModal(false);
            setMessage({ type: 'success', text: 'Theme updated!', show: true });
          }}
          onClose={() => setShowThemeModal(false)}
        />
      )}

      {showFontSizeModal && (
        <FontSizeModal
          currentSize={fontSize}
          isTaglish={isTaglish}
          onSave={(newSize) => {
            setFontSize(newSize);
            saveAppearanceSettings({ isAdmin: false, fontSize: newSize });
            applyAppearanceSettings({ theme, fontSize: newSize, uiSize });
            setHasChanges(true);
            setShowFontSizeModal(false);
            setMessage({ type: 'success', text: 'Font size updated!', show: true });
          }}
          onClose={() => setShowFontSizeModal(false)}
        />
      )}

      {showUiSizeModal && (
        <UiSizeModal
          currentSize={uiSize}
          isTaglish={isTaglish}
          onSave={(newSize) => {
            setUiSize(newSize);
            saveAppearanceSettings({ isAdmin: false, uiSize: newSize });
            applyAppearanceSettings({ theme, fontSize, uiSize: newSize });
            setHasChanges(true);
            setShowUiSizeModal(false);
            setMessage({ type: 'success', text: 'UI size updated!', show: true });
          }}
          onClose={() => setShowUiSizeModal(false)}
        />
      )}

      {showLanguageModal && (
        <LanguageModal
          currentLanguage={preferredLanguage}
          isTaglish={isTaglish}
          onSave={handleUpdateLanguage}
          onClose={() => setShowLanguageModal(false)}
        />
      )}

      {showUsernameModal && (
        <UsernameModal
          currentName={profile?.Name || ''}
          onSave={handleUpdateUsername}
          onClose={() => setShowUsernameModal(false)}
        />
      )}

      {showEmailModal && (
        <EmailModal
          currentEmail={profile?.Email || user?.email || ''}
          onSave={handleUpdateEmail}
          onClose={() => setShowEmailModal(false)}
        />
      )}

      {showPasswordModal && (
        <PasswordModal
          onSave={handleUpdatePassword}
          onClose={() => setShowPasswordModal(false)}
        />
      )}

      {showAvatarModal && (
        <AvatarModal
          currentProfile={profile}
          onSelectDefault={handleSelectDefaultAvatar}
          onUploadCustom={handleFileChange}
          fileInputRef={fileInputRef}
          uploading={uploading}
          onClose={() => setShowAvatarModal(false)}
          onEditAvatar={handleEditCurrentAvatar}
        />
      )}

      {showCropper && imageToCrop && (
        <ImageCropper
          image={imageToCrop}
          onSave={handleSaveCroppedImage}
          onClose={() => {
            setShowCropper(false);
            setShowAvatarModal(true);
          }}
        />
      )}
    </div>
  );
};

// Username Modal Component
const UsernameModal = ({ currentName, onSave, onClose }) => {
  const [name, setName] = useState(currentName);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4">
        <h3 className="text-2xl font-bold mb-4">Change Username</h3>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-highlight focus:outline-none mb-4"
          placeholder="Enter new username"
        />
        <div className="flex gap-3">
          <button
            onClick={() => onSave(name)}
            className="flex-1 px-4 py-2 bg-highlight text-white rounded-lg font-semibold hover:bg-highlight"
          >
            Save
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// Email Modal Component
const EmailModal = ({ currentEmail, onSave, onClose }) => {
  const [email, setEmail] = useState(currentEmail);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4">
        <h3 className="text-2xl font-bold mb-4">Change Email</h3>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-highlight focus:outline-none mb-4"
          placeholder="Enter new email"
        />
        <div className="flex gap-3">
          <button
            onClick={() => onSave(email)}
            className="flex-1 px-4 py-2 bg-highlight text-white rounded-lg font-semibold hover:bg-highlight"
          >
            Save
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// Password Modal Component
const PasswordModal = ({ onSave, onClose }) => {
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  });

  const handleSubmit = () => {
    if (passwords.newPassword !== passwords.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (passwords.newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    onSave(passwords);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4">
        <h3 className="text-2xl font-bold mb-4">Change Password</h3>
        
        {error && (
          <div className="bg-error/10 border border-error text-error px-4 py-2 rounded-lg mb-4">
            {error}
          </div>
        )}
        
        <div className="space-y-4">
          <div className="relative">
            <input
              type={showPasswords.current ? "text" : "password"}
              value={passwords.currentPassword}
              onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
              className="w-full px-4 py-3 pr-12 border-2 border-gray-300 rounded-lg focus:border-highlight focus:outline-none"
              placeholder="Current password"
            />
            <button
              type="button"
              onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
              className="absolute right-3 top-1/2 text-gray-500"
            >
              {showPasswords.current ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              )}
            </button>
          </div>
          <div className="relative">
            <input
              type={showPasswords.new ? "text" : "password"}
              value={passwords.newPassword}
              onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
              className="w-full px-4 py-3 pr-12 border-2 border-gray-300 rounded-lg focus:border-highlight focus:outline-none"
              placeholder="New password"
            />
            <button
              type="button"
              onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
              className="absolute right-3 top-1/2 text-gray-500"
            >
              {showPasswords.new ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              )}
            </button>
          </div>
          <div className="relative">
            <input
              type={showPasswords.confirm ? "text" : "password"}
              value={passwords.confirmPassword}
              onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
              className="w-full px-4 py-3 pr-12 border-2 border-gray-300 rounded-lg focus:border-highlight focus:outline-none"
              placeholder="Confirm new password"
            />
            <button
              type="button"
              onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
              className="absolute right-3 top-1/2 text-gray-500"
            >
              {showPasswords.confirm ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              )}
            </button>
          </div>
        </div>
        
        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSubmit}
            className="flex-1 px-4 py-2 bg-highlight text-white rounded-lg font-semibold hover:bg-highlight"
          >
            Save
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// Avatar Modal Component
const AvatarModal = ({ currentProfile, onSelectDefault, onUploadCustom, fileInputRef, uploading, onClose, onEditAvatar }) => {
  const [selectedAvatar, setSelectedAvatar] = useState(currentProfile?.default_avatar || 'avatar1.png');
  
  const defaultAvatars = [
    'avatar1.png', 'avatar2.png', 'avatar3.png', 'avatar4.png',
    'avatar5.png', 'avatar6.png', 'avatar7.png', 'avatar8.png'
  ];

  const handleSelectAvatar = () => {
    onSelectDefault(selectedAvatar);
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-8 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-bold text-secondary">Choose Your Avatar</h3>
          <button 
            onClick={onClose}
            className="text-gray-400"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Current Avatar Preview */}
        <div className="mb-6 flex justify-center">
          <div className="text-center">
            <Avatar user={currentProfile} size="2xl" />
            <p className="text-sm text-gray-500 mt-2">Current Avatar</p>
            <button
              type="button"
              onClick={onEditAvatar}
              className="mt-3 px-4 py-2 bg-[#346C9A] text-white rounded-lg font-medium"
            >
              Edit Photo
            </button>
          </div>
        </div>

        {/* Default Avatars Section */}
        <div className="mb-8">
          <h4 className="text-lg font-semibold text-gray-800 mb-4">Default Avatars</h4>
          <div className="grid grid-cols-4 gap-4 mb-4">
            {defaultAvatars.map((avatar) => (
              <button
                key={avatar}
                onClick={() => setSelectedAvatar(avatar)}
                className={`relative aspect-square rounded-full overflow-hidden border-4 ${
                  selectedAvatar === avatar
                    ? 'border-highlight shadow-lg'
                    : 'border-gray-200 hover:border-highlight/50'
                }`}
              >
                <img 
                  src={`/images/avatars/${avatar}`} 
                  alt={`Avatar ${avatar}`}
                  className="w-full h-full object-contain"
                />
                {selectedAvatar === avatar && (
                  <div className="absolute inset-0 bg-highlight/20 flex items-center justify-center">
                    <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
          <button
            onClick={handleSelectAvatar}
            disabled={!selectedAvatar}
            className="w-full px-4 py-3 bg-highlight text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Use Selected Avatar
          </button>
        </div>

        {/* Divider */}
        <div className="relative mb-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-white text-gray-500 font-medium">OR</span>
          </div>
        </div>

        {/* Custom Upload Section */}
        <div>
          <h4 className="text-lg font-semibold text-gray-800 mb-4">Upload Custom Avatar</h4>
          <input
            type="file"
            ref={fileInputRef}
            onChange={onUploadCustom}
            accept="image/jpeg,image/jpg,image/png"
            className="hidden"
          />
          <button
            onClick={handleFileSelect}
            disabled={uploading}
            className="w-full px-4 py-3 bg-[#346C9A] text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? 'Uploading...' : 'Upload Photo'}
          </button>
          <p className="text-xs text-gray-500 mt-2 text-center">JPG or PNG (max 10 MB)</p>
        </div>

        {/* Close Button */}
        <div className="mt-6">
          <button
            onClick={onClose}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg font-semibold"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

const LanguageModal = ({ currentLanguage, onSave, onClose, isTaglish = false }) => {
  const [selectedLanguage, setSelectedLanguage] = useState(normalizePreferredLanguageValue(currentLanguage));
  const options = [
    { value: 'English', label: isTaglish ? 'Ingles' : 'English' },
    { value: 'Taglish', label: 'Taglish' },
  ];

  const modalCopy = isTaglish
    ? {
      title: 'Pumili ng Wika',
      save: 'I-save',
      cancel: 'I-cancel',
    }
    : {
      title: 'Select Language',
      save: 'Save',
      cancel: 'Cancel',
    };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4">
        <h3 className="text-2xl font-bold mb-6">{modalCopy.title}</h3>
        <div className="space-y-3 mb-6">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => setSelectedLanguage(option.value)}
              className={`w-full p-4 rounded-lg border-2 text-left ${
                selectedLanguage === option.value
                  ? 'border-highlight bg-highlight/10'
                  : 'border-gray-200 hover:border-highlight/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{option.label}</span>
                {selectedLanguage === option.value && (
                  <svg className="w-6 h-6 text-highlight-dark" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => onSave(selectedLanguage)}
            className="flex-1 px-4 py-2 bg-highlight text-white rounded-lg font-semibold hover:bg-[#346C9A]"
          >
            {modalCopy.save}
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50"
          >
            {modalCopy.cancel}
          </button>
        </div>
      </div>
    </div>
  );
};

// Theme Modal Component
const ThemeModal = ({ currentTheme, onSave, onClose, isTaglish = false }) => {
  const [selectedTheme, setSelectedTheme] = useState(currentTheme);
  const themes = [
    { value: 'Light Mode', label: isTaglish ? 'Maliwanag' : 'Light Mode' },
    { value: 'Dark Mode', label: isTaglish ? 'Madilim' : 'Dark Mode' },
    { value: 'Auto', label: isTaglish ? 'Awtomatiko' : 'Auto' },
  ];

  const modalCopy = isTaglish
    ? {
      title: 'Pumili ng Tema',
      apply: 'I-apply',
      cancel: 'I-cancel',
    }
    : {
      title: 'Select Theme',
      apply: 'Apply',
      cancel: 'Cancel',
    };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4">
        <h3 className="text-2xl font-bold mb-6">{modalCopy.title}</h3>
        <div className="space-y-3 mb-6">
          {themes.map((theme) => (
            <button
              key={theme.value}
              onClick={() => setSelectedTheme(theme.value)}
              className={`w-full p-4 rounded-lg border-2 text-left ${
                selectedTheme === theme.value
                  ? 'border-highlight bg-highlight/10'
                  : 'border-gray-200 hover:border-highlight/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{theme.label}</span>
                {selectedTheme === theme.value && (
                  <svg className="w-6 h-6 text-highlight-dark" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => onSave(selectedTheme)}
            className="flex-1 px-4 py-3 bg-highlight text-white rounded-lg font-semibold hover:bg-highlight"
          >
            {modalCopy.apply}
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50"
          >
            {modalCopy.cancel}
          </button>
        </div>
      </div>
    </div>
  );
};

// Font Size Modal Component
const FontSizeModal = ({ currentSize, onSave, onClose, isTaglish = false }) => {
  const [selectedSize, setSelectedSize] = useState(currentSize);
  const sizes = isTaglish
    ? [
      { value: 'Small', label: 'Maliit', description: '15px - Mas compact na text' },
      { value: 'Default', label: 'Default', description: '17px - Kumportableng default' },
      { value: 'Large', label: 'Malaki', description: '19px - Mas madaling basahin' },
    ]
    : [
      { value: 'Small', label: 'Small', description: '15px - Compact text' },
      { value: 'Default', label: 'Default', description: '17px - Comfortable default' },
      { value: 'Large', label: 'Large', description: '19px - Easier to read' },
    ];

  const modalCopy = isTaglish
    ? {
      title: 'Pumili ng Laki ng Font',
      apply: 'I-apply',
      cancel: 'I-cancel',
    }
    : {
      title: 'Select Font Size',
      apply: 'Apply',
      cancel: 'Cancel',
    };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4">
        <h3 className="text-2xl font-bold mb-6">{modalCopy.title}</h3>
        <div className="space-y-3 mb-6">
          {sizes.map((size) => (
            <button
              key={size.value}
              onClick={() => setSelectedSize(size.value)}
              className={`w-full p-4 rounded-lg border-2 text-left ${
                selectedSize === size.value
                  ? 'border-highlight bg-highlight/10'
                  : 'border-gray-200 hover:border-highlight/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{size.label}</div>
                  <div className="text-sm text-gray-500">{size.description}</div>
                </div>
                {selectedSize === size.value && (
                  <svg className="w-6 h-6 text-highlight-dark" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => onSave(selectedSize)}
            className="flex-1 px-4 py-3 bg-highlight text-white rounded-lg font-semibold hover:bg-highlight"
          >
            {modalCopy.apply}
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50"
          >
            {modalCopy.cancel}
          </button>
        </div>
      </div>
    </div>
  );
};

// UI Size Modal Component
const UiSizeModal = ({ currentSize, onSave, onClose, isTaglish = false }) => {
  const [selectedSize, setSelectedSize] = useState(currentSize);
  const sizes = isTaglish
    ? [
      { value: 'Small', label: 'Compact', description: 'Mas dikit na spacing at mas compact na elements' },
      { value: 'Default', label: 'Default', description: 'Standard na UI components' },
      { value: 'Large', label: 'Komportable', description: 'Mas maluwag na spacing at mas malalaking elements' },
    ]
    : [
      { value: 'Small', label: 'Compact', description: 'Tight spacing and compact elements' },
      { value: 'Default', label: 'Default', description: 'Standard UI components' },
      { value: 'Large', label: 'Comfortable', description: 'Generous spacing and larger elements' },
    ];

  const modalCopy = isTaglish
    ? {
      title: 'Pumili ng Laki ng UI',
      apply: 'I-apply',
      cancel: 'I-cancel',
    }
    : {
      title: 'Select UI Size',
      apply: 'Apply',
      cancel: 'Cancel',
    };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4">
        <h3 className="text-2xl font-bold mb-6">{modalCopy.title}</h3>
        <div className="space-y-3 mb-6">
          {sizes.map((size) => (
            <button
              key={size.value}
              onClick={() => setSelectedSize(size.value)}
              className={`w-full p-4 rounded-lg border-2 text-left ${
                selectedSize === size.value
                  ? 'border-highlight bg-highlight/10'
                  : 'border-gray-200 hover:border-highlight/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{size.label}</div>
                  <div className="text-sm text-gray-500">{size.description}</div>
                </div>
                {selectedSize === size.value && (
                  <svg className="w-6 h-6 text-highlight-dark" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => onSave(selectedSize)}
            className="flex-1 px-4 py-3 bg-highlight text-white rounded-lg font-semibold hover:bg-highlight"
          >
            {modalCopy.apply}
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50"
          >
            {modalCopy.cancel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Profile;
