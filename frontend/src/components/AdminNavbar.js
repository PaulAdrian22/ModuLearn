import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../App';
import { themedConfirm } from '../utils/themedConfirm';

const AdminNavbar = ({ beforeNavigate }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const canNavigate = async (targetPath) => {
    if (typeof beforeNavigate !== 'function') return true;
    try {
      const decision = beforeNavigate(targetPath);
      if (decision && typeof decision.then === 'function') {
        const resolvedDecision = await decision;
        return resolvedDecision !== false;
      }
      return decision !== false;
    } catch (err) {
      console.error('Navigation guard failed:', err);
      return false;
    }
  };

  const handleNavigate = async (targetPath) => {
    if (location.pathname === targetPath) return;
    if (!(await canNavigate(targetPath))) return;
    navigate(targetPath);
  };

  const handleLogout = async () => {
    if (!(await canNavigate('/login'))) return;

    const shouldLogout = await themedConfirm({
      title: 'Logout',
      message: 'Are you sure you want to logout?',
      confirmText: 'Logout',
      cancelText: 'Stay'
    });

    if (shouldLogout) {
      logout();
      navigate('/login');
    }
  };

  const navItems = [
    {
      icon: (
        <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4 13h6c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v8c0 .55.45 1 1 1zm0 8h6c.55 0 1-.45 1-1v-4c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1zm10 0h6c.55 0 1-.45 1-1v-8c0-.55-.45-1-1-1h-6c-.55 0-1 .45-1 1v8c0 .55.45 1 1 1zM13 4v4c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1h-6c-.55 0-1 .45-1 1z"/>
        </svg>
      ),
      label: 'Dashboard',
      path: '/admin/dashboard'
    },
    {
      icon: (
        <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z"/>
        </svg>
      ),
      label: 'Lessons & Assessments',
      path: '/admin/lessons'
    },
    {
      icon: (
        <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
        </svg>
      ),
      label: 'Learners',
      path: '/admin/learners'
    },
    {
      icon: (
        <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-8.25 7.09l2.16-2.85 2.59 3.47 3.5-4.37L21.75 16H6.75l5-2.91z"/>
        </svg>
      ),
      label: 'Simulations',
      path: '/admin/simulations'
    },
  ];

  return (
    <nav className="bg-white shadow-sm border-b border-gray-100 sticky top-0 z-50">
      <div className="w-full px-8">
        <div className="flex items-center justify-between h-[92px]">
          {/* Logo */}
          <div 
            className="flex items-center cursor-pointer"
            onClick={() => handleNavigate('/admin/dashboard')}
          >
            <img 
              src="/images/logo.png" 
              alt="ModuLearn Logo" 
              className="h-16 w-auto object-contain"
            />
          </div>

          {/* Navigation Items */}
          <div className="flex items-center gap-3">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path ||
                             (item.path === '/admin/lessons' && location.pathname.startsWith('/admin/lessons')) ||
                             (item.path === '/admin/simulations' && location.pathname.startsWith('/admin/simulations'));
              
              return (
                <button
                  key={item.path}
                  onClick={() => handleNavigate(item.path)}
                  className={`relative flex items-center gap-3 px-5 py-4 text-lg font-semibold transition-colors duration-200 ${
                    isActive
                      ? 'text-[#1e3a5f]'
                      : 'text-gray-400 hover:text-[#1e3a5f]'
                  }`}
                >
                  <span className={isActive ? 'text-[#1e3a5f]' : ''}>{item.icon}</span>
                  <span>{item.label}</span>
                  {isActive && (
                    <span className="absolute bottom-0 left-4 right-4 h-[3px] bg-[#2BC4B3] rounded-full"></span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Settings icon + Logout */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleNavigate('/admin/settings')}
              className={`flex items-center p-3 rounded-lg transition-colors duration-200 ${
                location.pathname === '/admin/settings'
                  ? 'text-[#1e3a5f] bg-[#2BC4B3]/10'
                  : 'text-gray-400 hover:text-[#1e3a5f] hover:bg-gray-100'
              }`}
              title="Settings"
            >
              <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
              </svg>
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center text-gray-400 hover:text-red-500 transition-colors duration-200 p-3 rounded-lg hover:bg-red-50"
              title="Logout"
            >
              <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default AdminNavbar;
