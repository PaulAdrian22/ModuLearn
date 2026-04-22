import React, { createContext, useState, useContext, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { ProfileProvider } from './contexts/ProfileContext';
import { applyAppearanceSettings, getStoredAppearanceSettings } from './utils/appearanceSettings';
import { API_BASE_URL } from './config/api';
import ThemedConfirmHost from './components/ThemedConfirmHost';

// Pages
import Landing from './pages/Landing';
import About from './pages/About';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Lessons from './pages/Lessons';
import ModuleView from './pages/ModuleView';
import Assessment from './pages/Assessment';
import FinalAssessment from './pages/FinalAssessment';
import InitialAssessment from './pages/InitialAssessment';
import Profile from './pages/Profile';
import Progress from './pages/Progress';
import Simulations from './pages/Simulations';
import SimulationActivity from './pages/SimulationActivity';
import AdminLessons from './pages/AdminLessons';
import AddLesson from './pages/AddLesson';
import AdminLearners from './pages/AdminLearners';
import AdminDashboard from './pages/AdminDashboard';
import AdminSettings from './pages/AdminSettings';
import AdminSimulations from './pages/AdminSimulations';
import AdminSimulationEditor from './pages/AdminSimulationEditor';

// Context
export const AuthContext = createContext();

// Axios configuration
axios.defaults.baseURL = API_BASE_URL;

// Auth Provider
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const verifyToken = async () => {
      if (token) {
        try {
          axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          const response = await axios.get('/auth/verify');
          setUser(response.data.user);
        } catch (error) {
          console.error('Token verification failed:', error);
          logout();
        }
      }
      setLoading(false);
    };

    verifyToken();
  }, [token]);

  const login = (userData, authToken) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem('token', authToken);
    axios.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook for auth
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner"></div>
      </div>
    );
  }

  return user ? children : <Navigate to="/login" />;
};

// Admin Route Component
const AdminRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (user.role !== 'admin') {
    return <Navigate to="/dashboard" />;
  }

  return children;
};

const AppearanceManager = () => {
  const location = useLocation();

  useEffect(() => {
    const normalizedPath = location.pathname.replace(/\/+$/, '') || '/';
    const publicRoutes = new Set(['/', '/about', '/login', '/register']);
    const isPublicRoute = publicRoutes.has(normalizedPath);

    if (isPublicRoute) {
      const root = document.documentElement;
      root.classList.remove('theme-dark');
      root.classList.add('theme-light');
      root.dataset.appearanceTheme = 'Light Mode';
      return;
    }

    const isAdminRoute = location.pathname.startsWith('/admin');
    const settings = getStoredAppearanceSettings(isAdminRoute);
    applyAppearanceSettings(settings);

    const mediaQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    const handleSystemThemeChange = () => {
      const latestSettings = getStoredAppearanceSettings(isAdminRoute);
      if (latestSettings.theme === 'Auto') {
        applyAppearanceSettings(latestSettings);
      }
    };

    const handleStorageSync = () => {
      const latestSettings = getStoredAppearanceSettings(isAdminRoute);
      applyAppearanceSettings(latestSettings);
    };

    if (mediaQuery) {
      mediaQuery.addEventListener('change', handleSystemThemeChange);
    }

    window.addEventListener('storage', handleStorageSync);

    return () => {
      if (mediaQuery) {
        mediaQuery.removeEventListener('change', handleSystemThemeChange);
      }
      window.removeEventListener('storage', handleStorageSync);
    };
  }, [location.pathname]);

  return null;
};

const TOKEN_UNLOCK_RULES = [
  {
    key: 'journey-begins',
    name: 'Journey Begins',
    subtitle: 'Open a lesson',
    bgColor: '#4FC3F7',
    icon: 'BOOK',
    isUnlocked: (metrics) => metrics.openedLessons >= 1
  },
  {
    key: 'kickstarter',
    name: 'Kickstarter Token',
    subtitle: 'Complete your first lesson',
    bgColor: '#8BC34A',
    icon: 'PLAY',
    isUnlocked: (metrics) => metrics.completedLessons >= 1
  },
  {
    key: 'igniter',
    name: 'Igniter Token',
    subtitle: 'Pass 1 final assessment',
    bgColor: '#FF9800',
    icon: 'FLAME',
    isUnlocked: (metrics) => metrics.finalPassed >= 1
  },
  {
    key: 'safety',
    name: 'Safety Token',
    subtitle: 'Reach 40% mastery level',
    bgColor: '#64B5F6',
    icon: 'SHIELD',
    isUnlocked: (metrics) => metrics.masteryPercent >= 40
  },
  {
    key: 'fast-learner',
    name: 'Fast Learner Token',
    subtitle: 'Take 6 review assessments',
    bgColor: '#FFD54F',
    icon: 'SPEED',
    isUnlocked: (metrics) => metrics.reviewTaken >= 6
  },
  {
    key: 'critical-thinker',
    name: 'Critical Thinker Token',
    subtitle: 'Get 3 skills above 70%',
    bgColor: '#9575CD',
    icon: 'BRAIN',
    isUnlocked: (metrics) => metrics.highSkillCount >= 3
  },
  {
    key: 'mastery',
    name: 'Mastery Token',
    subtitle: 'Get 2 skills above 95%',
    bgColor: '#E9B766',
    icon: 'TROPHY',
    isUnlocked: (metrics) => metrics.masteredSkillCount >= 2
  },
  {
    key: 'consistency',
    name: 'Consistency Token',
    subtitle: 'Reach 70% path progress',
    bgColor: '#64D0E0',
    icon: 'CHART',
    isUnlocked: (metrics) => metrics.pathPercent >= 70
  },
  {
    key: 'overachiever',
    name: 'Overachiever Token',
    subtitle: 'Average 85+ in assessments',
    bgColor: '#EC407A',
    icon: 'ROCKET',
    isUnlocked: (metrics) => metrics.avgOverallScore >= 85
  }
];

