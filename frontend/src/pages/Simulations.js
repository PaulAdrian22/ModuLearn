import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../App';
import Navbar from '../components/Navbar';
import { normalizeSimulationSkill } from '../utils/simulationFlow';

const getCompletionPercent = (simulation) => {
  const score = Number(simulation?.Score || 0);
  const maxScore = Number(simulation?.MaxScore || 0);
  if (maxScore <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((score / maxScore) * 100)));
};

const SKILL_TYPE_THEME = {
  Memorization: {
    solid: '#8AB4F8',
    soft: '#E8F0FE',
    text: '#2C5A9E'
  },
  'Analytical Thinking': {
    solid: '#FFB74D',
    soft: '#FFF3E0',
    text: '#8B5A15'
  },
  'Critical Thinking': {
    solid: '#EF5350',
    soft: '#FFEBEE',
    text: '#8C2C2A'
  },
  'Problem Solving': {
    solid: '#AB47BC',
    soft: '#F3E5F5',
    text: '#6A2D78'
  },
  'Technical Comprehension': {
    solid: '#4DD0E1',
    soft: '#E0F7FA',
    text: '#176A75'
  },
  'No Skill': {
    solid: '#6B7280',
    soft: '#F3F4F6',
    text: '#374151'
  }
};

const DOCX_SIMULATION_SKILL_MAP = {
  3: {
    1: 'Memorization',
    2: 'Technical Comprehension',
    3: 'Analytical Thinking',
    4: 'Problem Solving',
    5: 'Critical Thinking',
    6: 'Memorization',
    7: 'Technical Comprehension',
    8: 'Analytical Thinking',
    9: 'Problem Solving',
    10: 'Critical Thinking'
  },
  4: {
    1: 'Problem Solving',
    2: 'Critical Thinking',
    3: 'Analytical Thinking',
    4: 'Technical Comprehension',
    5: 'Memorization'
  }
};

const getDocxSkillForSimulation = (simulation = {}) => {
  const moduleId = Number(simulation?.ModuleID || 0);
  const simulationOrder = Number(simulation?.SimulationOrder || 0);
  if (!moduleId || !simulationOrder) return '';

  return DOCX_SIMULATION_SKILL_MAP[moduleId]?.[simulationOrder] || '';
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
      // Ignore malformed ZoneData and use DOCX fallback.
    }
  }

  return getDocxSkillForSimulation(simulation);
};

const getSkillTheme = (rawSkillType) => {
  if (String(rawSkillType || '').trim().toLowerCase() === 'no skill') {
    return {
      skillType: 'No Skill',
      ...SKILL_TYPE_THEME['No Skill']
    };
  }

  const normalizedSkillType = normalizeSimulationSkill(rawSkillType, 'Technical Comprehension');
  return {
    skillType: normalizedSkillType,
    ...(SKILL_TYPE_THEME[normalizedSkillType] || SKILL_TYPE_THEME['Technical Comprehension'])
  };
};

const Simulations = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [simulations, setSimulations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!user?.userId) return;
    fetchSimulations();
  }, [user?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    navigate(`/simulation/${simulation.SimulationID}`);
  };

  const sortedSimulations = useMemo(() => {
    return [...simulations].sort((a, b) => {
      const titleA = String(a.SimulationTitle || '').toLowerCase();
      const titleB = String(b.SimulationTitle || '').toLowerCase();

      if (titleA && titleB && titleA !== titleB) {
        return titleA.localeCompare(titleB);
      }

      return Number(a.SimulationID || 0) - Number(b.SimulationID || 0);
    });
  }, [simulations]);

  const filteredSimulations = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) return sortedSimulations;

    return sortedSimulations.filter((simulation) => {
      const title = String(simulation.SimulationTitle || '').toLowerCase();
      const description = String(simulation.Description || '').toLowerCase();
      return title.includes(normalizedSearch) || description.includes(normalizedSearch);
    });
  }, [searchTerm, sortedSimulations]);

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
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <h1 className="simulation-title text-4xl font-bold text-[#0B2B4C]">Simulation</h1>

          <div className="relative w-full md:w-96">
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search simulation title or topic..."
              className="w-full rounded-xl border border-[#bed4e6] bg-white px-4 py-3 text-sm text-[#17364f] placeholder:text-[#7890a2] focus:outline-none focus:ring-2 focus:ring-[#8bb3d8]"
            />
          </div>
        </div>

        {filteredSimulations.length === 0 ? (
          <div className="simulation-surface bg-white rounded-3xl shadow-sm text-center py-16 border border-[#dce8f0]">
            <svg className="w-16 h-16 text-[#9bb4c7] mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            <h3 className="simulation-title text-xl font-bold text-[#2b4254] mb-2">No simulation matched your search</h3>
            <p className="simulation-text text-[#5d7486]">Try another keyword or clear the search bar.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredSimulations.map((simulation, index) => {
              const isCompleted = simulation.CompletionStatus === 'completed';
              const score = simulation.Score || 0;
              const maxScore = simulation.MaxScore || 100;
              const scorePercent = getCompletionPercent(simulation);
              const resolvedSkillType = getSkillTypeAssignedPerSimulation(simulation);
              const { skillType, solid, soft, text } = getSkillTheme(resolvedSkillType);

              return (
                <div
                  key={simulation.SimulationID}
                  className="simulation-surface rounded-2xl p-6 shadow-sm border border-[#e4ebf2] hover:shadow-md transition-shadow"
                  style={{ borderTop: `4px solid ${solid}` }}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg text-white flex items-center justify-center text-base font-bold"
                        style={{ backgroundColor: solid }}
                      >
                        {index + 1}
                      </div>
                      {isCompleted ? (
                        <span
                          className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-full text-white"
                          style={{ backgroundColor: solid }}
                        >
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Completed
                        </span>
                      ) : (
                        <span
                          className="px-3 py-1 text-xs font-semibold rounded-full"
                          style={{ backgroundColor: soft, color: text }}
                        >
                          Available
                        </span>
                      )}
                    </div>
                  </div>

                  <h3 className="simulation-title text-xl font-bold text-[#0B2B4C] mb-2 leading-tight min-h-[3.2rem]">
                    {simulation.SimulationTitle}
                  </h3>

                  <p className="simulation-text text-sm text-gray-600 mb-5 min-h-[3.8rem]">
                    {simulation.Description || 'Drag and drop component layers into masked targets, then submit your run.'}
                  </p>

                  <div className="mb-4">
                    <span
                      className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
                      style={{ backgroundColor: soft, color: text, border: `1px solid ${solid}40` }}
                    >
                      Skill: {skillType}
                    </span>
                  </div>

                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-semibold" style={{ color: isCompleted ? solid : '#6b7280' }}>
                        {isCompleted ? `${scorePercent}% Score` : 'Not started'}
                      </span>
                      <span className="text-xs text-gray-600">{score} / {maxScore} pts</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{
                          width: `${isCompleted ? scorePercent : 0}%`,
                          backgroundColor: isCompleted ? solid : '#9CA3AF'
                        }}
                      ></div>
                    </div>
                  </div>

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
