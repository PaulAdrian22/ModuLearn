import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../App';
import IntroductionFlow from '../components/IntroductionFlow';
import Navbar from '../components/Navbar';
import { themedConfirm } from '../utils/themedConfirm';
import { withPreferredLanguage } from '../utils/languagePreference';

const decodeHtmlEntities = (value = '') => {
  const normalized = String(value)
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([\da-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  const parser = new DOMParser();
  const doc = parser.parseFromString(normalized, 'text/html');
  return doc.documentElement.textContent || '';
};

const toPlainText = (value = '') => decodeHtmlEntities(String(value).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

const stripObjectivesFromSummary = (value = '') => {
  const plain = toPlainText(value);
  if (!plain) return '';

  const objectiveStart = plain.search(/\b(?:learning\s*objectives?|objectives?)\b\s*[:\-]/i);
  if (objectiveStart === -1) {
    return plain;
  }

  return plain.slice(0, objectiveStart).trim();
};

const formatLastOpened = (dateString) => {
  if (!dateString) return 'Not opened yet';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Not opened yet';
  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }).format(date);
};

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [modules, setModules] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showLoading, setShowLoading] = useState(false);
  const [error, setError] = useState('');
  const [showIntroduction, setShowIntroduction] = useState(false);
  const [isNewUserLogin, setIsNewUserLogin] = useState(false);

  // Redirect admin users to admin panel
  useEffect(() => {
    if (user?.role === 'admin') {
      navigate('/admin/dashboard');
    }
  }, [user, navigate]);

  useEffect(() => {
    checkNewUser();
    fetchDashboardData();
  }, []);

  const checkNewUser = async () => {
    try {
      // Only show introduction flow when coming from login page
      if (location.state?.fromLogin) {
        setIsNewUserLogin(Boolean(location.state?.isNewUser));
        setShowIntroduction(true);
        // Clear the state so refresh doesn't show it again
        window.history.replaceState({}, document.title);
      }
    } catch (err) {
      console.error('Error checking user profile:', err);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Delay showing loading spinner to avoid flicker on fast loads
      const loadingTimer = setTimeout(() => setShowLoading(true), 200);
      
      // Fetch modules with user progress
      const [modulesResponse, statsResponse] = await Promise.all([
        axios.get(withPreferredLanguage(`/modules?userId=${user.userId}`)),
        axios.get('/users/stats')
      ]);
      console.log('Dashboard fetched modules:', modulesResponse.data);
      setModules(modulesResponse.data);
      setStats(statsResponse.data);
      
      clearTimeout(loadingTimer);
      setLoading(false);
      setShowLoading(false);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Failed to load dashboard data');
      setLoading(false);
      setShowLoading(false);
    }
  };

  const handleLogout = async () => {
    const shouldLogout = await themedConfirm({
      title: 'Logout',
      message: 'Are you sure you want to logout?',
      confirmText: 'Logout',
      cancelText: 'Stay'
    });

    if (shouldLogout) {
      localStorage.removeItem('token');
      navigate('/login');
    }
  };

  const handleModuleClick = async (module) => {
    if (!module.Is_Unlocked) {
      return;
    }

    try {
      await axios.post('/progress/start', { moduleId: module.ModuleID });
    } catch (err) {
      console.error('Error opening module progress:', err);
    }

    navigate(`/module/${module.ModuleID}`);
  };

  const completedModules = stats?.modules?.completed || 0;
  const totalModules = stats?.modules?.total || modules.length;
  const avgProgress = stats?.averageProgress || 0;
  const skillsMastered = stats?.skills?.mastered || 0;
  const totalSkills = stats?.skills?.total || 0;
  const totalTime = Math.max(0, Number.parseInt(stats?.timeSpentMinutes ?? 0, 10) || 0);
  const totalTimeHours = Math.floor(totalTime / 60);
  const totalTimeMinutes = totalTime % 60;
  const lessonDifficultyColors = {
    Easy: '#4A90E2',
    Challenging: '#F1C40F',
    Advanced: '#E67E22',
    Supplementary: '#9B59B6'
  };
  const roadmapModules = [...modules]
    .sort((a, b) => (a.LessonOrder || 0) - (b.LessonOrder || 0))
    .slice(0, 8);
  const roadmapPoints = roadmapModules.length > 0
    ? roadmapModules
    : [
        { ModuleID: 'placeholder-1', LessonOrder: 1 },
        { ModuleID: 'placeholder-2', LessonOrder: 2 },
        { ModuleID: 'placeholder-3', LessonOrder: 3 }
      ];

  // Adaptive roadmap progress: completed lessons + partial progress of current lesson.
  const hasRealRoadmapData = roadmapModules.length > 0;
  const adaptiveProgressUnits = hasRealRoadmapData
    ? roadmapModules.reduce((units, module) => {
        const completionRate = Number(module?.CompletionRate || 0);
        const boundedCompletion = Math.max(0, Math.min(100, completionRate));

        if (boundedCompletion >= 100) {
          return units + 1;
        }

        if (boundedCompletion > 0) {
          return units + (boundedCompletion / 100);
        }

        return units;
      }, 0)
    : 0;

  const adaptiveRoadmapPercent = hasRealRoadmapData && roadmapModules.length > 0
    ? Math.round((adaptiveProgressUnits / roadmapModules.length) * 100)
    : Math.round(avgProgress || 0);

  const roadmapProgress = Math.max(0, Math.min(100, adaptiveRoadmapPercent));
  const checkpointProgressUnits = hasRealRoadmapData ? adaptiveProgressUnits : 0;
  const completedCheckpointCount = hasRealRoadmapData
    ? Math.max(0, Math.min(roadmapPoints.length, Math.floor(checkpointProgressUnits)))
    : Math.max(0, Math.min(roadmapPoints.length, Math.floor((roadmapProgress / 100) * roadmapPoints.length)));
  const userCheckpointColumn = Math.max(1, Math.min(roadmapPoints.length + 1, completedCheckpointCount + 1));
  const totalRoadColumns = roadmapPoints.length + 2;
  const userHeadPercent = totalRoadColumns > 1
    ? ((userCheckpointColumn - 1) / (totalRoadColumns - 1)) * 100
    : 0;
  const userHeadScale = Math.max(0, Math.min(1, userHeadPercent / 100));
  const roadmapEdgeInset = 26;
  const userHeadLeft = `calc(${roadmapEdgeInset}px + (100% - ${roadmapEdgeInset * 2}px) * ${userHeadScale})`;
  const getCheckpointLeft = (columnIndex) => {
    const checkpointScale = totalRoadColumns > 1
      ? ((columnIndex - 1) / (totalRoadColumns - 1))
      : 0;
    return `calc(${roadmapEdgeInset}px + (100% - ${roadmapEdgeInset * 2}px) * ${checkpointScale})`;
  };

  return (
    <div className={`min-h-screen bg-[#F5F7FA] ${showIntroduction ? 'overflow-hidden' : ''}`}>
      {showIntroduction && (
        <IntroductionFlow 
          isNewUser={isNewUserLogin}
          onComplete={(language) => {
            const normalizedLanguage = String(language || '').toLowerCase() === 'filipino' ? 'Taglish' : (language || 'English');
            localStorage.setItem('hasSeenIntroduction', 'true');
            localStorage.setItem('preferredLanguage', normalizedLanguage);

            axios.put('/users/profile', { preferredLanguage: normalizedLanguage }).catch((err) => {
              console.error('Error saving preferred language:', err);
            });

            setShowIntroduction(false);
          }} 
        />
      )}
      
      <Navbar />

      <div className="w-full px-8 py-8 min-h-[calc(100vh-80px)] custom-scrollbar">
        {/* Dashboard Section */}
        <div className="mb-10">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="flex items-center space-x-4">
                <div className="w-14 h-14 bg-[#2BC4B3] rounded-xl flex items-center justify-center">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-gray-600 font-medium">Lessons Completed</p>
                  <p className="text-3xl font-bold text-[#0B2B4C]">{completedModules}/{totalModules}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="flex items-center space-x-4">
                <div className="w-14 h-14 bg-[#F39C12] rounded-xl flex items-center justify-center">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-gray-600 font-medium">Average Progress</p>
                  <p className="text-3xl font-bold text-[#0B2B4C]">{avgProgress}%</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="flex items-center space-x-4">
                <div className="w-14 h-14 bg-[#4A90E2] rounded-xl flex items-center justify-center">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-gray-600 font-medium">Skills Mastered</p>
                  <p className="text-3xl font-bold text-[#0B2B4C]">{skillsMastered}/{totalSkills}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="flex items-center space-x-4">
                <div className="w-14 h-14 bg-[#9B59B6] rounded-xl flex items-center justify-center">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-gray-600 font-medium">Time Spent</p>
                  <p className="text-3xl font-bold text-[#0B2B4C]">{totalTimeHours}h {totalTimeMinutes}m</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Learning Path Section */}
        <div>
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 bg-[#2BC4B3] rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-[#0B2B4C]">Your Learning Path</h2>
          </div>

          {error && (
            <div className="bg-error/20 border border-error text-error px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-gray-200 mb-6">
            <div className="overflow-x-auto no-scrollbar">
              <div className="relative min-w-[780px] h-48 px-6 overflow-visible">
                {/* Progress Road: visible base road + completed path ending at user head */}
                <div className="absolute left-8 right-8 top-[66%] -translate-y-1/2 h-6">
                  <div className="absolute inset-0 bg-[#3B4048] rounded-full border border-[#1F2329] shadow-inner" />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 h-1 bg-[#6B7280]/45 rounded-full"
                    style={{ left: `${roadmapEdgeInset}px`, right: `${roadmapEdgeInset}px` }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 h-1 bg-[#22C55E] rounded-full origin-left"
                    style={{
                      left: `${roadmapEdgeInset}px`,
                      right: `${roadmapEdgeInset}px`,
                      transform: `translateY(-50%) scaleX(${userHeadScale})`
                    }}
                  />
                  <img
                    src="/png/user.png"
                    alt="User"
                    className="absolute top-1/2 -translate-y-[78%] -translate-x-1/2 w-8 h-8 object-contain z-20 pointer-events-none"
                    style={{ left: userHeadLeft }}
                  />
                </div>

                {/* Start, Flag Points, Trophy */}
                <div className="absolute left-8 right-8 top-[34%] h-16 pointer-events-none">
                  <img
                    src="/png/start.png"
                    alt="Start"
                    className="absolute w-11 h-11 object-contain z-10 -translate-x-1/2"
                    style={{ left: getCheckpointLeft(1) }}
                  />

                  {roadmapPoints.map((module, pointIndex) => {
                    const checkpointNumber = pointIndex + 1;
                    const pinColor = lessonDifficultyColors[module.Difficulty] || '#4A90E2';
                    const poleColor = '#9CA3AF';
                    const lessonLabel = String(module.LessonOrder || 0).padStart(2, '0');
                    const checkpointTitle = module.ModuleTitle
                      ? `Checkpoint ${checkpointNumber}: ${toPlainText(module.ModuleTitle)}`
                      : `Checkpoint ${checkpointNumber}`;
                    const checkpointColumn = pointIndex + 2;

                    return (
                      <div
                        key={module.ModuleID}
                        className="absolute -translate-x-1/2"
                        style={{ left: getCheckpointLeft(checkpointColumn) }}
                      >
                        <svg
                          className="w-11 h-14"
                          viewBox="0 0 80 96"
                          aria-hidden="true"
                          title={checkpointTitle}
                        >
                          <line x1="20" y1="90" x2="20" y2="10" stroke={poleColor} strokeWidth="7" strokeLinecap="round" />
                          <ellipse cx="20" cy="92" rx="10" ry="4" fill={poleColor} />
                          <path
                            d="M22 16 C28 10, 36 10, 42 16 L64 16 C70 12, 75 14, 76 18 L76 52 C70 56, 64 54, 58 48 L42 48 C36 44, 30 44, 22 50 Z"
                            fill={pinColor}
                            stroke="#FFFFFF"
                            strokeWidth="2"
                          />
                          <text
                            x="49"
                            y="34"
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill="#FFFFFF"
                            fontSize="13"
                            fontWeight="800"
                            fontFamily="Arial, sans-serif"
                          >
                            {lessonLabel}
                          </text>
                        </svg>
                      </div>
                    );
                  })}

                  <img
                    src="/png/trophy.png"
                    alt="Trophy"
                    className="absolute w-11 h-11 object-contain z-10 -translate-x-1/2"
                    style={{ left: getCheckpointLeft(totalRoadColumns) }}
                  />
                </div>

              </div>
            </div>
          </div>

          <div className="space-y-5">
            {modules.map((module) => {
              const difficultyColors = {
                'Easy': { solid: lessonDifficultyColors.Easy, border: 'border-[#4A90E2]' },
                'Challenging': { solid: lessonDifficultyColors.Challenging, border: 'border-[#F1C40F]' },
                'Advanced': { solid: lessonDifficultyColors.Advanced, border: 'border-[#E67E22]' },
                'Supplementary': { solid: lessonDifficultyColors.Supplementary, border: 'border-[#9B59B6]' }
              };
              const colors = difficultyColors[module.Difficulty] || difficultyColors['Easy'];
              
              return (
                <div
                  key={module.ModuleID}
                  onClick={() => handleModuleClick(module)}
                  className={`bg-white rounded-2xl shadow-sm overflow-hidden cursor-pointer ${
                    !module.Is_Unlocked ? 'opacity-60 cursor-not-allowed' : ''
                  }`}
                >
                  <div className="flex items-stretch">
                    {/* Module Image with Solid Color */}
                    <div className="w-56 h-36 flex-shrink-0 relative" style={{ backgroundColor: colors.solid }}>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center text-white">
                          <p className="text-5xl font-bold mb-1">{module.LessonOrder}</p>
                          <p className="text-sm font-semibold opacity-90">LESSON</p>
                        </div>
                      </div>
                    </div>

                    {/* Module Content */}
                    <div className="flex-1 p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="text-xl font-bold text-[#0B2B4C] mb-1">
                            {toPlainText(module.ModuleTitle) || 'Untitled Lesson'}
                          </h3>
                          {module.Difficulty && (
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold text-white mb-1" style={{ backgroundColor: colors.solid }}>
                              {module.Difficulty}
                            </span>
                          )}
                          <p className="text-sm text-gray-600 line-clamp-2">
                            {stripObjectivesFromSummary(module.Description) || 'The foundation of Computer Hardware Servicing and its importance to modern professional operations.'}
                          </p>
                          <p className="mt-2 text-xs sm:text-sm text-gray-500 leading-relaxed flex flex-col sm:flex-row sm:items-center sm:gap-1">
                            <span className="font-semibold">Last Opened:</span>
                            <span>{formatLastOpened(module.LastOpenedAt)}</span>
                          </p>
                        </div>
                        {!module.Is_Unlocked && (
                          <div className="ml-4">
                            <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                              <svg className="w-6 h-6 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Progress Bar */}
                      <div className="mt-4">
                        <div className="flex items-center justify-between text-xs mb-2">
                          <span className="text-gray-600 font-medium">
                            {module.CompletionRate === 100 ? '✓ Completed' : module.CompletionRate > 0 ? 'In Progress' : 'Not Started'}
                          </span>
                          <span className="text-gray-500 font-semibold">
                            {Math.round(module.CompletionRate || 0)}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ 
                              width: `${module.CompletionRate || 0}%`,
                              backgroundColor: colors.solid
                            }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
