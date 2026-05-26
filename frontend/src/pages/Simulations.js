import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../App';
import Navbar from '../components/Navbar';
import { normalizeSimulationSkill } from '../utils/simulationFlow';
import { stripHtmlTags } from '../utils/stripHtml';

const getCompletionPercent = (simulation) => {
  const score = Number(simulation?.Score || 0);
  const maxScore = Number(simulation?.MaxScore || 0);
  if (maxScore <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((score / maxScore) * 100)));
};

const getNormalizedCompletionStatus = (simulation = {}) => {
  return String(simulation?.CompletionStatus || '').trim().toLowerCase();
};

// Aligned with the Mastery Performance palette in Progress.js.
const SKILL_TYPE_THEME = {
  Memorization: {
    solid: '#F39C12',
    soft: '#FEF3E0',
    text: '#7A4D08'
  },
  'Analytical Thinking': {
    solid: '#2BC4B3',
    soft: '#E0F7F4',
    text: '#0E5F58'
  },
  'Critical Thinking': {
    solid: '#87CEEB',
    soft: '#EAF5FA',
    text: '#2C5C77'
  },
  'Problem Solving': {
    solid: '#FF6B6B',
    soft: '#FFEAEA',
    text: '#7A2A2A'
  },
  'Technical Comprehension': {
    solid: '#9B59B6',
    soft: '#F2E6F5',
    text: '#52285F'
  },
  'No Skill': {
    solid: '#9CA3AF',
    soft: '#F3F4F6',
    text: '#374151'
  }
};

const ACTIVITY_TYPE_THEME = {
  Disassembling: {
    label: 'Disassembling',
    tag: 'Drag components out',
    solid: '#E57373',
    soft: '#FDECEA',
    text: '#7A2E2E'
  },
  Assembling: {
    label: 'Assembling',
    tag: 'Drag components in',
    solid: '#66BB6A',
    soft: '#E8F5E9',
    text: '#1F5E29'
  },
  Troubleshooting: {
    label: 'Troubleshooting',
    tag: 'Diagnose and fix',
    solid: '#FFB74D',
    soft: '#FFF3E0',
    text: '#8B5A15'
  },
  Unassigned: {
    label: 'Unassigned',
    tag: 'No activity type set',
    solid: '#9CA3AF',
    soft: '#F3F4F6',
    text: '#374151'
  }
};

const ACTIVITY_TYPE_OPTIONS = ['Assembling', 'Disassembling', 'Troubleshooting'];
const CORE_SIMULATION_LIMIT = 20;

const getActivityType = (simulation = {}) => {
  const stored = String(simulation?.ActivityType || '').trim();
  if (ACTIVITY_TYPE_OPTIONS.includes(stored)) return stored;
  return 'Unassigned';
};

const getSkillTypeAssignedPerSimulation = (simulation = {}) => {
  const directSkillType = String(simulation?.SkillType || '').trim();
  if (directSkillType) return directSkillType;

  const rawZoneData = simulation?.ZoneData;
  if (rawZoneData) {
    try {
      const parsedZoneData = typeof rawZoneData === 'string' ? JSON.parse(rawZoneData) : rawZoneData;
      const zoneSkillType = String(parsedZoneData?.skillType || '').trim();
      if (zoneSkillType) return zoneSkillType;
    } catch (_error) {
      // Ignore malformed ZoneData.
    }
  }

  return '';
};

const getSkillTheme = (rawSkillType) => {
  if (!rawSkillType) {
    return { skillType: '', ...SKILL_TYPE_THEME['No Skill'] };
  }
  const normalizedSkillType = normalizeSimulationSkill(rawSkillType, '');
  if (!normalizedSkillType) {
    return { skillType: '', ...SKILL_TYPE_THEME['No Skill'] };
  }
  return {
    skillType: normalizedSkillType,
    ...(SKILL_TYPE_THEME[normalizedSkillType] || SKILL_TYPE_THEME['No Skill'])
  };
};

