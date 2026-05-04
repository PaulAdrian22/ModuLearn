import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { modulesApi, progressApi } from '../services/api';
import { getPreferredLanguage } from '../utils/languagePreference';
import { useAsyncData } from '../hooks/useAsyncData';

const Lessons = () => {
  const navigate = useNavigate();

  const { data: modulesData, loading, error } = useAsyncData(
    () => modulesApi.list({ language: getPreferredLanguage() ?? 'English' }),
    [],
    { initial: [] },
  );
  const modules = modulesData ?? [];

  const toPlainText = (value) => {
    if (!value) return '';
    const textarea = document.createElement('textarea');
    textarea.innerHTML = String(value);
    const decoded = textarea.value;
    return decoded.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  };

  const stripObjectivesFromSummary = (value) => {
    const plain = toPlainText(value);
    if (!plain) return '';

    const objectiveStart = plain.search(/\b(?:learning\s*objectives?|objectives?)\b\s*[:\-]/i);
    if (objectiveStart === -1) {
      return plain;
    }

    return plain.slice(0, objectiveStart).trim();
  };

  const formatCountLabel = (count, singular) => {
    const safeCount = Number.isFinite(Number(count)) ? Number(count) : 0;
    return `${safeCount} ${singular}${safeCount === 1 ? '' : 's'}`;
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


  const handleModuleClick = async (module) => {
    if (!module.Is_Unlocked) {
      return;
    }

    try {
      await progressApi.start(module.ModuleID);
    } catch (err) {
      console.error('Error opening module progress:', err);
    }

    navigate(`/module/${module.ModuleID}`);
  };

  const visibleModules = [...modules].sort((a, b) => Number(a.LessonOrder || 0) - Number(b.LessonOrder || 0));
  const difficultyColors = {
    Easy: { solid: '#4A90E2', tag: 'bg-[#4A90E2]' },
    Challenging: { solid: '#F1C40F', tag: 'bg-[#F1C40F]' },
    Advanced: { solid: '#E67E22', tag: 'bg-[#E67E22]' },
    Supplementary: { solid: '#9B59B6', tag: 'bg-[#9B59B6]' }
  };

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

        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-[#2BC4B3] rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-[#0B2B4C]">All Lessons</h2>
          </div>
          {visibleModules.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 shadow-sm text-center text-gray-600">
              No lessons available yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {visibleModules.map((module) => {
              const isLocked = !module.Is_Unlocked;
              const completionRate = parseFloat(module.CompletionRate || 0);
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
                    Lesson {module.LessonOrder}: {toPlainText(module.ModuleTitle)}
                  </h3>

                  {module.Difficulty && (
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold text-white mb-2" style={{ backgroundColor: isLocked ? '#9CA3AF' : colors.solid }}>
                      {module.Difficulty}
                    </span>
                  )}

                  <p className={`text-[18px] leading-[1.45] mb-4 line-clamp-3 ${isLocked ? 'text-gray-500' : 'text-gray-600'}`}>
                    {stripObjectivesFromSummary(module.Description) || 'Learn advanced concepts in Computer Hardware Servicing'}
                  </p>

                  <p className={`text-xs sm:text-sm mb-4 flex flex-col sm:flex-row sm:items-center sm:gap-1 ${isLocked ? 'text-gray-500' : 'text-gray-600'}`}>
                    <span className="font-semibold">Last Opened:</span>
                    <span>{formatLastOpened(module.LastOpenedAt)}</span>
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
                      <span>{formatCountLabel(module.topicCount, 'Topic')}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                      <span>{formatCountLabel(module.assessmentCount, 'Assessment')}</span>
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
          )}
        </div>
      </div>
    </div>
  );
};

export default Lessons;
