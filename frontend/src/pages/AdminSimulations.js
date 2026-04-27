import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../App';
import AdminNavbar from '../components/AdminNavbar';
import { normalizeSimulationSkill } from '../utils/simulationFlow';

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

const ACTIVITY_TYPE_THEME = {
  Disassembling: {
    label: 'Disassembling',
    tag: 'Drag components out',
    solid: '#E57373',
    soft: '#FDECEA',
    text: '#7A2E2E',
  },
  Assembling: {
    label: 'Assembling',
    tag: 'Drag components in',
    solid: '#66BB6A',
    soft: '#E8F5E9',
    text: '#1F5E29',
  },
};

const getActivityType = (simulation = {}) => {
  const moduleId = Number(simulation?.ModuleID || 0);
  if (moduleId === 3) return 'Disassembling';
  if (moduleId === 4) return 'Assembling';

  const title = String(simulation?.SimulationTitle || '').toLowerCase();
  if (/^\s*installing\b/.test(title) || /\bassembl/.test(title)) return 'Assembling';
  return 'Disassembling';
};

const getDocxSkillForSimulation = (simulation = {}) => {
  const moduleId = Number(simulation?.ModuleID || 0);
  const simulationOrder = Number(simulation?.SimulationOrder || 0);
  if (!moduleId || !simulationOrder) return '';

  return DOCX_SIMULATION_SKILL_MAP[moduleId]?.[simulationOrder] || '';
};

const getSkillTypeAssignedPerSimulation = (simulation = {}) => {
  // Keep admin card skill colors aligned with the learner simulation list.
  return getDocxSkillForSimulation(simulation);
};

const getSkillTheme = (rawSkillType) => {
  const normalizedSkillType = normalizeSimulationSkill(rawSkillType, 'Technical Comprehension');
  return {
    skillType: normalizedSkillType,
    ...(SKILL_TYPE_THEME[normalizedSkillType] || SKILL_TYPE_THEME['Technical Comprehension'])
  };
};

const FALLBACK_SCAN_MAX_ID = 40;
const FALLBACK_BREAK_ON_CONSECUTIVE_MISSES = 8;