const Simulations = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [simulations, setSimulations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.userId) return;
    fetchSimulations();
  }, [user?.userId, location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSimulations = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/simulations?userId=${user.userId}`);
      const data = Array.isArray(response.data) ? response.data : [];
      setSimulations(data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching simulations:', err);
      setSimulations([]);
      setLoading(false);
    }
  };

  const handleOpenSimulation = (simulation) => {
    const completionStatus = getNormalizedCompletionStatus(simulation);
    const scorePercent = getCompletionPercent(simulation);
    const isCompleted = completionStatus === 'completed' || scorePercent >= 100;
    const url = isCompleted
      ? `/simulation/${simulation.SimulationID}?autostart=1`
      : `/simulation/${simulation.SimulationID}`;
    navigate(url);
  };

  const sortedSimulations = useMemo(() => {
    return [...simulations].sort((a, b) => {
      const orderDelta = Number(a.SimulationOrder || 0) - Number(b.SimulationOrder || 0);
      if (orderDelta !== 0) return orderDelta;

      return Number(a.SimulationID || 0) - Number(b.SimulationID || 0);
    });
  }, [simulations]);

  if (loading) {
    return (
      <div className="simulation-theme min-h-screen bg-[#F5F7FA]">
        <Navbar />
        <div className="flex items-center justify-center h-96">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="simulation-theme min-h-screen bg-[#F5F7FA]">
      <Navbar />

      <div className="w-full px-5 md:px-8 py-8 min-h-[calc(100vh-80px)] custom-scrollbar">
        <div className="mb-6">
          <h1 className="simulation-title text-4xl font-bold text-[#0B2B4C]">Simulation</h1>
        </div>

        {sortedSimulations.length === 0 ? (
          <div className="simulation-surface bg-white rounded-3xl shadow-sm text-center py-16 border border-[#dce8f0]">
            <svg className="w-16 h-16 text-[#9bb4c7] mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            <h3 className="simulation-title text-xl font-bold text-[#2b4254] mb-2">No simulations available</h3>
            <p className="simulation-text text-[#5d7486]">Check back later for assigned simulations.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {sortedSimulations.map((simulation, index) => {
              const completionStatus = getNormalizedCompletionStatus(simulation);
              const score = simulation.Score || 0;
              const maxScore = simulation.MaxScore || 100;
              const scorePercent = getCompletionPercent(simulation);
              const hasStarted = completionStatus === 'in_progress'
                || completionStatus === 'completed'
                || Number(simulation.Attempts || 0) > 0
                || Number(score) > 0;
              const isCompleted = completionStatus === 'completed' || scorePercent >= 100;
              const resolvedSkillType = getSkillTypeAssignedPerSimulation(simulation);
              const { solid, soft, text } = getSkillTheme(resolvedSkillType);

              // Core simulations (first 20 by order) are locked until attempted from inside a lesson.
              const isCoreSimulation = index < CORE_SIMULATION_LIMIT;
              const isLockedOnPage = isCoreSimulation && !simulation.AttemptedFromLesson;

              return (
                <div
                  key={simulation.SimulationID}
                  className={`simulation-surface rounded-2xl p-6 shadow-sm border border-[#e4ebf2] transition-shadow ${isLockedOnPage ? 'opacity-70' : 'hover:shadow-md'}`}
                  style={{ borderTop: `4px solid ${isLockedOnPage ? '#9CA3AF' : solid}` }}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg text-white flex items-center justify-center text-base font-bold"
                        style={{ backgroundColor: isLockedOnPage ? '#9CA3AF' : solid }}
                      >
                        {isLockedOnPage ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        ) : (
                          index + 1
                        )}
                      </div>
                      {isLockedOnPage ? (
                        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                          Locked
                        </span>
                      ) : isCompleted ? (
                        <span
                          className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-full text-white"
                          style={{ backgroundColor: solid }}
                        >
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Completed
                        </span>
                      ) : null}
                    </div>
                    {simulation.LessonNumber != null && (
                      <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1 shrink-0">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        Lesson {simulation.LessonNumber}
                      </span>
                    )}
                  </div>

                  <h3 className="simulation-title text-xl font-bold text-[#0B2B4C] mb-2 leading-tight min-h-[3.2rem]">
                    {simulation.SimulationTitle}
                  </h3>

                  <p className="simulation-text text-[18px] leading-[1.45] text-gray-600 mb-5 min-h-[3.8rem]">
                    {stripHtmlTags(simulation.Description) || 'Drag and drop component layers into masked targets, then submit your run.'}
                  </p>

                  {isLockedOnPage ? (
                    <div className="mb-4 flex items-start gap-2 px-3 py-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-xs text-gray-500 leading-snug">
                        Take this simulation inside the lesson first to unlock it here for replay and retakes.
                      </p>
                    </div>
                  ) : (
                    <div className="mb-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-semibold" style={{ color: isCompleted ? solid : '#6b7280' }}>
                          {hasStarted ? `${scorePercent}% Score` : 'Not started'}
                        </span>
                        <span className="text-xs text-gray-600">{score} / {maxScore} pts</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-2 rounded-full transition-all"
                          style={{
                            width: `${hasStarted ? scorePercent : 0}%`,
                            backgroundColor: hasStarted ? solid : '#9CA3AF'
                          }}
                        ></div>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600 mb-6">
                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>{simulation.Attempts || 0} Attempt{(simulation.Attempts || 0) !== 1 ? 's' : ''}</span>
                    </div>
                    {simulation.TimeLimit > 0 && (
                      <div className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{simulation.TimeLimit} min</span>
                      </div>
                    )}
                  </div>

                  {isLockedOnPage ? (
                    <div className="w-full py-3 bg-gray-100 border border-gray-200 rounded-lg font-medium text-sm flex items-center justify-center gap-2 text-gray-400 cursor-not-allowed select-none">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      Complete in Lesson to Unlock
                    </div>
                  ) : (
                    <button
                      onClick={() => handleOpenSimulation(simulation)}
                      className="w-full py-3 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 shadow-sm"
                      style={{ backgroundColor: solid }}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {isCompleted ? 'Replay Simulation' : 'Start Simulation'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Simulations;
