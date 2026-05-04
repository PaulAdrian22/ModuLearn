import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../App';
import { useProfile } from '../contexts/ProfileContext';
import Avatar from './Avatar';
import { themedConfirm } from '../utils/themedConfirm';
import { normalizePreferredLanguage } from '../utils/languagePreference';

const resolvePreferredLanguage = () => {
  if (typeof window === 'undefined') return 'English';
  return normalizePreferredLanguage(window.localStorage.getItem('preferredLanguage') || 'English');
};

const Navbar = ({ suppressAutoTour = false }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { profile, loading: profileLoading } = useProfile();

  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [preferredLanguage, setPreferredLanguage] = useState(resolvePreferredLanguage);
  const [isTourActive, setIsTourActive] = useState(false);
  const [tourStepIndex, setTourStepIndex] = useState(0);
  const [tourRect, setTourRect] = useState(null);

  const isTaglish = preferredLanguage === 'Taglish';

  const uiText = useMemo(() => ({
    home: 'Home',
    lessons: isTaglish ? 'Mga Lesson' : 'Lessons',
    mastery: isTaglish ? 'Skills at Mastery' : 'Skills & Mastery',
    simulations: 'Simulations',
    settings: 'Settings',
    admin: 'Admin',
    profile: 'Profile',
    logout: 'Logout',
    guideTitle: isTaglish ? 'Quick Guides' : 'System Guide',
    guideSubtitle: isTaglish
      ? 'Mabilis na gabay para sa ModuLearn navigation at core pages'
      : 'Quick help for navigating the ModuLearn learner pages',
    startTour: isTaglish ? 'Start Navigation Tour' : 'Start Navigation Tour',
    skipTour: isTaglish ? 'Skip Tour' : 'Skip Tour',
    next: isTaglish ? 'Next' : 'Next',
    back: isTaglish ? 'Back' : 'Back',
    done: isTaglish ? 'Done' : 'Done',
    close: isTaglish ? 'Close' : 'Close',
    logoutPrompt: isTaglish
      ? 'Sigurado ka bang gusto mong mag-logout?'
      : 'Are you sure you want to logout?',
    cancelLogout: isTaglish ? 'Stay' : 'Stay',
    guideOverview: isTaglish
      ? 'Need mo ng mabilis na refresher? Gamitin ang quick tour anytime para makita ulit ang main navigation.'
      : 'Need a quick refresher? You can replay the navigation tour anytime from here.',
    guideItem1: isTaglish
      ? 'Dashboard: tingnan ang learning path at progress cards'
      : 'Dashboard: view your learning path and progress cards',
    guideItem2: isTaglish
      ? 'Lessons: buksan at ipagpatuloy ang module flow'
      : 'Lessons: open and continue your module flow',
    guideItem3: isTaglish
      ? 'Skills & Mastery: i-check ang proficiency at achievements'
      : 'Skills & Mastery: review proficiency and achievements',
    guideItem4: isTaglish
      ? 'Simulations at Settings: practical tasks at account controls'
      : 'Simulations and Settings: practical tasks and account controls',
    tourProgressLabel: isTaglish ? 'Step' : 'Step'
  }), [isTaglish]);

  const tourSteps = useMemo(() => ([
    {
      id: 'home',
      selector: '[data-tour-target="home"]',
      title: isTaglish ? 'Home Tab' : 'Home Tab',
      description: isTaglish
        ? 'Dito mo makikita ang learning path, progress cards, at onboarding reminders.'
        : 'This is where you can see your learning path, progress cards, and onboarding reminders.'
    },
    {
      id: 'lessons',
      selector: '[data-tour-target="lessons"]',
      title: isTaglish ? 'Lessons Tab' : 'Lessons Tab',
      description: isTaglish
        ? 'Buksan dito ang lesson list at ituloy ang module na naka-unlock sa iyo.'
        : 'Open your lesson list here and continue unlocked modules.'
    },
    {
      id: 'mastery',
      selector: '[data-tour-target="mastery"]',
      title: isTaglish ? 'Skills at Mastery' : 'Skills & Mastery',
      description: isTaglish
        ? 'Dito naka-display ang proficiency, mastery level, at achievement tokens mo.'
        : 'This page shows your proficiency, mastery level, and achievement tokens.'
    },
    {
      id: 'simulations',
      selector: '[data-tour-target="simulations"]',
      title: isTaglish ? 'Simulations' : 'Simulations',
      description: isTaglish
        ? 'Gamitin ito para sa practical hands-on activities at scenario practice.'
        : 'Use this for practical hands-on activities and scenario practice.'
    },
    {
      id: 'settings',
      selector: '[data-tour-target="settings"]',
      title: isTaglish ? 'Settings' : 'Settings',
      description: isTaglish
        ? 'Manage profile, language preference, at account information dito.'
        : 'Manage your profile, language preference, and account details here.'
    },
    {
      id: 'guide',
      selector: '[data-tour-target="guide"]',
      title: isTaglish ? 'Quick Guides Button' : 'Quick Guides Button',
      description: isTaglish
        ? 'I-click ito anumang oras para ulitin ang tour at makita ang quick navigation help.'
        : 'Click this anytime to replay the tour and open quick navigation help.'
    }
  ]), [isTaglish]);

  const tourStorageKey = useMemo(() => {
    const uid = user?.userId || 'guest';
    return `modulearnNavTourSeen:${uid}`;
  }, [user?.userId]);

  const closeGuide = () => setIsGuideOpen(false);

  const closeTour = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(tourStorageKey, 'true');
    }

    setIsTourActive(false);
    setTourStepIndex(0);
    setTourRect(null);
  };

  const startTour = () => {
    closeGuide();
    setTourStepIndex(0);
    setIsTourActive(true);
  };

  useEffect(() => {
    if (!isGuideOpen) return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsGuideOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isGuideOpen]);

  useEffect(() => {
    const refreshLanguage = () => {
      setPreferredLanguage(resolvePreferredLanguage());
    };

    window.addEventListener('storage', refreshLanguage);
    window.addEventListener('preferredLanguageChanged', refreshLanguage);

    return () => {
      window.removeEventListener('storage', refreshLanguage);
      window.removeEventListener('preferredLanguageChanged', refreshLanguage);
    };
  }, []);

  useEffect(() => {
    if (user?.role === 'admin') return undefined;
    if (typeof window === 'undefined') return undefined;
    if (suppressAutoTour) return undefined;
    if (isTourActive) return undefined;

    if (window.localStorage.getItem(tourStorageKey) === 'true') {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setTourStepIndex(0);
      setIsTourActive(true);
    }, 900);

    return () => window.clearTimeout(timer);
  }, [tourStorageKey, user?.role, suppressAutoTour, isTourActive]);

  useEffect(() => {
    if (!isTourActive) return undefined;

    const step = tourSteps[tourStepIndex];
    if (!step) return undefined;

    let rafId = null;
    let settleTimeoutId = null;

    const updateRect = () => {
      const target = document.querySelector(step.selector);
      if (!target) {
        setTourRect(null);
        return;
      }

      const rect = target.getBoundingClientRect();
      setTourRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    };

    const alignTourToTarget = () => {
      const target = document.querySelector(step.selector);
      if (!target) {
        setTourRect(null);
        return;
      }

      if (typeof target.scrollIntoView === 'function') {
        try {
          target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        } catch (error) {
          target.scrollIntoView();
        }
      }

      rafId = window.requestAnimationFrame(updateRect);
      settleTimeoutId = window.setTimeout(updateRect, 420);
    };

    alignTourToTarget();

    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      if (settleTimeoutId !== null) {
        window.clearTimeout(settleTimeoutId);
      }
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [isTourActive, tourStepIndex, tourSteps]);

  useEffect(() => {
    if (!isTourActive) return undefined;

    const blockedKeys = new Set([
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'PageUp',
      'PageDown',
      'Home',
      'End',
      ' '
    ]);

    const listenerOptions = { passive: false };

    const preventPointerScroll = (event) => {
      event.preventDefault();
    };

    const preventScrollKeys = (event) => {
      if (blockedKeys.has(event.key)) {
        event.preventDefault();
      }
    };

    window.addEventListener('wheel', preventPointerScroll, listenerOptions);
    window.addEventListener('touchmove', preventPointerScroll, listenerOptions);
    window.addEventListener('keydown', preventScrollKeys, listenerOptions);

    return () => {
      window.removeEventListener('wheel', preventPointerScroll, listenerOptions);
      window.removeEventListener('touchmove', preventPointerScroll, listenerOptions);
      window.removeEventListener('keydown', preventScrollKeys, listenerOptions);
    };
  }, [isTourActive]);

  const handleLogout = async () => {
    const shouldLogout = await themedConfirm({
      title: uiText.logout,
      message: uiText.logoutPrompt,
      confirmText: uiText.logout,
      cancelText: uiText.cancelLogout,
    });

    if (shouldLogout) {
      logout();
      navigate('/login');
    }
  };

  const goToPreviousTourStep = () => {
    setTourStepIndex((prev) => Math.max(0, prev - 1));
  };

  const goToNextTourStep = () => {
    if (tourStepIndex >= tourSteps.length - 1) {
      closeTour();
      return;
    }

    setTourStepIndex((prev) => Math.min(tourSteps.length - 1, prev + 1));
  };

  const activeTourStep = isTourActive ? tourSteps[tourStepIndex] : null;

  return (
    <>
      <nav className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-50">
        <div className="w-full px-8 flex items-center justify-between h-[92px]">
        <div className="flex items-center">
          <img 
            src="/images/logo.png" 
            alt="ModuLearn Logo" 
            className="h-16 w-auto object-contain"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            data-tour-target="home"
            onClick={() => navigate('/dashboard')}
            className={`relative flex items-center gap-3 px-5 py-4 text-lg font-semibold transition-colors duration-200 ${
              location.pathname === '/dashboard'
                ? 'text-[#1e3a5f]'
                : 'text-gray-400 hover:text-[#1e3a5f]'
            }`}
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span>{uiText.home}</span>
            {location.pathname === '/dashboard' && (
              <span className="absolute bottom-0 left-4 right-4 h-[3px] bg-[#2BC4B3] rounded-full"></span>
            )}
          </button>

          <button
            data-tour-target="lessons"
            onClick={() => navigate('/lessons')}
            className={`relative flex items-center gap-3 px-5 py-4 text-lg font-semibold transition-colors duration-200 ${
              location.pathname === '/lessons'
                ? 'text-[#1e3a5f]'
                : 'text-gray-400 hover:text-[#1e3a5f]'
            }`}
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span>{uiText.lessons}</span>
            {location.pathname === '/lessons' && (
              <span className="absolute bottom-0 left-4 right-4 h-[3px] bg-[#2BC4B3] rounded-full"></span>
            )}
          </button>

          <button
            data-tour-target="mastery"
            onClick={() => navigate('/progress')}
            className={`relative flex items-center gap-3 px-5 py-4 text-lg font-semibold transition-colors duration-200 ${
              location.pathname === '/progress'
                ? 'text-[#1e3a5f]'
                : 'text-gray-400 hover:text-[#1e3a5f]'
            }`}
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span>{uiText.mastery}</span>
            {location.pathname === '/progress' && (
              <span className="absolute bottom-0 left-4 right-4 h-[3px] bg-[#2BC4B3] rounded-full"></span>
            )}
          </button>

          <button
            data-tour-target="simulations"
            onClick={() => navigate('/simulations')}
            className={`relative flex items-center gap-3 px-5 py-4 text-lg font-semibold transition-colors duration-200 ${
              location.pathname === '/simulations'
                ? 'text-[#1e3a5f]'
                : 'text-gray-400 hover:text-[#1e3a5f]'
            }`}
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span>{uiText.simulations}</span>
            {location.pathname === '/simulations' && (
              <span className="absolute bottom-0 left-4 right-4 h-[3px] bg-[#2BC4B3] rounded-full"></span>
            )}
          </button>

          {user?.role === 'admin' && (
            <button
              onClick={() => navigate('/admin/lessons')}
              className={`relative flex items-center gap-3 px-5 py-4 text-lg font-semibold transition-colors duration-200 ${
                location.pathname.startsWith('/admin')
                  ? 'text-[#1e3a5f]'
                  : 'text-gray-400 hover:text-[#1e3a5f]'
              }`}
            >
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              <span>{uiText.admin}</span>
              {location.pathname.startsWith('/admin') && (
                <span className="absolute bottom-0 left-4 right-4 h-[3px] bg-[#2BC4B3] rounded-full"></span>
              )}
            </button>
          )}
        </div>

        <div className="flex items-center space-x-5">
          <span className="text-[#1e3a5f] font-semibold text-lg">{user?.name || 'JUAN'}</span>
          <button
            onClick={() => navigate('/profile')}
            className="hover:opacity-80 transition-opacity"
            title={uiText.profile}
          >
            {!profileLoading && <Avatar user={profile} size="nav" key={profile?.profile_picture || profile?.default_avatar} />}
          </button>
          <button
            data-tour-target="guide"
            onClick={() => setIsGuideOpen(true)}
            className="flex items-center text-gray-400 hover:text-[#2BC4B3] transition-colors duration-200 p-3 rounded-lg hover:bg-[#2BC4B3]/10"
            title={uiText.guideTitle}
            aria-label={uiText.guideTitle}
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12c.6.7 1 1.6 1 2.5V17h6v-.5c0-.9.4-1.8 1-2.5a7 7 0 00-4-12z"
              />
            </svg>
          </button>
          <button
            data-tour-target="settings"
            onClick={() => navigate('/profile')}
            className={`flex items-center p-3 rounded-lg transition-colors duration-200 ${
              location.pathname === '/profile'
                ? 'text-[#1e3a5f] bg-[#2BC4B3]/10'
                : 'text-gray-400 hover:text-[#1e3a5f] hover:bg-gray-100'
            }`}
            title={uiText.settings}
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button onClick={handleLogout} className="flex items-center text-gray-400 hover:text-red-500 transition-colors duration-200 p-3 rounded-lg hover:bg-red-50" title={uiText.logout}>
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
      </nav>

      {isGuideOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={closeGuide}>
          <div
            className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={uiText.guideTitle}
          >
            <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h2 className="text-xl font-bold text-[#1e3a5f]">{uiText.guideTitle}</h2>
                <p className="mt-1 text-sm text-gray-500">{uiText.guideSubtitle}</p>
              </div>
              <button
                onClick={closeGuide}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label={uiText.close}
                title={uiText.close}
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-5 px-6 py-5">
              <div className="rounded-xl border border-dashed border-[#2BC4B3]/60 bg-[#f0faf9] px-4 py-3 text-sm text-[#1e3a5f]">
                {uiText.guideOverview}
              </div>

              <button
                onClick={startTour}
                className="w-full rounded-xl bg-[#284C71] hover:bg-[#16324f] text-white font-semibold py-3 px-4 transition-colors"
              >
                {uiText.startTour}
              </button>

              <ul className="list-disc space-y-2 pl-5 text-sm text-gray-600">
                <li>{uiText.guideItem1}</li>
                <li>{uiText.guideItem2}</li>
                <li>{uiText.guideItem3}</li>
                <li>{uiText.guideItem4}</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {isTourActive && activeTourStep && tourRect && (
        <div className="fixed inset-0 z-[75] pointer-events-none">
          <div
            className="absolute rounded-2xl border-2 border-highlight animate-pulse"
            style={{
              top: `${tourRect.top - 8}px`,
              left: `${tourRect.left - 8}px`,
              width: `${tourRect.width + 16}px`,
              height: `${tourRect.height + 16}px`,
              boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.58), 0 0 32px rgba(43, 196, 179, 0.7)'
            }}
          />

          <div className="absolute left-1/2 -translate-x-1/2 bottom-6 w-[min(680px,calc(100vw-24px))] bg-white rounded-2xl shadow-2xl border border-gray-200 pointer-events-auto">
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-xs font-semibold uppercase tracking-wide text-highlight-dark mb-1">
                {uiText.tourProgressLabel} {tourStepIndex + 1} / {tourSteps.length}
              </p>
              <h3 className="text-lg font-bold text-primary">{activeTourStep.title}</h3>
              <p className="mt-1 text-sm text-gray-600">{activeTourStep.description}</p>
            </div>

            <div className="px-5 py-4 flex items-center justify-between gap-3">
              <button
                onClick={closeTour}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              >
                {uiText.skipTour}
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={goToPreviousTourStep}
                  disabled={tourStepIndex === 0}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {uiText.back}
                </button>
                <button
                  onClick={goToNextTourStep}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-highlight text-white hover:bg-[#1fa997]"
                >
                  {tourStepIndex === tourSteps.length - 1 ? uiText.done : uiText.next}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;