const AdminSimulations = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [simulations, setSimulations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (user && user.role !== 'admin') {
      navigate('/dashboard');
      return;
    }

    const fetchSimulationFallbackList = async () => {
      const recovered = [];
      let consecutiveMisses = 0;

      for (let simulationId = 1; simulationId <= FALLBACK_SCAN_MAX_ID; simulationId += 1) {
        try {
          const detailResponse = await axios.get(`/admin/simulations/${simulationId}`);
          const detailSimulation = detailResponse?.data?.simulation;
          if (!detailSimulation?.SimulationID) {
            consecutiveMisses += 1;
            continue;
          }

          const activityOrder = Number(
            detailResponse?.data?.activityOrder
            || detailSimulation?.SimulationOrder
            || detailSimulation?.SimulationID
            || simulationId
          );

          recovered.push({
            SimulationID: detailSimulation.SimulationID,
            SimulationTitle: detailSimulation.SimulationTitle,
            ModuleID: detailSimulation.ModuleID,
            Description: detailSimulation.Description,
            ActivityType: detailSimulation.ActivityType,
            SkillType: detailSimulation.SkillType,
            MaxScore: detailSimulation.MaxScore,
            TimeLimit: detailSimulation.TimeLimit,
            SimulationOrder: detailSimulation.SimulationOrder,
            activityOrder,
            hasAdminOverride: detailResponse?.data?.source === 'override'
          });

          consecutiveMisses = 0;
        } catch (fallbackError) {
          consecutiveMisses += 1;

          if (
            recovered.length > 0
            && consecutiveMisses >= FALLBACK_BREAK_ON_CONSECUTIVE_MISSES
          ) {
            break;
          }

          if (fallbackError?.response?.status !== 404) {
            console.warn(`Fallback simulation probe failed for ID ${simulationId}:`, fallbackError?.response?.status || fallbackError?.message);
          }
        }
      }

      return recovered;
    };

    const fetch = async () => {
      try {
        setWarning('');
        setError('');
        const res = await axios.get('/admin/simulations');
        const listedSimulations = Array.isArray(res.data) ? res.data : [];

        if (listedSimulations.length > 0) {
          setSimulations(listedSimulations);
          return;
        }

        const fallbackSimulations = await fetchSimulationFallbackList();
        if (fallbackSimulations.length > 0) {
          setSimulations(fallbackSimulations);
          setWarning('Primary simulation list endpoint returned no items. Showing recovered editor list.');
          return;
        }

        setSimulations(listedSimulations);
      } catch (err) {
        console.error('Failed to load simulations:', err);
        const fallbackSimulations = await fetchSimulationFallbackList();

        if (fallbackSimulations.length > 0) {
          setSimulations(fallbackSimulations);
          setWarning('Primary simulation list endpoint is unavailable. Showing recovered editor list.');
          setError('');
        } else {
          setError(err.response?.data?.message || 'Failed to load simulations');
        }
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [user, navigate]);

  const handleEdit = (simulationId) => {
    navigate(`/admin/simulations/${simulationId}`);
  };

  const sortedSimulations = useMemo(() => {
    return [...simulations].sort((a, b) => {
      const moduleDelta = Number(a.ModuleID || 0) - Number(b.ModuleID || 0);
      if (moduleDelta !== 0) return moduleDelta;

      const orderDelta = Number(a.SimulationOrder || 0) - Number(b.SimulationOrder || 0);
      if (orderDelta !== 0) return orderDelta;

      return Number(a.SimulationID || 0) - Number(b.SimulationID || 0);
    });
  }, [simulations]);

  const filteredSimulations = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) return sortedSimulations;

    return sortedSimulations.filter((simulation) => {
      const title = String(simulation?.SimulationTitle || '').toLowerCase();
      const description = String(simulation?.Description || '').toLowerCase();
      const activityOrder = String(simulation?.activityOrder || simulation?.SimulationOrder || '').toLowerCase();
      const activityType = String(simulation?.ActivityType || '').toLowerCase();

      return (
        title.includes(normalizedSearch) ||
        description.includes(normalizedSearch) ||
        activityOrder.includes(normalizedSearch) ||
        activityType.includes(normalizedSearch)
      );
    });
  }, [searchTerm, sortedSimulations]);

  return (
    <div className="simulation-theme min-h-screen bg-[#F5F7FA]">
      <AdminNavbar />
      <div className="w-full px-5 md:px-8 py-8 min-h-[calc(100vh-80px)] custom-scrollbar">
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="simulation-title text-4xl font-bold text-[#0B2B4C]">Simulation</h1>
            <p className="text-sm text-gray-600 mt-1">Edit learner-facing simulation cards, timeline, and assets.</p>
          </div>

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

        {loading && (
          <div className="flex items-center justify-center h-96">
            <div className="spinner" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 p-4">
            {error}
          </div>
        )}

        {!loading && !error && warning && (
          <div className="rounded-xl bg-blue-50 border border-blue-200 text-blue-800 p-4">
            {warning}
          </div>
        )}

        {!loading && !error && filteredSimulations.length === 0 && (
          <div className="simulation-surface bg-white rounded-3xl shadow-sm text-center py-16 border border-[#dce8f0]">
            <svg className="w-16 h-16 text-[#9bb4c7] mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            <h3 className="simulation-title text-xl font-bold text-[#2b4254] mb-2">
              {simulations.length === 0 ? 'No simulations found' : 'No simulation matched your search'}
            </h3>
            <p className="simulation-text text-[#5d7486]">
              {simulations.length === 0
                ? 'Simulations are seeded from the database.'
                : 'Try another keyword or clear the search bar.'}
            </p>
          </div>
        )}

        {!loading && !error && filteredSimulations.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredSimulations.map((simulation, index) => {
              const activityType = getActivityType(simulation);
              const activityTheme = ACTIVITY_TYPE_THEME[activityType] || ACTIVITY_TYPE_THEME.Disassembling;
              const activityOrder = index + 1;
              const resolvedSkillType = getSkillTypeAssignedPerSimulation(simulation);
              const { skillType, solid, soft, text } = getSkillTheme(resolvedSkillType);

              return (
                <div
                  key={simulation.SimulationID}
                  className="simulation-surface rounded-2xl p-6 shadow-sm border border-[#e4ebf2] hover:shadow-md transition-shadow"
                  style={{ borderTop: `4px solid ${solid}` }}
                >
                  <div className="flex justify-between items-start mb-4 gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg text-white flex items-center justify-center text-base font-bold"
                        style={{ backgroundColor: solid }}
                      >
                        {activityOrder}
                      </div>
                      <span
                        className="px-3 py-1 text-xs font-semibold rounded-full"
                        style={{ backgroundColor: activityTheme.soft, color: activityTheme.text }}
                      >
                        Available
                      </span>
                    </div>

                    {simulation.hasAdminOverride ? (
                      <span
                        className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-full text-white"
                        style={{ backgroundColor: solid }}
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Admin Override
                      </span>
                    ) : (
                      <span
                        className="px-3 py-1 text-xs font-semibold rounded-full"
                        style={{ backgroundColor: soft, color: text }}
                      >
                        Default Manifest
                      </span>
                    )}
                  </div>

                  <h3 className="simulation-title text-xl font-bold text-[#0B2B4C] mb-2 leading-tight min-h-[3.2rem]">
                    {simulation.SimulationTitle}
                  </h3>

                  <p className="simulation-text text-[18px] leading-[1.45] text-gray-600 mb-5 min-h-[3.8rem]">
                    {simulation.Description || 'Drag and drop component layers into masked targets, then submit your run.'}
                  </p>

                  <div className="mb-4 flex flex-wrap gap-2">
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                      style={{
                        backgroundColor: activityTheme.soft,
                        color: activityTheme.text,
                        border: `1px solid ${activityTheme.solid}66`,
                      }}
                      title={activityTheme.tag}
                    >
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: activityTheme.solid }}
                      />
                      {activityTheme.label}
                    </span>

                    <span
                      className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
                      style={{ backgroundColor: soft, color: text, border: `1px solid ${solid}40` }}
                    >
                      Skill: {skillType}
                    </span>

                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                      Max Score: {simulation.MaxScore}
                    </span>

                    {Number(simulation.TimeLimit || 0) > 0 && (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        {simulation.TimeLimit} min
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600 mb-6">
                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M8 7V5a4 4 0 118 0v2m-9 4h10m-9 4h10" />
                      </svg>
                      <span>Simulation #{simulation.SimulationOrder}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>{simulation.hasAdminOverride ? 'Custom timeline active' : 'Using default timeline'}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleEdit(simulation.SimulationID)}
                    className="w-full py-3 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 shadow-sm"
                    style={{ backgroundColor: solid }}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    Edit Simulation
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

export default AdminSimulations;