const GlobalTokenUnlockTracker = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [unlockQueue, setUnlockQueue] = useState([]);
  const [activeUnlockToken, setActiveUnlockToken] = useState(null);

  useEffect(() => {
    if (!user?.userId || user.role === 'admin') {
      return;
    }

    let mounted = true;

    const runUnlockCheck = async () => {
      try {
        const [progressResponse, bktResponse, summaryResponse] = await Promise.all([
          axios.get('/progress'),
          axios.get('/bkt/knowledge-states'),
          axios.get('/users/learning-progress-summary')
        ]);

        if (!mounted) return;

        const progressData = Array.isArray(progressResponse.data) ? progressResponse.data : [];
        const bktData = Array.isArray(bktResponse.data) ? bktResponse.data : [];
        const summary = summaryResponse.data || {};

        const skillPercents = bktData.map((record) => Math.round(parseFloat(record.PKnown || 0) * 100));
        const avgReview = summary?.assessment?.averageReviewAssessmentScore || 0;
        const avgFinal = summary?.assessment?.averageFinalAssessmentScore || 0;

        const metrics = {
          openedLessons: progressData.filter((lesson) => Number(lesson.CompletionRate || 0) > 0).length,
          completedLessons: summary?.learningPathProgress?.completedLessons || progressData.filter((lesson) => Number(lesson.CompletionRate || 0) >= 100).length,
          pathPercent: summary?.learningPathProgress?.progressPercent || 0,
          masteryPercent: summary?.lessonPerformance?.masteryLevelPercent || 0,
          reviewTaken: summary?.assessment?.totalReviewAssessmentsTaken || 0,
          finalTaken: summary?.assessment?.totalFinalAssessmentsTaken || 0,
          finalPassed: summary?.assessment?.totalFinalAssessmentsPassed || 0,
          highSkillCount: skillPercents.filter((percent) => percent >= 70).length,
          masteredSkillCount: skillPercents.filter((percent) => percent >= 95).length,
          avgOverallScore: Math.round((avgReview + avgFinal) / 2)
        };

        const unlockedTokens = TOKEN_UNLOCK_RULES.filter((token) => token.isUnlocked(metrics));
        const storageKey = `seenUnlockedTokens:${user.userId}`;
        const saved = localStorage.getItem(storageKey);
        const seen = new Set(saved ? JSON.parse(saved) : []);
        const newlyUnlocked = unlockedTokens.filter((token) => !seen.has(token.key));

        if (!newlyUnlocked.length) return;

        newlyUnlocked.forEach((token) => seen.add(token.key));
        localStorage.setItem(storageKey, JSON.stringify(Array.from(seen)));

        setUnlockQueue((prev) => {
          const existing = new Set(prev.map((token) => token.key));
          return [...prev, ...newlyUnlocked.filter((token) => !existing.has(token.key))];
        });
      } catch (error) {
        console.error('Global token unlock tracking failed:', error);
      }
    };

    runUnlockCheck();
    const intervalId = setInterval(runUnlockCheck, 30000);
    const handleAchievementRefresh = () => runUnlockCheck();
    window.addEventListener('achievementMetricsUpdated', handleAchievementRefresh);

    return () => {
      mounted = false;
      clearInterval(intervalId);
      window.removeEventListener('achievementMetricsUpdated', handleAchievementRefresh);
    };
  }, [user?.userId, user?.role, location.pathname]);

  useEffect(() => {
    if (!activeUnlockToken && unlockQueue.length > 0) {
      setActiveUnlockToken(unlockQueue[0]);
      setUnlockQueue((prev) => prev.slice(1));
    }
  }, [unlockQueue, activeUnlockToken]);

  useEffect(() => {
    if (!activeUnlockToken) return;
    const timerId = setTimeout(() => setActiveUnlockToken(null), 4200);
    return () => clearTimeout(timerId);
  }, [activeUnlockToken]);

  if (!activeUnlockToken) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 28 }).map((_, index) => {
          const left = (index * 13) % 100;
          const delay = (index % 8) * 0.1;
          const duration = 1.8 + (index % 5) * 0.18;
          const colors = ['#42C5B6', '#64D0E0', '#E9B766', '#8D6EB1', '#589AD7'];
          return (
            <span
              key={index}
              className="absolute top-[-10%] block w-3 h-3 rounded-sm"
              style={{
                left: `${left}%`,
                backgroundColor: colors[index % colors.length],
                animation: `tokenConfettiFall ${duration}s linear ${delay}s infinite`,
                transform: `rotate(${index * 21}deg)`
              }}
            />
          );
        })}
      </div>

      <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md p-7 text-center animate-[fadeIn_0.25s_ease-out]">
        <div
          className="w-24 h-24 rounded-full mx-auto mb-4 flex items-center justify-center shadow-lg text-white text-sm font-extrabold tracking-wide"
          style={{ backgroundColor: activeUnlockToken.bgColor }}
        >
          {activeUnlockToken.icon}
        </div>
        <p className="text-sm font-semibold uppercase tracking-wide text-highlight-dark">Token Unlocked</p>
        <h3 className="text-3xl font-bold text-text-primary mt-1 mb-2">{activeUnlockToken.name}</h3>
        <p className="text-gray-600 mb-5">{activeUnlockToken.subtitle}</p>
        <button
          onClick={() => setActiveUnlockToken(null)}
          className="px-6 py-2 rounded-lg bg-highlight text-white font-semibold hover:bg-highlight-dark transition-colors"
        >
          Awesome
        </button>
      </div>

      <style>{`
        @keyframes tokenConfettiFall {
          0% { transform: translateY(-12vh) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translateY(120vh) rotate(560deg); opacity: 0.9; }
        }
      `}</style>
    </div>
  );
};

