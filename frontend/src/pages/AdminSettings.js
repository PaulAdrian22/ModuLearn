import React, { useState, useEffect } from 'react';
import { useAuth } from '../App';
import { profileApi } from '../services/api';
import { supabase } from '../lib/supabase';
import { passwordErrorMessage } from '../utils/passwordPolicy';
import AdminNavbar from '../components/AdminNavbar';
import Notification from '../components/Notification';
import { applyAppearanceSettings, getStoredAppearanceSettings, saveAppearanceSettings } from '../utils/appearanceSettings';

const AdminSettings = () => {
  const { user } = useAuth();
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [adminEmail, setAdminEmail] = useState('');
  
  // Appearance settings from localStorage (admin-specific keys)
  const [theme, setTheme] = useState(() => getStoredAppearanceSettings(true).theme);
  const [fontSize, setFontSize] = useState(() => getStoredAppearanceSettings(true).fontSize);
  const [uiSize, setUiSize] = useState(() => getStoredAppearanceSettings(true).uiSize);
  
  // Modals
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showFontSizeModal, setShowFontSizeModal] = useState(false);
  const [showUiSizeModal, setShowUiSizeModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  useEffect(() => {
    const settings = getStoredAppearanceSettings(true);
    setTheme(settings.theme);
    setFontSize(settings.fontSize);
    setUiSize(settings.uiSize);
    applyAppearanceSettings(settings);

    setAdminEmail(user?.email || '');
    void profileApi;
  }, []);

  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: '', type: '' }), 3000);
  };

  // Theme handlers
  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    saveAppearanceSettings({ isAdmin: true, theme: newTheme });
    applyAppearanceSettings({ theme: newTheme, fontSize, uiSize });
    setShowThemeModal(false);
    showNotification('Theme updated successfully');
  };

  const handleFontSizeChange = (newSize) => {
    setFontSize(newSize);
    saveAppearanceSettings({ isAdmin: true, fontSize: newSize });
    applyAppearanceSettings({ theme, fontSize: newSize, uiSize });
    setShowFontSizeModal(false);
    showNotification('Font size updated successfully');
  };

  const handleUiSizeChange = (newSize) => {
    setUiSize(newSize);
    saveAppearanceSettings({ isAdmin: true, uiSize: newSize });
    applyAppearanceSettings({ theme, fontSize, uiSize: newSize });
    setShowUiSizeModal(false);
    showNotification('UI size updated successfully');
  };

  const handleUpdateEmail = async (newEmail) => {
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;
      setAdminEmail(newEmail);
      setShowEmailModal(false);
      showNotification('Email update requested. Check your inbox to confirm.');
    } catch (error) {
      showNotification(error.message || 'Failed to update email', 'error');
    }
  };

  const handleUpdatePassword = async (passwords) => {
    const issue = passwordErrorMessage(passwords.newPassword);
    if (issue) {
      showNotification(issue, 'error');
      return;
    }
    try {
      await profileApi.changePassword(passwords.newPassword);
      setShowPasswordModal(false);
      showNotification('Password updated successfully');
    } catch (error) {
      showNotification(error.message || 'Failed to update password', 'error');
    }
  };


  return (
    <div className="min-h-screen bg-background">
      <AdminNavbar />
      <div className="w-full px-8 py-8 min-h-[calc(100vh-80px)] custom-scrollbar">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-secondary">Admin Settings</h1>
          <p className="text-gray-600 mt-2">Manage your appearance and account preferences</p>
        </div>

        {notification.show && (
          <Notification
            message={notification.message}
            type={notification.type}
            onClose={() => setNotification({ show: false, message: '', type: '' })}
          />
        )}

        {/* Appearance Section */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold text-secondary mb-6 flex items-center gap-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
            Appearance
          </h2>
          
          <div className="space-y-4">
            {/* Theme Setting */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[#346C9A] rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Theme</h3>
                  <p className="text-sm text-gray-500">{theme}</p>
                </div>
              </div>
              <button
                onClick={() => setShowThemeModal(true)}
                className="px-4 py-2 bg-[#346C9A] text-white rounded-lg hover:bg-[#2A5D84] transition-all"
              >
                Change
              </button>
            </div>

            {/* Font Size Setting */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[#346C9A] rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Font Size</h3>
                  <p className="text-sm text-gray-500">{fontSize}</p>
                </div>
              </div>
              <button
                onClick={() => setShowFontSizeModal(true)}
                className="px-4 py-2 bg-[#346C9A] text-white rounded-lg hover:bg-[#2A5D84] transition-all"
              >
                Change
              </button>
            </div>

            {/* UI Size Setting */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[#346C9A] rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">UI Size</h3>
                  <p className="text-sm text-gray-500">{uiSize}</p>
                </div>
              </div>
              <button
                onClick={() => setShowUiSizeModal(true)}
                className="px-4 py-2 bg-[#346C9A] text-white rounded-lg hover:bg-[#2A5D84] transition-all"
              >
                Change
              </button>
            </div>
          </div>
        </div>

        {/* Account Section */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold text-secondary mb-6 flex items-center gap-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Account
          </h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div>
                <h3 className="font-semibold text-gray-900">Email</h3>
                <p className="text-sm text-gray-500">{adminEmail || user?.email || 'Not set'}</p>
              </div>
              <button
                onClick={() => setShowEmailModal(true)}
                className="px-4 py-2 bg-[#346C9A] text-white rounded-lg hover:bg-[#2A5D84] transition-all"
              >
                Change
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div>
                <h3 className="font-semibold text-gray-900">Password</h3>
                <p className="text-sm text-gray-500">**********</p>
              </div>
              <button
                onClick={() => setShowPasswordModal(true)}
                className="px-4 py-2 bg-[#346C9A] text-white rounded-lg hover:bg-[#2A5D84] transition-all"
              >
                Change
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Modals */}
      {showThemeModal && (
        <ThemeModal
          currentTheme={theme}
          onSave={handleThemeChange}
          onClose={() => setShowThemeModal(false)}
        />
      )}

      {showFontSizeModal && (
        <FontSizeModal
          currentSize={fontSize}
          onSave={handleFontSizeChange}
          onClose={() => setShowFontSizeModal(false)}
        />
      )}

      {showUiSizeModal && (
        <UiSizeModal
          currentSize={uiSize}
          onSave={handleUiSizeChange}
          onClose={() => setShowUiSizeModal(false)}
        />
      )}

      {showEmailModal && (
        <EmailModal
          currentEmail={adminEmail || user?.email || ''}
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

    </div>
  );
};

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
          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-[#346C9A] focus:outline-none mb-4"
          placeholder="Enter new email"
        />
        <div className="flex gap-3">
          <button
            onClick={() => onSave(email)}
            className="flex-1 px-4 py-2 bg-[#346C9A] text-white rounded-lg font-semibold hover:bg-[#2A5D84]"
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
          <div className="bg-amber-50 border border-amber-400 text-amber-700 px-4 py-2 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="relative">
            <input
              type={showPasswords.current ? 'text' : 'password'}
              value={passwords.currentPassword}
              onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
              className="w-full px-4 py-3 pr-12 border-2 border-gray-300 rounded-lg focus:border-[#346C9A] focus:outline-none"
              placeholder="Current password"
            />
            <button
              type="button"
              onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
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
              type={showPasswords.new ? 'text' : 'password'}
              value={passwords.newPassword}
              onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
              className="w-full px-4 py-3 pr-12 border-2 border-gray-300 rounded-lg focus:border-[#346C9A] focus:outline-none"
              placeholder="New password"
            />
            <button
              type="button"
              onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
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
              type={showPasswords.confirm ? 'text' : 'password'}
              value={passwords.confirmPassword}
              onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
              className="w-full px-4 py-3 pr-12 border-2 border-gray-300 rounded-lg focus:border-[#346C9A] focus:outline-none"
              placeholder="Confirm new password"
            />
            <button
              type="button"
              onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
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
            className="flex-1 px-4 py-2 bg-[#346C9A] text-white rounded-lg font-semibold hover:bg-[#2A5D84]"
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

// Theme Modal Component
const ThemeModal = ({ currentTheme, onSave, onClose }) => {
  const [selectedTheme, setSelectedTheme] = useState(currentTheme);
  const themes = ['Light Mode', 'Dark Mode', 'Auto'];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4">
        <h3 className="text-2xl font-bold mb-6">Select Theme</h3>
        <div className="space-y-3 mb-6">
          {themes.map((theme) => (
            <button
              key={theme}
              onClick={() => setSelectedTheme(theme)}
              className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                selectedTheme === theme
                  ? 'border-[#346C9A] bg-[#346C9A]/10'
                  : 'border-gray-200 hover:border-[#346C9A]/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{theme}</span>
                {selectedTheme === theme && (
                  <svg className="w-6 h-6 text-secondary" fill="currentColor" viewBox="0 0 20 20">
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
            className="flex-1 px-4 py-3 bg-[#346C9A] text-white rounded-lg font-semibold hover:bg-[#2A5D84]"
          >
            Apply
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// Font Size Modal Component
const FontSizeModal = ({ currentSize, onSave, onClose }) => {
  const [selectedSize, setSelectedSize] = useState(currentSize);
  const sizes = [
    { value: 'Small', label: 'Small', description: '15px - Compact text' },
    { value: 'Default', label: 'Default', description: '17px - Comfortable default' },
    { value: 'Large', label: 'Large', description: '19px - Easier to read' }
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4">
        <h3 className="text-2xl font-bold mb-6">Select Font Size</h3>
        <div className="space-y-3 mb-6">
          {sizes.map((size) => (
            <button
              key={size.value}
              onClick={() => setSelectedSize(size.value)}
              className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                selectedSize === size.value
                  ? 'border-[#346C9A] bg-[#346C9A]/10'
                  : 'border-gray-200 hover:border-[#346C9A]/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{size.label}</div>
                  <div className="text-sm text-gray-500">{size.description}</div>
                </div>
                {selectedSize === size.value && (
                  <svg className="w-6 h-6 text-secondary" fill="currentColor" viewBox="0 0 20 20">
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
            className="flex-1 px-4 py-3 bg-[#346C9A] text-white rounded-lg font-semibold hover:bg-[#2A5D84]"
          >
            Apply
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// UI Size Modal Component
const UiSizeModal = ({ currentSize, onSave, onClose }) => {
  const [selectedSize, setSelectedSize] = useState(currentSize);
  const sizes = [
    { value: 'Small', label: 'Compact', description: 'Tight spacing and compact elements' },
    { value: 'Default', label: 'Default', description: 'Standard UI components' },
    { value: 'Large', label: 'Comfortable', description: 'Generous spacing and larger elements' }
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4">
        <h3 className="text-2xl font-bold mb-6">Select UI Size</h3>
        <div className="space-y-3 mb-6">
          {sizes.map((size) => (
            <button
              key={size.value}
              onClick={() => setSelectedSize(size.value)}
              className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                selectedSize === size.value
                  ? 'border-[#346C9A] bg-[#346C9A]/10'
                  : 'border-gray-200 hover:border-[#346C9A]/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{size.label}</div>
                  <div className="text-sm text-gray-500">{size.description}</div>
                </div>
                {selectedSize === size.value && (
                  <svg className="w-6 h-6 text-secondary" fill="currentColor" viewBox="0 0 20 20">
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
            className="flex-1 px-4 py-3 bg-[#346C9A] text-white rounded-lg font-semibold hover:bg-[#2A5D84]"
          >
            Apply
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminSettings;

