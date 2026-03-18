import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../App';
import Navbar from '../components/Navbar';
import SkeletonLoader from '../components/SkeletonLoader';

const Lessons = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLoading, setShowLoading] = useState(false);
  const [error, setError] = useState('');

  const toPlainText = (value) => {
    if (!value) return '';
    const textarea = document.createElement('textarea');
    textarea.innerHTML = String(value);
    const decoded = textarea.value;
    return decoded.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  };

  useEffect(() => {
    fetchModules();
  }, []);

  const fetchModules = async () => {
    try {
      setLoading(true);
      
      // Delay showing loading spinner
      const loadingTimer = setTimeout(() => setShowLoading(true), 200);
      
      const response = await axios.get(`/modules?userId=${user.userId}`);
      setModules(response.data);
      
      clearTimeout(loadingTimer);
      setLoading(false);
      setShowLoading(false);
    } catch (err) {
      console.error('Error fetching modules:', err);
      setError('Failed to load modules');
      setLoading(false);
      setShowLoading(false);
    }
  };

  const handleModuleClick = async (module) => {
    if (!module.Is_Unlocked) {
      return;
    }

    if (!module.ProgressID) {
      try {
        await axios.post('/progress/start', { moduleId: module.ModuleID });
      } catch (err) {
        console.error('Error starting module:', err);
      }
    }

    navigate(`/module/${module.ModuleID}`);
  };

  const introductoryModules = modules.filter(m => m.LessonOrder >= 1 && m.LessonOrder <= 3);
  const intermediateModules = modules.filter(m => m.LessonOrder >= 4 && m.LessonOrder <= 6);

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <Navbar />
      
      <div className="w-full px-8 py-8 min-h-[calc(100vh-80px)] custom-scrollbar">
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-[#0B2B4C] mb-3">Lessons Overview</h1>
          <p className="text-lg text-gray-600">
            These lessons equip you with foundational knowledge in Computer Hardware Servicing.
          </p>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-[#2BC4B3] rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-[#0B2B4C]">Introductory Level</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {introductoryModules.map((module) => {
              const isLocked = !module.Is_Unlocked;
              const completionRate = parseFloat(module.CompletionRate || 0);
              
              const difficultyColors = {
                'Easy': { solid: '#4A90E2', tag: 'bg-[#4A90E2]' },
                'Challenging': { solid: '#F1C40F', tag: 'bg-[#F1C40F]' },
                'Advanced': { solid: '#E67E22', tag: 'bg-[#E67E22]' },
                'Supplementary': { solid: '#9B59B6', tag: 'bg-[#9B59B6]' }
              };
              
              const colors = difficultyColors[module.Difficulty] || difficultyColors['Easy'];

              return (
                <div
                  key={module.ModuleID}
                  onClick={() => handleModuleClick(module)}
                  className={`bg-white rounded-2xl p-6 shadow-sm ${!isLocked ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white ${colors.tag}`}>
                        {module.LessonOrder}
                      </div>
                      {isLocked ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-gray-500 text-white text-xs font-semibold rounded-full">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                          </svg>
                          Locked
                        </span>
                      ) : (
                        <span className={`px-3 py-1 ${colors.tag} text-white text-xs font-semibold rounded-full`}>
                          Available
                        </span>
                      )}
                    </div>
                  </div>

                  <h3 className={`text-xl font-bold mb-1 ${isLocked ? 'text-gray-600' : 'text-[#0B2B4C]'}`}>
                    {toPlainText(module.ModuleTitle)}
                  </h3>
                  {module.Difficulty && (
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold text-white mb-2" style={{ backgroundColor: isLocked ? '#9CA3AF' : colors.solid }}>
                      {module.Difficulty}
                    </span>
                  )}

                  <p className={`text-sm mb-4 line-clamp-3 ${isLocked ? 'text-gray-500' : 'text-gray-600'}`}>
                    {toPlainText(module.Description) || 'Learn the fundamentals of Computer Hardware Servicing'}
                  </p>

                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-semibold" style={{ color: isLocked ? '#9CA3AF' : colors.solid }}>
                        {completionRate}% Complete
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${completionRate}%`,
                          backgroundColor: isLocked ? '#9CA3AF' : colors.solid
                        }}
                      ></div>
                    </div>
                  </div>

                  <div className={`flex items-center gap-4 text-xs mb-5 ${isLocked ? 'text-gray-500' : 'text-gray-600'}`}>
                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                      <span>{module.LessonOrder === 1 ? '2' : '8'} Topics</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                      <span>4 Assessments</span>
                    </div>
                  </div>

                  {isLocked ? (
                    <button
                      disabled
                      className="w-full py-3 bg-gray-400 text-white rounded-lg font-medium text-sm cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                      </svg>
                      Complete Lesson {module.LessonOrder - 1} to Unlock
                    </button>
                  ) : (
                    <button
                      className="w-full py-3 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 shadow-sm"
                      style={{ backgroundColor: colors.solid }}
                    >
                      {completionRate > 0 ? (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                          Continue Learning
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                          </svg>
                          Start Learning
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-[#E67E22] rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-[#0B2B4C]">Intermediate Level</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {intermediateModules.map((module) => {
              const isLocked = true;
              const completionRate = parseFloat(module.CompletionRate || 0);

              return (
                <div
                  key={module.ModuleID}
                  className="bg-white rounded-2xl p-6 shadow-sm opacity-60 cursor-not-allowed"
                >
                  <div className="flex justify-between items-start mb-4">
                    <span className="inline-flex items-center gap-2 px-3 py-1 bg-gray-500 text-white text-xs font-semibold rounded-full">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                      </svg>
                      Locked
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-gray-600 mb-3">
                    Lesson {module.LessonOrder}: {toPlainText(module.ModuleTitle)}
                  </h3>

                  <p className="text-sm text-gray-500 mb-4 line-clamp-3">
                    {toPlainText(module.Description) || 'Learn advanced concepts in Computer Hardware Servicing'}
                  </p>

                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-semibold text-gray-500">
                        {completionRate}% Complete
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-gray-400"
                        style={{ width: `${completionRate}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                      <span>6 Topics</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                      <span>3 Assessments</span>
                    </div>
                  </div>

                  <button
                    disabled
                    className="w-full py-3 bg-gray-400 text-white rounded-lg font-medium text-sm cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                    Complete Lesson {module.LessonOrder - 1} to Unlock
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Lessons;