// Main App Component
function App() {
  useEffect(() => {
    // Ensure defaults exist without overwriting user/admin saved preferences.
    if (!localStorage.getItem('theme')) localStorage.setItem('theme', 'Light Mode');
    if (!localStorage.getItem('fontSize')) localStorage.setItem('fontSize', 'Default');
    if (!localStorage.getItem('uiSize')) localStorage.setItem('uiSize', 'Default');

    if (!localStorage.getItem('adminTheme')) localStorage.setItem('adminTheme', 'Light Mode');
    if (!localStorage.getItem('adminFontSize')) localStorage.setItem('adminFontSize', 'Default');
    if (!localStorage.getItem('adminUiSize')) localStorage.setItem('adminUiSize', 'Default');
  }, []);

  return (
    <Router>
      <AppearanceManager />
      <ThemedConfirmHost />
      <AuthProvider>
        <ProfileProvider>
          <GlobalTokenUnlockTracker />
          <div className="min-h-screen w-screen overflow-x-hidden">
            <Routes>
              {/* Public Routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/about" element={<About />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Protected Routes */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/initial-assessment"
              element={
                <ProtectedRoute>
                  <InitialAssessment />
                </ProtectedRoute>
              }
            />
            <Route
              path="/lessons"
              element={
                <ProtectedRoute>
                  <Lessons />
                </ProtectedRoute>
              }
            />
            <Route
              path="/module/:moduleId"
              element={
                <ProtectedRoute>
                  <ModuleView />
                </ProtectedRoute>
              }
            />
            <Route
              path="/assessment/:assessmentId"
              element={
                <ProtectedRoute>
                  <Assessment />
                </ProtectedRoute>
              }
            />
            <Route
              path="/assessment/final/:moduleId"
              element={
                <ProtectedRoute>
                  <FinalAssessment />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/progress"
              element={
                <ProtectedRoute>
                  <Progress />
                </ProtectedRoute>
              }
            />
            <Route
              path="/simulations"
              element={
                <ProtectedRoute>
                  <Simulations />
                </ProtectedRoute>
              }
            />
            <Route
              path="/simulation/:id"
              element={
                <ProtectedRoute>
                  <SimulationActivity />
                </ProtectedRoute>
              }
            />

            {/* Admin Routes */}
            <Route
              path="/admin/dashboard"
              element={
                <AdminRoute>
                  <AdminDashboard />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/lessons"
              element={
                <AdminRoute>
                  <AdminLessons />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/lessons/add"
              element={
                <AdminRoute>
                  <AddLesson />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/lessons/edit/:id"
              element={
                <AdminRoute>
                  <AddLesson />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/learners"
              element={
                <AdminRoute>
                  <AdminLearners />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/settings"
              element={
                <AdminRoute>
                  <AdminSettings />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/simulations"
              element={
                <AdminRoute>
                  <AdminSimulations />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/simulations/:id"
              element={
                <AdminRoute>
                  <AdminSimulationEditor />
                </AdminRoute>
              }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </ProfileProvider>
    </AuthProvider>
  </Router>
);
}

export default App;
