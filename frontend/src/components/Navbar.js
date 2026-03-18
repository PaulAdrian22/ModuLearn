import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../App';
import { useProfile } from '../contexts/ProfileContext';
import Avatar from './Avatar';

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { profile, loading: profileLoading } = useProfile();

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      logout();
      navigate('/login');
    }
  };

  return (
    <nav className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-50">
      <div className="w-full px-8 flex items-center justify-between h-[72px]">
        {/* Logo */}
        <div className="flex items-center">
          <img 
            src="/images/logo.png" 
            alt="ModuLearn Logo" 
            className="h-12 w-auto object-contain"
          />
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/dashboard')}
            className={`relative flex items-center gap-2.5 px-5 py-3 text-sm font-semibold transition-colors duration-200 ${
              location.pathname === '/dashboard'
                ? 'text-[#1e3a5f]'
                : 'text-gray-400 hover:text-[#1e3a5f]'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span>Home</span>
            {location.pathname === '/dashboard' && (
              <span className="absolute bottom-0 left-4 right-4 h-[3px] bg-[#2BC4B3] rounded-full"></span>
            )}
          </button>

          <button
            onClick={() => navigate('/lessons')}
            className={`relative flex items-center gap-2.5 px-5 py-3 text-sm font-semibold transition-colors duration-200 ${
              location.pathname === '/lessons'
                ? 'text-[#1e3a5f]'
                : 'text-gray-400 hover:text-[#1e3a5f]'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span>Lessons</span>
            {location.pathname === '/lessons' && (
              <span className="absolute bottom-0 left-4 right-4 h-[3px] bg-[#2BC4B3] rounded-full"></span>
            )}
          </button>

          <button
            onClick={() => navigate('/progress')}
            className={`relative flex items-center gap-2.5 px-5 py-3 text-sm font-semibold transition-colors duration-200 ${
              location.pathname === '/progress'
                ? 'text-[#1e3a5f]'
                : 'text-gray-400 hover:text-[#1e3a5f]'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span>Skills & Mastery</span>
            {location.pathname === '/progress' && (
              <span className="absolute bottom-0 left-4 right-4 h-[3px] bg-[#2BC4B3] rounded-full"></span>
            )}
          </button>

          <button
            onClick={() => navigate('/simulations')}
            className={`relative flex items-center gap-2.5 px-5 py-3 text-sm font-semibold transition-colors duration-200 ${
              location.pathname === '/simulations'
                ? 'text-[#1e3a5f]'
                : 'text-gray-400 hover:text-[#1e3a5f]'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span>Simulations</span>
            {location.pathname === '/simulations' && (
              <span className="absolute bottom-0 left-4 right-4 h-[3px] bg-[#2BC4B3] rounded-full"></span>
            )}
          </button>

          <button
            onClick={() => navigate('/profile')}
            className={`relative flex items-center gap-2.5 px-5 py-3 text-sm font-semibold transition-colors duration-200 ${
              location.pathname === '/profile'
                ? 'text-[#1e3a5f]'
                : 'text-gray-400 hover:text-[#1e3a5f]'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>Settings</span>
            {location.pathname === '/profile' && (
              <span className="absolute bottom-0 left-4 right-4 h-[3px] bg-[#2BC4B3] rounded-full"></span>
            )}
          </button>

          {/* Admin Menu - Only visible for admins */}
          {user?.role === 'admin' && (
            <button
              onClick={() => navigate('/admin/lessons')}
              className={`relative flex items-center gap-2.5 px-5 py-3 text-sm font-semibold transition-colors duration-200 ${
                location.pathname.startsWith('/admin')
                  ? 'text-[#1e3a5f]'
                  : 'text-gray-400 hover:text-[#1e3a5f]'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              <span>Admin</span>
              {location.pathname.startsWith('/admin') && (
                <span className="absolute bottom-0 left-4 right-4 h-[3px] bg-[#2BC4B3] rounded-full"></span>
              )}
            </button>
          )}
        </div>

        {/* User Profile */}
        <div className="flex items-center space-x-4">
          <span className="text-[#1e3a5f] font-semibold text-sm">{user?.name || 'JUAN'}</span>
          <button 
            onClick={() => navigate('/profile')}
            className="hover:opacity-80 transition-opacity"
          >
            {!profileLoading && <Avatar user={profile} size="md" key={profile?.profile_picture || profile?.default_avatar} />}
          </button>
          <button onClick={handleLogout} className="flex items-center text-gray-400 hover:text-red-500 transition-colors duration-200 p-2 rounded-lg hover:bg-red-50" title="Logout">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;

