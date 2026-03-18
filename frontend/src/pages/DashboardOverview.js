import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../App';
import Navbar from '../components/Navbar';
import SkeletonLoader from '../components/SkeletonLoader';

const decodeHtmlEntities = (value = '') => {
  const normalized = String(value)
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([\da-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  const parser = new DOMParser();
  const doc = parser.parseFromString(normalized, 'text/html');
  return doc.documentElement.textContent || '';
};

const toPlainText = (value = '') => decodeHtmlEntities(String(value).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

const DashboardOverview = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [modules, setModules] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showLoading, setShowLoading] = useState(false);
  const [error, setError] = useState('');

  // Redirect admin users to admin panel
  useEffect(() => {
    if (user?.role === 'admin') {
      navigate('/admin/dashboard');
    }
  }, [user, navigate]);

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
        axios.get(`/modules?userId=${user.userId}`),
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

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      localStorage.removeItem('token');
      navigate('/login');
    }
  };

  const handleModuleClick = async (module) => {
    if (!module.Is_Unlocked) {
      return;
    }

    // Check if progress exists, if not start the module
    if (!module.ProgressID) {
      try {
        await axios.post('/progress/start', { moduleId: module.ModuleID });
      } catch (err) {
        console.error('Error starting module:', err);
      }
    }

    navigate(`/module/${module.ModuleID}`);
  };

  const completedModules = stats?.modules?.completed || 0;
  const totalModules = stats?.modules?.total || modules.length;
  const avgProgress = stats?.averageProgress || 0;
  const skillsMastered = stats?.skills?.mastered || 0;
  const totalSkills = stats?.skills?.total || 0;
  const totalTime = stats?.timeSpentMinutes || 0;

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <Navbar />

      <div className="w-full px-8 py-8 custom-scrollbar">
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
                  <p className="text-3xl font-bold text-[#0B2B4C]">{Math.floor(totalTime / 60)}h {totalTime % 60}m</p>
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

          <div className="space-y-5">
            {modules.map((module) => {
              const difficultyColors = {
                'Easy': { solid: '#4A90E2', border: 'border-[#4A90E2]' },
                'Challenging': { solid: '#F1C40F', border: 'border-[#F1C40F]' },
                'Advanced': { solid: '#E67E22', border: 'border-[#E67E22]' },
                'Supplementary': { solid: '#9B59B6', border: 'border-[#9B59B6]' }
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
                            {toPlainText(module.Description) || 'The foundation of Computer Hardware Servicing and its importance to modern professional operations.'}
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

export default DashboardOverview;
