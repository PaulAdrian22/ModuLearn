import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../App';
import AdminNavbar from '../components/AdminNavbar';
import { normalizeSimulationSkill } from '../utils/simulationFlow';

// Aligned with the Mastery Performance palette in Progress.js so the same
// skill always reads as the same color across the system.
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
    text: '#7A2E2E',
  },
  Assembling: {
    label: 'Assembling',
    tag: 'Drag components in',
    solid: '#66BB6A',
    soft: '#E8F5E9',
    text: '#1F5E29',
  },
  Troubleshooting: {
    label: 'Troubleshooting',
    tag: 'Diagnose and fix',
    solid: '#FFB74D',
    soft: '#FFF3E0',
    text: '#8B5A15',
  },
  Unassigned: {
    label: 'Unassigned',
    tag: 'No activity type set',
    solid: '#9CA3AF',
    soft: '#F3F4F6',
    text: '#374151',
  },
};

const ACTIVITY_TYPE_OPTIONS = ['Assembling', 'Disassembling', 'Troubleshooting'];

const getActivityType = (simulation = {}) => {
  const stored = String(simulation?.ActivityType || '').trim();
  if (ACTIVITY_TYPE_OPTIONS.includes(stored)) return stored;
  return 'Unassigned';
};

const getSkillTypeAssignedPerSimulation = (simulation = {}) => {
  // Purely data-driven — no hardcoded fallback.
  return simulation?.SkillType || '';
};

const getSkillTheme = (rawSkillType) => {
  if (!rawSkillType) {
    return {
      skillType: '',
      ...SKILL_TYPE_THEME['No Skill'],
    };
  }
  const normalizedSkillType = normalizeSimulationSkill(rawSkillType, '');
  if (!normalizedSkillType) {
    return {
      skillType: '',
      ...SKILL_TYPE_THEME['No Skill'],
    };
  }
  return {
    skillType: normalizedSkillType,
    ...(SKILL_TYPE_THEME[normalizedSkillType] || SKILL_TYPE_THEME['No Skill']),
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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ SimulationTitle: '', ModuleID: '', ActivityType: '', Description: '' });
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

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

  const filteredSimulations = sortedSimulations;

  const handleCreateSimulation = async () => {
    setCreateError('');
    const title = createForm.SimulationTitle.trim();
    if (!title) {
      setCreateError('Title is required');
      return;
    }

    const payload = {
      SimulationTitle: title,
      ModuleID: createForm.ModuleID ? Number(createForm.ModuleID) : null,
      ActivityType: createForm.ActivityType.trim() || null,
      Description: createForm.Description.trim() || null,
    };

    try {
      setCreating(true);
      const response = await axios.post('/admin/simulations', payload);
      const newId = response?.data?.SimulationID;
      setShowCreateModal(false);
      setCreateForm({ SimulationTitle: '', ModuleID: '', ActivityType: '', Description: '' });
      if (newId) {
        navigate(`/admin/simulations/${newId}`);
      }
    } catch (err) {
      setCreateError(err.response?.data?.message || 'Failed to create simulation');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="simulation-theme min-h-screen bg-[#F5F7FA]">
      <AdminNavbar />
      <div className="w-full px-5 md:px-8 py-8 min-h-[calc(100vh-80px)] custom-scrollbar">
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="simulation-title text-4xl font-bold text-[#0B2B4C]">Simulation</h1>
            <p className="text-sm text-gray-600 mt-1">Edit learner-facing simulation cards, timeline, and assets.</p>
          </div>

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-highlight hover:bg-highlight-dark text-white font-semibold px-5 py-3 shadow-sm transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add Simulation
          </button>
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
              No simulations found
            </h3>
            <p className="simulation-text text-[#5d7486]">
              Use the Add Simulation button to create one.
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
                      Skill: {skillType || 'Not assigned'}
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

                  <div className="mb-6" />

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

      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 sm:p-8">
            <h3 className="text-2xl font-bold text-[#0B2B4C] mb-1">Add Simulation</h3>
            <p className="text-sm text-gray-500 mb-5">Create a new simulation activity. You will be redirected to the editor after saving.</p>

            {createError && (
              <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2 mb-4 text-sm">
                {createError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[#17364f] mb-1">Title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={createForm.SimulationTitle}
                  onChange={(e) => setCreateForm({ ...createForm, SimulationTitle: e.target.value })}
                  className="w-full rounded-lg border border-[#bed4e6] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#8bb3d8]"
                  placeholder="e.g. Assemble the motherboard"
                  maxLength={200}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-[#17364f] mb-1">Module ID</label>
                  <input
                    type="number"
                    min="1"
                    value={createForm.ModuleID}
                    onChange={(e) => setCreateForm({ ...createForm, ModuleID: e.target.value })}
                    className="w-full rounded-lg border border-[#bed4e6] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#8bb3d8]"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#17364f] mb-1">Activity Type</label>
                  <select
                    value={createForm.ActivityType}
                    onChange={(e) => setCreateForm({ ...createForm, ActivityType: e.target.value })}
                    className="w-full rounded-lg border border-[#bed4e6] px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#8bb3d8]"
                  >
                    <option value="">Select type</option>
                    <option value="Assembling">Assembling</option>
                    <option value="Disassembling">Disassembling</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#17364f] mb-1">Description</label>
                <textarea
                  rows={3}
                  value={createForm.Description}
                  onChange={(e) => setCreateForm({ ...createForm, Description: e.target.value })}
                  className="w-full rounded-lg border border-[#bed4e6] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#8bb3d8] resize-none"
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setCreateError('');
                }}
                disabled={creating}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateSimulation}
                disabled={creating}
                className="px-4 py-2 rounded-lg bg-highlight hover:bg-highlight-dark text-white font-semibold disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSimulations;
