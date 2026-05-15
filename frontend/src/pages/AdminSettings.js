import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../App';
import AdminNavbar from '../components/AdminNavbar';
import Notification from '../components/Notification';
import { applyAppearanceSettings, getStoredAppearanceSettings, saveAppearanceSettings } from '../utils/appearanceSettings';

const AdminSettings = () => {
  const { user } = useAuth();
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [adminUsername, setAdminUsername] = useState('');

  // Appearance settings from localStorage (admin-specific keys)
  const [theme, setTheme] = useState(() => getStoredAppearanceSettings(true).theme);
  const [fontSize, setFontSize] = useState(() => getStoredAppearanceSettings(true).fontSize);
  const [uiSize, setUiSize] = useState(() => getStoredAppearanceSettings(true).uiSize);

  // Certificate template
  const [certTemplate, setCertTemplate] = useState(null);
  const [certUploading, setCertUploading] = useState(false);
  const [certZones, setCertZones] = useState(null);
  const certFileRef = useRef(null);

  // Modals
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showFontSizeModal, setShowFontSizeModal] = useState(false);
  const [showUiSizeModal, setShowUiSizeModal] = useState(false);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  useEffect(() => {
    const settings = getStoredAppearanceSettings(true);
    setTheme(settings.theme);
    setFontSize(settings.fontSize);
    setUiSize(settings.uiSize);
    applyAppearanceSettings(settings);

    const fetchAdminContact = async () => {
      try {
        const response = await axios.get('/users/profile', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        setAdminUsername(response.data?.Username || user?.username || '');
      } catch (error) {
        setAdminUsername(user?.username || '');
      }
    };

    fetchAdminContact();
    fetchCertTemplate();
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
    if (user?.userId) {
      localStorage.setItem(`userTheme:${user.userId}`, newTheme);
    }
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

  const handleUpdateUsername = async (newUsername) => {
    try {
      await axios.put('/users/profile', { username: newUsername });

      setAdminUsername(newUsername);
      setShowUsernameModal(false);
      showNotification('Username updated successfully');
    } catch (error) {
      showNotification(error.response?.data?.message || 'Failed to update username', 'error');
    }
  };

  const handleUpdatePassword = async (passwords) => {
    try {
      await axios.post('/users/change-password', passwords);

      setShowPasswordModal(false);
      showNotification('Password updated successfully');
    } catch (error) {
      showNotification(error.response?.data?.message || 'Failed to update password', 'error');
    }
  };

  const fetchCertTemplate = async () => {
    try {
      const res = await axios.get('/admin/certificate/template', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const tmpl = res.data.template || null;
      setCertTemplate(tmpl);
      setCertZones(tmpl?.textConfig || null);
    } catch {
      setCertTemplate(null);
      setCertZones(null);
    }
  };

  const handleCertUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isAllowed = file.type === 'application/pdf' || file.type.startsWith('image/');
    if (!isAllowed) {
      showNotification('Only PDF or image files (WebP, PNG, JPG, GIF, BMP, TIFF) are allowed.', 'error');
      e.target.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showNotification('File exceeds the 10 MB limit.', 'error');
      e.target.value = '';
      return;
    }

    setCertUploading(true);
    const formData = new FormData();
    formData.append('template', file);
    try {
      const res = await axios.post('/admin/certificate/template', formData, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      setCertTemplate(res.data.template);
      setCertZones(res.data.template?.textConfig || null);
      showNotification('Certificate template uploaded successfully.');
    } catch (err) {
      showNotification(err.response?.data?.error || 'Upload failed.', 'error');
    } finally {
      setCertUploading(false);
      e.target.value = '';
    }
  };

  const handleCertDelete = async () => {
    try {
      await axios.delete('/admin/certificate/template', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setCertTemplate(null);
      setCertZones(null);
      showNotification('Certificate template removed.');
    } catch (err) {
      showNotification(err.response?.data?.error || 'Failed to remove template.', 'error');
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

        {/* Certificate Template Section */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold text-secondary mb-6 flex items-center gap-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            Certificate Template
          </h2>

          <p className="text-sm text-gray-500 mb-4">
            Upload the certificate template that will be used when printing a learner's certificate.
            Accepted formats: <strong>PDF</strong> or any image (<strong>WebP, PNG, JPG, GIF, BMP, TIFF</strong>). Maximum file size: <strong>10 MB</strong>.
            {' '}For image templates, name and date are overlaid at the configured positions.
            For PDF templates, text is stamped onto the first page.
          </p>

          {certTemplate ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-gray-50 rounded-lg border border-border">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 bg-[#346C9A]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  {certTemplate.mimetype?.startsWith('image/') ? (
                    <svg className="w-5 h-5 text-[#346C9A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-[#346C9A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{certTemplate.originalName}</p>
                  <p className="text-xs text-gray-500">
                    {certTemplate.mimetype?.startsWith('image/') ? `Image (${certTemplate.originalName?.split('.').pop()?.toUpperCase() || 'IMG'})` : 'PDF Document'}
                    {certTemplate.size ? ` · ${formatFileSize(certTemplate.size)}` : ''}
                    {certTemplate.uploadedAt ? ` · Uploaded ${new Date(certTemplate.uploadedAt).toLocaleDateString()}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => certFileRef.current?.click()}
                  disabled={certUploading}
                  className="px-4 py-2 bg-[#346C9A] text-white rounded-lg hover:bg-[#2A5D84] transition-all text-sm font-semibold disabled:opacity-50"
                >
                  Replace
                </button>
                <button
                  onClick={handleCertDelete}
                  className="px-4 py-2 bg-[#D93B3B] hover:bg-[#B82E2E] text-white rounded-lg transition-all text-sm font-semibold"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 gap-3">
              <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <p className="text-gray-500 text-sm">No certificate template uploaded yet.</p>
              <button
                onClick={() => certFileRef.current?.click()}
                disabled={certUploading}
                className="px-5 py-2 bg-[#346C9A] text-white rounded-lg hover:bg-[#2A5D84] transition-all font-semibold disabled:opacity-50"
              >
                {certUploading ? 'Uploading...' : 'Upload Template'}
              </button>
            </div>
          )}

          {certTemplate && (
            <CertZoneEditor
              template={certTemplate}
              savedConfig={certZones}
              onSaved={(cfg) => setCertZones(cfg)}
              onNotify={showNotification}
            />
          )}

          <input
            ref={certFileRef}
            type="file"
            accept=".pdf,.webp,.png,.jpg,.jpeg,.gif,.bmp,.tiff,.tif,application/pdf,image/*"
            className="hidden"
            onChange={handleCertUpload}
          />
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
                <h3 className="font-semibold text-gray-900">Username</h3>
                <p className="text-sm text-gray-500">{adminUsername || user?.username || 'Not set'}</p>
              </div>
              <button
                onClick={() => setShowUsernameModal(true)}
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

      {showUsernameModal && (
        <UsernameModal
          currentUsername={adminUsername || user?.username || ''}
          onSave={handleUpdateUsername}
          onClose={() => setShowUsernameModal(false)}
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

const UsernameModal = ({ currentUsername, onSave, onClose }) => {
  const [username, setUsername] = useState(currentUsername);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4">
        <h3 className="text-2xl font-bold mb-4">Change Username</h3>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-[#346C9A] focus:outline-none mb-4"
          placeholder="Enter new username"
        />
        <div className="flex gap-3">
          <button
            onClick={() => onSave(username)}
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

// ─── Certificate zone editor ──────────────────────────────────────────────────

const DEFAULT_CERT_ZONES = {
  name: { x: 15, y: 42, width: 70, height: 12 },
  date: { x: 25, y: 57, width: 50, height: 8 }
};

const ZONE_CFG = {
  name: { label: 'Full Name', color: '#059669', bg: 'rgba(16,185,129,0.15)', border: '#059669' },
  date: { label: 'Date',      color: '#d97706', bg: 'rgba(245,158,11,0.15)', border: '#d97706' }
};

const HANDLE_POSITIONS = {
  nw: { top: -4,  left: -4 },
  n:  { top: -4,  left: 'calc(50% - 4px)' },
  ne: { top: -4,  right: -4 },
  e:  { top: 'calc(50% - 4px)', right: -4 },
  se: { bottom: -4, right: -4 },
  s:  { bottom: -4, left: 'calc(50% - 4px)' },
  sw: { bottom: -4, left: -4 },
  w:  { top: 'calc(50% - 4px)', left: -4 }
};

const HANDLE_CURSORS = {
  nw: 'nw-resize', n: 'n-resize', ne: 'ne-resize', e: 'e-resize',
  se: 'se-resize', s: 's-resize', sw: 'sw-resize', w: 'w-resize'
};

const ZoneBox = ({ field, zone, onStartDrag }) => {
  const cfg = ZONE_CFG[field];
  return (
    <div
      onMouseDown={(e) => onStartDrag(field, 'move', e)}
      style={{
        position: 'absolute',
        left: `${zone.x}%`, top: `${zone.y}%`,
        width: `${zone.width}%`, height: `${zone.height}%`,
        background: cfg.bg, border: `2px solid ${cfg.border}`,
        borderRadius: 3, cursor: 'move', zIndex: 10, boxSizing: 'border-box'
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: 4,
        fontSize: 10, fontWeight: 700, color: cfg.color,
        lineHeight: 1, pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap'
      }}>
        {cfg.label}
      </div>
      {Object.keys(HANDLE_POSITIONS).map(pos => (
        <div
          key={pos}
          onMouseDown={(e) => onStartDrag(field, pos, e)}
          style={{
            position: 'absolute', width: 8, height: 8,
            background: cfg.border, border: '1.5px solid white',
            borderRadius: 1, cursor: HANDLE_CURSORS[pos], zIndex: 11,
            ...HANDLE_POSITIONS[pos]
          }}
        />
      ))}
    </div>
  );
};

const CertZoneEditor = ({ template, savedConfig, onSaved, onNotify }) => {
  const [zones, setZones] = useState(() => ({
    name: { ...DEFAULT_CERT_ZONES.name, ...(savedConfig?.name || {}) },
    date: { ...DEFAULT_CERT_ZONES.date, ...(savedConfig?.date || {}) }
  }));
  const [saving, setSaving] = useState(false);
  const containerRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    setZones({
      name: { ...DEFAULT_CERT_ZONES.name, ...(savedConfig?.name || {}) },
      date: { ...DEFAULT_CERT_ZONES.date, ...(savedConfig?.date || {}) }
    });
  }, [savedConfig]);

  useEffect(() => {
    const onMove = (e) => {
      if (!dragRef.current || !containerRef.current) return;
      const { field, mode, startX, startY, startZone } = dragRef.current;
      const rect = containerRef.current.getBoundingClientRect();
      const dx = ((e.clientX - startX) / rect.width) * 100;
      const dy = ((e.clientY - startY) / rect.height) * 100;
      setZones(prev => {
        const z = { ...startZone };
        if (mode === 'move') {
          z.x = Math.max(0, Math.min(100 - z.width,  startZone.x + dx));
          z.y = Math.max(0, Math.min(100 - z.height, startZone.y + dy));
        } else {
          if (mode.includes('e')) z.width  = Math.max(5, Math.min(100 - startZone.x, startZone.width  + dx));
          if (mode.includes('w')) { const w = Math.max(5, startZone.width - dx); z.x = startZone.x + startZone.width - w; z.width = w; }
          if (mode.includes('s')) z.height = Math.max(3, Math.min(100 - startZone.y, startZone.height + dy));
          if (mode.includes('n')) { const h = Math.max(3, startZone.height - dy); z.y = startZone.y + startZone.height - h; z.height = h; }
        }
        return { ...prev, [field]: z };
      });
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const startDrag = (field, mode, e) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { field, mode, startX: e.clientX, startY: e.clientY, startZone: { ...zones[field] } };
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await axios.put('/admin/certificate/template/config', { textConfig: zones }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      onSaved(res.data.template?.textConfig || zones);
      onNotify('Zone positions saved.');
    } catch (err) {
      onNotify(err.response?.data?.error || 'Failed to save zone positions.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const isImage = template?.mimetype?.startsWith('image/');
  // Static files aren't proxied by Vite; use the backend origin directly
  const backendOrigin = `${window.location.protocol}//${window.location.hostname}:5000`;
  const templateSrc = `${backendOrigin}/uploads/cert-template/${template.filename}`;

  return (
    <div className="mt-5 border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-border flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">Text Zone Editor</span>
        <span className="text-xs text-gray-400">Drag to move · drag handles to resize</span>
      </div>

      {/* Legend */}
      <div className="px-4 py-2 bg-white border-b border-gray-100 flex flex-wrap items-center gap-4 text-xs text-gray-500">
        {Object.entries(ZONE_CFG).map(([key, cfg]) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm border-2" style={{ background: cfg.bg, borderColor: cfg.border }} />
            <span style={{ color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
          </span>
        ))}
        <span className="text-gray-400">— drag the colored box to move, drag its edge handles to resize</span>
      </div>

      {/* Canvas — fixed A4-landscape aspect ratio so zones scale correctly */}
      <div ref={containerRef} className="relative select-none" style={{ background: '#6b7280' }}>
        {/* Aspect-ratio spacer (A4 landscape ≈ 1.414:1) */}
        <div style={{ paddingBottom: '70.7%' }} />
        {/* Template preview fills the canvas absolutely */}
        <div className="absolute inset-0">
          {isImage ? (
            <img
              src={templateSrc}
              alt="Certificate template"
              className="w-full h-full object-contain block pointer-events-none"
              draggable={false}
              style={{ background: '#fff' }}
            />
          ) : (
            <embed
              src={templateSrc}
              type="application/pdf"
              className="w-full h-full block"
              style={{ pointerEvents: 'none' }}
            />
          )}
        </div>
        {/* Zone overlays — positioned over the full canvas */}
        {Object.keys(zones).map(field => (
          <ZoneBox key={field} field={field} zone={zones[field]} onStartDrag={startDrag} />
        ))}
      </div>

      <div className="px-4 py-3 bg-gray-50 border-t border-border flex flex-wrap items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 bg-[#346C9A] text-white rounded-lg hover:bg-[#2A5D84] font-semibold disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save Zone Positions'}
        </button>
        <button
          onClick={() => setZones({ name: { ...DEFAULT_CERT_ZONES.name }, date: { ...DEFAULT_CERT_ZONES.date } })}
          className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-100 text-sm font-medium"
        >
          Reset to Default
        </button>
        <span className="text-xs text-gray-400">
          Positions are stored and applied when printing any certificate.
        </span>
      </div>
    </div>
  );
};

export default AdminSettings;

