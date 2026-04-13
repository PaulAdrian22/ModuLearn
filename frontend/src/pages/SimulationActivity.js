import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../components/Navbar';
import { useAuth } from '../App';
import { API_SERVER_URL } from '../config/api';

const MISSION_LIMIT = 12;
const DEFAULT_SKILL_TYPE = 'Technical Comprehension';

const ACTIVITY_MODES = {
  assembly: 'assembly',
  disassembly: 'disassembly'
};

const TOOL_TYPES = {
  hand: 'hand',
  screwdriver: 'screwdriver'
};

const TOOL_LABELS = {
  [TOOL_TYPES.hand]: 'Hand Tool',
  [TOOL_TYPES.screwdriver]: 'Screwdriver'
};

const SCREW_PART_PATTERN = /\b(screw|bolt|screwdriver|screw\s*holes?)\b/i;
const DISASSEMBLY_PATTERN = /\b(disassembl|remove|detach|disconnect|unscrew|take\s*out|pull\s*out|lift\s*off)\b/i;
const ASSEMBLY_PATTERN = /\b(assembl|install|attach|connect|mount|insert|place|put\s*in|secure)\b/i;

const normalizeLabel = (value = '') => String(value || '').trim();
const normalizeLabelKey = (value = '') => normalizeLabel(value).toLowerCase();

const clampPercent = (value, fallback) => {
  if (!Number.isFinite(Number(value))) return fallback;
  return Math.max(5, Math.min(95, Number(value)));
};

const pickRandom = (items = []) => {
  if (!Array.isArray(items) || items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
};

const toDisplayUrl = (sourcePath = '') => {
  if (!sourcePath) return '';
  if (/^https?:\/\//i.test(sourcePath)) return sourcePath;
  if (sourcePath.startsWith('/uploads')) return `${API_SERVER_URL}${sourcePath}`;
  return sourcePath;
};

const inferRequiredTool = (zone = null, fallbackLabel = '') => {
  const explicit = String(zone?.requiredTool || '').trim().toLowerCase();
  if (explicit === TOOL_TYPES.hand || explicit === TOOL_TYPES.screwdriver) {
    return explicit;
  }

  const sourceText = `${String(zone?.label || '')} ${String(fallbackLabel || '')}`;
  return SCREW_PART_PATTERN.test(sourceText) ? TOOL_TYPES.screwdriver : TOOL_TYPES.hand;
};

const inferActivityMode = (simulation, instructions = '', flowSteps = []) => {
  const sourceText = [
    simulation?.ActivityType,
    simulation?.SimulationTitle,
    instructions,
    ...(Array.isArray(flowSteps) ? flowSteps.map((step) => step?.text) : [])
  ].join(' ').toLowerCase();

  if (DISASSEMBLY_PATTERN.test(sourceText)) return ACTIVITY_MODES.disassembly;
  if (ASSEMBLY_PATTERN.test(sourceText)) return ACTIVITY_MODES.assembly;
  return ACTIVITY_MODES.assembly;
};

const normalizeDropZone = (zone, index) => {
  const fallbackX = 14 + (index % 6) * 14;
  const fallbackY = 16 + Math.floor(index / 6) * 13;

  return {
    id: zone?.id ?? index + 1,
    label: normalizeLabel(zone?.label) || `Part ${index + 1}`,
    x: clampPercent(zone?.x, fallbackX),
    y: clampPercent(zone?.y, fallbackY),
    interactionMode: String(zone?.interactionMode || 'drag').toLowerCase(),
    smallImage: zone?.smallImage || '',
    layerImage: zone?.layerImage || '',
    layerOrder: Number.isFinite(Number(zone?.layerOrder)) ? Number(zone.layerOrder) : index + 1,
    requiredTool: inferRequiredTool(zone)
  };
};

const normalizePerspective = (area, index) => {
  const zoneList = Array.isArray(area?.dropZones) ? area.dropZones : [];

  return {
    id: Number.isFinite(Number(area?.id)) ? Number(area.id) : index + 1,
    name: normalizeLabel(area?.name) || `Perspective ${index + 1}`,
    backgroundImage: area?.backgroundImage || '',
    dropZones: zoneList.map((zone, zoneIndex) => normalizeDropZone(zone, zoneIndex))
  };
};

const extractSimulationContent = (simulation) => {
  let zoneData = {};

  try {
    zoneData = simulation?.ZoneData
      ? (typeof simulation.ZoneData === 'string' ? JSON.parse(simulation.ZoneData) : simulation.ZoneData)
      : {};
  } catch (parseError) {
    zoneData = {};
  }

  const instructions = String(zoneData?.instructionText || simulation?.Instructions || '').trim();
  const skillType = String(zoneData?.skillType || simulation?.SkillType || DEFAULT_SKILL_TYPE).trim();
  const flowSteps = Array.isArray(zoneData?.flowSteps) ? zoneData.flowSteps : [];

  const areaList = Array.isArray(zoneData?.mainAreas) && zoneData.mainAreas.length
    ? zoneData.mainAreas
    : [
        {
          id: 1,
          name: 'Main View',
          backgroundImage: zoneData?.backgroundImage || '',
          dropZones: Array.isArray(zoneData?.dropZones) ? zoneData.dropZones : []
        }
      ];

  const perspectives = areaList
    .map((area, index) => normalizePerspective(area, index))
    .filter((area) => area.dropZones.length > 0 || area.backgroundImage);

  return {
    instructions,
    skillType,
    flowSteps,
    perspectives
  };
};

const createMissionTargets = (perspectives = [], flowSteps = []) => {
  const groupedTargets = new Map();
  const screwCounters = {};

  perspectives.forEach((perspective) => {
    perspective.dropZones.forEach((zone, index) => {
      const baseLabel = normalizeLabel(zone.label) || `Part ${index + 1}`;
      const baseKey = normalizeLabelKey(baseLabel) || `part-${perspective.id}-${index + 1}`;
      const isScrew = SCREW_PART_PATTERN.test(baseLabel);
      const placement = {
        perspectiveId: perspective.id,
        perspectiveName: perspective.name,
        zone
      };

      if (isScrew) {
        const nextCount = (screwCounters[baseKey] || 0) + 1;
        screwCounters[baseKey] = nextCount;

        const targetKey = `${baseKey}::${perspective.id}::${zone.id ?? index}::${nextCount}`;

        groupedTargets.set(targetKey, {
          key: targetKey,
          label: `${baseLabel} #${nextCount}`,
          baseLabel,
          isScrew: true,
          requiredTool: TOOL_TYPES.screwdriver,
          placements: [placement]
        });

        return;
      }

      if (!groupedTargets.has(baseKey)) {
        groupedTargets.set(baseKey, {
          key: baseKey,
          label: baseLabel,
          baseLabel,
          isScrew: false,
          requiredTool: inferRequiredTool(zone, baseLabel),
          placements: []
        });
      }

      const existingTarget = groupedTargets.get(baseKey);
      existingTarget.placements.push(placement);

      if (inferRequiredTool(zone, baseLabel) === TOOL_TYPES.screwdriver) {
        existingTarget.requiredTool = TOOL_TYPES.screwdriver;
      }
    });
  });

  const targets = Array.from(groupedTargets.values());
  if (targets.length === 0) return [];

  const prioritizedKeys = [];

  flowSteps.forEach((step) => {
    const stepValue = normalizeLabelKey(step?.targetLabel || step?.text || '');
    if (!stepValue) return;

    targets.forEach((target) => {
      if (prioritizedKeys.includes(target.key)) return;

      const targetBaseKey = normalizeLabelKey(target.baseLabel || target.label);
      if (!targetBaseKey) return;

      const isDirectMatch = targetBaseKey === stepValue
        || targetBaseKey.includes(stepValue)
        || stepValue.includes(targetBaseKey);

      const isScrewStep = target.isScrew && /screw|bolt/.test(stepValue);

      if (isDirectMatch || isScrewStep) {
        prioritizedKeys.push(target.key);
      }
    });
  });

  const orderedTargets = [
    ...prioritizedKeys
      .map((key) => targets.find((target) => target.key === key))
      .filter(Boolean),
    ...targets.filter((target) => !prioritizedKeys.includes(target.key))
  ];

  const limit = Math.max(MISSION_LIMIT, orderedTargets.length);
  return orderedTargets.slice(0, limit);
};

const formatDuration = (seconds = 0) => {
  const totalSeconds = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
};

const HandToolIcon = ({ className = 'w-4 h-4' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M14 5a1 1 0 112 0v5m-4-6a1 1 0 10-2 0v6m-4-5a1 1 0 112 0v5m8 0V8a1 1 0 10-2 0v2m-8 0a1 1 0 10-2 0v3a6 6 0 006 6h2a6 6 0 006-6v-2a2 2 0 00-2-2h-1" />
  </svg>
);

const ScrewdriverIcon = ({ className = 'w-4 h-4' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M14 4l6 6-2 2-6-6m-2 2l2-2m-5 5l7 7m-8-5l-4 4v3h3l4-4" />
  </svg>
);

const ToolIcon = ({ tool, className = 'w-4 h-4' }) => {
  if (tool === TOOL_TYPES.screwdriver) return <ScrewdriverIcon className={className} />;
  return <HandToolIcon className={className} />;
};

const SimulationActivity = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [simulation, setSimulation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [instructions, setInstructions] = useState('');
  const [skillType, setSkillType] = useState(DEFAULT_SKILL_TYPE);
  const [activityMode, setActivityMode] = useState(ACTIVITY_MODES.assembly);
  const [perspectives, setPerspectives] = useState([]);
  const [activePerspectiveId, setActivePerspectiveId] = useState(null);

  const [missionTargets, setMissionTargets] = useState([]);
  const [completedTargetKeys, setCompletedTargetKeys] = useState([]);
  const [currentTargetKey, setCurrentTargetKey] = useState('');

  const [selectedTool, setSelectedTool] = useState(TOOL_TYPES.hand);
  const [draggingItemKey, setDraggingItemKey] = useState('');
  const [isMaskHovered, setIsMaskHovered] = useState(false);

  const [activityState, setActivityState] = useState('briefing');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [finalScore, setFinalScore] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const activePerspective = useMemo(() => {
    if (!perspectives.length) return null;
    return perspectives.find((perspective) => perspective.id === activePerspectiveId) || perspectives[0];
  }, [activePerspectiveId, perspectives]);

  const targetByKey = useMemo(() => {
    const map = new Map();
    missionTargets.forEach((target) => {
      map.set(target.key, target);
    });
    return map;
  }, [missionTargets]);

  const completedSet = useMemo(() => new Set(completedTargetKeys), [completedTargetKeys]);

  const missionTargetKeys = useMemo(() => missionTargets.map((target) => target.key), [missionTargets]);

  const remainingTargetKeys = useMemo(() => {
    return missionTargetKeys.filter((key) => !completedSet.has(key));
  }, [completedSet, missionTargetKeys]);

  const currentTarget = useMemo(() => {
    if (!currentTargetKey || !targetByKey.has(currentTargetKey)) return null;
    return targetByKey.get(currentTargetKey);
  }, [currentTargetKey, targetByKey]);

  const currentTargetPlacement = useMemo(() => {
    if (!currentTarget) return null;

    const activePlacement = currentTarget.placements.find(
      (placement) => Number(placement.perspectiveId) === Number(activePerspectiveId)
    );

    return activePlacement || currentTarget.placements[0] || null;
  }, [activePerspectiveId, currentTarget]);

  const currentTargetImage = currentTargetPlacement
    ? (currentTargetPlacement.zone.layerImage || currentTargetPlacement.zone.smallImage || '')
    : '';

  const currentTargetRequiredTool = currentTarget?.requiredTool || TOOL_TYPES.hand;

  const displayedLayers = useMemo(() => {
    if (!activePerspective) return [];

    const visibleKeys = activityMode === ACTIVITY_MODES.disassembly
      ? missionTargetKeys.filter((key) => !completedSet.has(key))
      : completedTargetKeys;

    return visibleKeys
      .map((key) => {
        const target = targetByKey.get(key);
        if (!target) return null;

        const placement = target.placements.find(
          (entry) => Number(entry.perspectiveId) === Number(activePerspective.id)
        );

        if (!placement) return null;

        return {
          key,
          label: target.label,
          layerImage: placement.zone.layerImage || placement.zone.smallImage || '',
          layerOrder: placement.zone.layerOrder || 1
        };
      })
      .filter((layer) => Boolean(layer?.layerImage))
      .sort((a, b) => Number(a.layerOrder) - Number(b.layerOrder));
  }, [activePerspective, activityMode, completedSet, completedTargetKeys, missionTargetKeys, targetByKey]);

  const itemCards = useMemo(() => {
    return missionTargets.map((target) => {
      const firstPlacement = target.placements[0];

      return {
        key: target.key,
        label: target.label,
        image: firstPlacement?.zone?.smallImage || firstPlacement?.zone?.layerImage || '',
        completed: completedSet.has(target.key),
        requiredTool: target.requiredTool
      };
    });
  }, [completedSet, missionTargets]);

  const progressPercent = missionTargets.length
    ? Math.round((completedTargetKeys.length / missionTargets.length) * 100)
    : 0;

  const instructionLines = useMemo(() => {
    return instructions
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 8);
  }, [instructions]);

  const clearRunState = useCallback(() => {
    setCompletedTargetKeys([]);
    setCurrentTargetKey('');
    setSelectedTool(TOOL_TYPES.hand);
    setDraggingItemKey('');
    setIsMaskHovered(false);
    setElapsedSeconds(0);
    setTotalAttempts(0);
    setWrongAttempts(0);
    setHintsUsed(0);
    setFinalScore(null);
    setStatusMessage('');
  }, []);

  const focusTargetByKey = useCallback((targetKey) => {
    if (!targetKey || !targetByKey.has(targetKey)) {
      setCurrentTargetKey('');
      return;
    }

    const target = targetByKey.get(targetKey);
    const firstPlacement = target.placements[0] || null;

    setCurrentTargetKey(targetKey);
    if (firstPlacement) {
      setActivePerspectiveId(firstPlacement.perspectiveId);
    }
  }, [targetByKey]);

  const chooseAnotherTarget = useCallback((excludeCurrent = false) => {
    const candidates = remainingTargetKeys.filter((key) => {
      if (!excludeCurrent) return true;
      return key !== currentTargetKey;
    });

    const randomKey = pickRandom(candidates);
    if (!randomKey) {
      setCurrentTargetKey('');
      return;
    }

    focusTargetByKey(randomKey);
  }, [currentTargetKey, focusTargetByKey, remainingTargetKeys]);

  const fetchSimulation = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError('');

      const response = await axios.get(`/simulations/${id}?userId=${user?.userId || 0}`);
      const sim = response.data;
      const content = extractSimulationContent(sim);
      const generatedTargets = createMissionTargets(content.perspectives, content.flowSteps);
      const detectedMode = inferActivityMode(sim, content.instructions, content.flowSteps);

      setSimulation(sim);
      setInstructions(content.instructions);
      setSkillType(content.skillType || DEFAULT_SKILL_TYPE);
      setActivityMode(detectedMode);
      setPerspectives(content.perspectives);
      setActivePerspectiveId(content.perspectives[0]?.id || null);
      setMissionTargets(generatedTargets);

      clearRunState();
      setActivityState('briefing');
    } catch (requestError) {
      console.error('Error fetching simulation:', requestError);
      setError('Unable to load this simulation right now. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [clearRunState, id, user?.userId]);

  useEffect(() => {
    fetchSimulation();
  }, [fetchSimulation]);

  useEffect(() => {
    if (activityState !== 'active') return undefined;

    const interval = setInterval(() => {
      setElapsedSeconds((previous) => previous + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [activityState]);

  useEffect(() => {
    if (activityState !== 'active') return;
    if (!currentTargetKey && remainingTargetKeys.length > 0) {
      const randomKey = pickRandom(remainingTargetKeys);
      if (randomKey) focusTargetByKey(randomKey);
    }
  }, [activityState, currentTargetKey, focusTargetByKey, remainingTargetKeys]);

  const completeCurrentTarget = (successMessage) => {
    if (!currentTarget) return;

    setCompletedTargetKeys((previous) => {
      if (previous.includes(currentTarget.key)) return previous;
      return [...previous, currentTarget.key];
    });

    const nextRemaining = remainingTargetKeys.filter((key) => key !== currentTarget.key);
    const nextTarget = pickRandom(nextRemaining);

    if (nextTarget) {
      focusTargetByKey(nextTarget);
      setStatusMessage(successMessage);
      return;
    }

    setCurrentTargetKey('');
    setStatusMessage(
      activityMode === ACTIVITY_MODES.disassembly
        ? 'All target parts removed. Submit your run when ready.'
        : 'All target parts assembled. Submit your run when ready.'
    );
  };

  const startRun = async () => {
    if (!simulation || !user?.userId) return;

    try {
      await axios.post('/simulations/start', {
        simulationId: simulation.SimulationID,
        userId: user.userId
      });
    } catch (startError) {
      console.error('Error starting simulation:', startError);
    }

    clearRunState();
    setActivityState('active');

    const firstKey = pickRandom(missionTargetKeys);
    if (!firstKey) {
      setStatusMessage('No targets were generated for this simulation.');
      return;
    }

    focusTargetByKey(firstKey);
    setStatusMessage(
      activityMode === ACTIVITY_MODES.disassembly
        ? 'Use a tool, then click the visible target shape to remove the part.'
        : 'Drag the matching part card to the visible target shape.'
    );
  };

  const isSelectedToolValid = () => {
    if (!currentTarget) return true;
    return selectedTool === currentTargetRequiredTool;
  };

  const handleDragStart = (event, itemKey) => {
    if (activityMode !== ACTIVITY_MODES.assembly) return;
    if (activityState !== 'active') return;
    if (!itemKey || completedSet.has(itemKey)) return;

    event.dataTransfer.setData('text/plain', itemKey);
    event.dataTransfer.effectAllowed = 'move';

    setDraggingItemKey(itemKey);
    setStatusMessage('Drop the selected part into the visible target shape.');
  };

  const handleDragEnd = () => {
    setDraggingItemKey('');
    setIsMaskHovered(false);
  };

  const handleMaskDragOver = (event) => {
    if (activityMode !== ACTIVITY_MODES.assembly) return;
    if (activityState !== 'active') return;
    if (!draggingItemKey) return;

    event.preventDefault();
    setIsMaskHovered(true);
  };

  const handleMaskDragLeave = () => {
    setIsMaskHovered(false);
  };

  const handleDropOnMask = (event) => {
    event.preventDefault();

    if (activityMode !== ACTIVITY_MODES.assembly) return;
    if (activityState !== 'active') return;
    if (!draggingItemKey || !currentTarget) return;

    setIsMaskHovered(false);
    setTotalAttempts((previous) => previous + 1);

    if (draggingItemKey !== currentTarget.key) {
      setWrongAttempts((previous) => previous + 1);
      setStatusMessage('Incorrect part for this target shape. Try another card.');
      setDraggingItemKey('');
      return;
    }

    if (!isSelectedToolValid()) {
      setWrongAttempts((previous) => previous + 1);
      setStatusMessage(`Switch to ${TOOL_LABELS[currentTargetRequiredTool]} to place ${currentTarget.label}.`);
      setDraggingItemKey('');
      return;
    }

    completeCurrentTarget(`Correct. ${currentTarget.label} assembled successfully.`);
    setDraggingItemKey('');
  };

  const handleMaskClick = () => {
    if (activityMode !== ACTIVITY_MODES.disassembly) return;
    if (activityState !== 'active') return;
    if (!currentTarget) return;

    setTotalAttempts((previous) => previous + 1);

    if (!isSelectedToolValid()) {
      setWrongAttempts((previous) => previous + 1);
      setStatusMessage(`Switch to ${TOOL_LABELS[currentTargetRequiredTool]} to remove ${currentTarget.label}.`);
      return;
    }

    completeCurrentTarget(`Removed: ${currentTarget.label}`);
  };

  const handleHint = () => {
    if (!currentTarget) return;

    if (currentTargetPlacement?.perspectiveId) {
      setActivePerspectiveId(currentTargetPlacement.perspectiveId);
    }

    setHintsUsed((previous) => previous + 1);

    if (activityMode === ACTIVITY_MODES.disassembly) {
      setStatusMessage(`Hint: select ${TOOL_LABELS[currentTargetRequiredTool]} then click the highlighted target shape.`);
      return;
    }

    setStatusMessage(`Hint: drag ${currentTarget.label} with ${TOOL_LABELS[currentTargetRequiredTool]} selected.`);
  };

  const handleSwitchTarget = () => {
    if (remainingTargetKeys.length <= 1) {
      setStatusMessage('No alternate target available right now.');
      return;
    }

    chooseAnotherTarget(true);
    setStatusMessage(
      activityMode === ACTIVITY_MODES.disassembly
        ? 'Target switched. Use the required tool and click the visible target shape.'
        : 'Target switched. Drag the matching part card to the visible target shape.'
    );
  };

  const calculateScore = () => {
    const maxScore = Number(simulation?.MaxScore || 100);
    const completionRatio = missionTargets.length ? completedTargetKeys.length / missionTargets.length : 1;
    const accuracyRatio = totalAttempts > 0 ? completedTargetKeys.length / totalAttempts : completionRatio;

    let timePenalty = 0;
    if (elapsedSeconds > 900) timePenalty = 0.12;
    else if (elapsedSeconds > 600) timePenalty = 0.07;
    else if (elapsedSeconds > 300) timePenalty = 0.03;

    const hintPenalty = Math.min(0.12, hintsUsed * 0.015);

    const normalizedScore = Math.max(
      0,
      Math.min(1, completionRatio * 0.76 + accuracyRatio * 0.24 - timePenalty - hintPenalty)
    );

    return Math.round(normalizedScore * maxScore);
  };

  const submitRun = async () => {
    if (!simulation || !user?.userId || submitting) return;

    setSubmitting(true);

    try {
      const score = calculateScore();

      await axios.post('/simulations/complete', {
        simulationId: simulation.SimulationID,
        userId: user.userId,
        score,
        timeSpent: elapsedSeconds
      });

      setFinalScore(score);
      setActivityState('completed');
      setStatusMessage('Simulation submitted successfully.');
    } catch (submitError) {
      console.error('Error submitting simulation:', submitError);
      setStatusMessage('Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#eef4f8]">
        <Navbar />
        <div className="h-[70vh] flex items-center justify-center">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="simulation-theme min-h-screen bg-[#F5F7FA]">
        <Navbar />
        <div className="w-full px-5 md:px-8 py-8">
          <div className="simulation-surface max-w-3xl mx-auto rounded-3xl bg-white border border-[#dce8f1] p-8 text-center">
            <h1 className="simulation-title text-2xl font-black text-[#17324a] mb-2">Simulation Unavailable</h1>
            <p className="simulation-text text-[#5f7485] mb-5">{error}</p>
            <div className="flex flex-wrap gap-3 justify-center">
              <button
                onClick={fetchSimulation}
                className="px-5 py-3 rounded-xl bg-[#17324a] text-white font-semibold hover:bg-[#112436] transition-colors"
              >
                Retry
              </button>
              <button
                onClick={() => navigate('/simulations')}
                className="px-5 py-3 rounded-xl bg-[#e7f0f8] text-[#1e4767] font-semibold hover:bg-[#d9e8f5] transition-colors"
              >
                Back to Simulations
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="simulation-theme min-h-screen bg-[#F5F7FA]">
      <Navbar />

      <div className="w-full max-w-[1520px] mx-auto px-4 md:px-6 py-5 pb-7">
        <div className="simulation-surface rounded-3xl border border-[#d4e4ef] bg-white/90 backdrop-blur-sm shadow-lg p-4 md:p-5 mb-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <p className="simulation-muted text-xs uppercase tracking-[0.2em] font-semibold text-[#5a819e] mb-2">Learner Simulation Mode</p>
              <h1 className="simulation-title text-xl md:text-3xl font-black text-[#12324a] leading-tight">
                {simulation?.SimulationTitle || 'Simulation Activity'}
              </h1>
              <p className="simulation-text text-sm text-[#5f7789] mt-2 max-w-3xl">
                {activityMode === ACTIVITY_MODES.disassembly
                  ? 'Disassembling mode: board starts assembled, remove parts with the correct tool.'
                  : 'Assembling mode: board starts from base image, drag parts into target shapes.'}
              </p>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                onClick={() => navigate('/simulations')}
                className="px-3 py-2 rounded-xl bg-[#e8f1f8] text-[#1f4c6f] text-xs md:text-sm font-semibold hover:bg-[#dae9f5] transition-colors"
              >
                Back to Hub
              </button>
              <div className="px-3 py-2 rounded-xl bg-[#edf7f2] text-[#1f5a45] text-xs md:text-sm font-semibold">
                Skill: {skillType || DEFAULT_SKILL_TYPE}
              </div>
              <div className="px-3 py-2 rounded-xl bg-[#eef2ff] text-[#31407b] text-xs md:text-sm font-semibold">
                Time: {formatDuration(elapsedSeconds)}
              </div>
            </div>
          </div>
        </div>

        {activityState === 'briefing' ? (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="simulation-surface xl:col-span-2 rounded-3xl border border-[#d5e5f0] bg-white p-4 md:p-5 shadow-sm">
              <h2 className="simulation-title text-xl font-black text-[#163750] mb-3">Mission Briefing</h2>
              <p className="simulation-text text-sm text-[#5e7789] mb-4">
                {activityMode === ACTIVITY_MODES.disassembly
                  ? 'Use the selected tool, then click the visible target shape to remove each part.'
                  : 'Drag part cards into the visible target shape. Screw targets require screwdriver.'}
              </p>

              {instructionLines.length > 0 ? (
                <div className="simulation-soft rounded-2xl bg-[#f2f7fb] border border-[#d8e5ef] p-4">
                  <p className="simulation-muted text-xs uppercase tracking-wide text-[#5f8099] font-semibold mb-3">Guide Extract</p>
                  <ul className="space-y-2">
                    {instructionLines.map((line, index) => (
                      <li key={`${line}-${index}`} className="simulation-text text-sm text-[#29465e] flex gap-2">
                        <span className="font-black text-[#2b5f87]">{index + 1}.</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="simulation-soft rounded-2xl bg-[#f7f9fb] border border-dashed border-[#d0dfeb] p-4 text-sm text-[#5f7789]">
                  No instruction text was found, but targets and layered images are ready.
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="simulation-surface rounded-3xl border border-[#d5e5f0] bg-white p-4 shadow-sm">
                <h3 className="simulation-muted text-sm uppercase tracking-wide text-[#5d809c] font-semibold mb-3">Run Summary</h3>
                <div className="simulation-text space-y-2 text-[#27435a] text-sm">
                  <p className="flex justify-between"><span>Targets</span><span className="font-bold">{missionTargets.length}</span></p>
                  <p className="flex justify-between"><span>Perspectives</span><span className="font-bold">{perspectives.length}</span></p>
                  <p className="flex justify-between"><span>Mode</span><span className="font-bold capitalize">{activityMode}</span></p>
                  <p className="flex justify-between"><span>Max Score</span><span className="font-bold">{simulation?.MaxScore || 100}</span></p>
                </div>
              </div>

              <button
                onClick={startRun}
                className="w-full py-2.5 rounded-2xl bg-[#12324a] text-sm text-white font-semibold hover:bg-[#0f2a3e] transition-colors"
              >
                {activityMode === ACTIVITY_MODES.disassembly
                  ? 'Start Disassembling Run'
                  : 'Start Assembling Run'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="simulation-surface rounded-3xl border border-[#d5e5f0] bg-white p-4 shadow-sm">
                <h3 className="simulation-muted text-sm uppercase tracking-wide font-semibold text-[#607f97] mb-3">Current Target</h3>

                {currentTarget ? (
                  <>
                    <p className="simulation-title text-base font-black text-[#163750]">{currentTarget.label}</p>
                    <p className="simulation-text text-sm text-[#5d788d] mt-1">
                      View: {currentTargetPlacement?.perspectiveName || 'Unknown'}
                    </p>
                    <div className="mt-2 inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#eff5fb] text-[#244b6a] text-xs font-semibold">
                      <ToolIcon tool={currentTargetRequiredTool} className="w-4 h-4" />
                      Required: {TOOL_LABELS[currentTargetRequiredTool]}
                    </div>
                  </>
                ) : (
                  <p className="simulation-muted text-sm text-[#607a8f]">All current targets are completed.</p>
                )}
              </div>

              <div className="simulation-surface rounded-3xl border border-[#d5e5f0] bg-white p-4 shadow-sm">
                <h3 className="simulation-muted text-sm uppercase tracking-wide font-semibold text-[#607f97] mb-3">Progress</h3>
                <div className="flex items-end justify-between mb-2">
                  <p className="simulation-title text-2xl font-black text-[#12324a]">{progressPercent}%</p>
                  <p className="simulation-text text-sm text-[#5f7789]">{completedTargetKeys.length} / {missionTargets.length} targets</p>
                </div>
                <div className="h-3 rounded-full bg-[#e4edf5] overflow-hidden mb-4">
                  <div
                    className="h-full rounded-full bg-[#2f8f63] transition-all"
                    style={{ width: `${progressPercent}%` }}
                  ></div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl bg-[#ecf6f1] p-3">
                    <p className="text-[#4f6f62]">Correct</p>
                    <p className="text-xl font-black text-[#245740]">{completedTargetKeys.length}</p>
                  </div>
                  <div className="rounded-xl bg-[#fdf1e7] p-3">
                    <p className="text-[#855936]">Wrong</p>
                    <p className="text-xl font-black text-[#6d411d]">{wrongAttempts}</p>
                  </div>
                </div>
              </div>

              <div className="simulation-surface rounded-3xl border border-[#d5e5f0] bg-white p-4 shadow-sm">
                <h3 className="simulation-muted text-sm uppercase tracking-wide font-semibold text-[#607f97] mb-3">Controls</h3>

                {statusMessage && (
                  <div className="simulation-soft rounded-xl bg-[#f2f7fb] border border-[#d8e5ef] px-3 py-2 text-xs text-[#42617a] mb-3">
                    {statusMessage}
                  </div>
                )}

                <button
                  onClick={handleHint}
                  disabled={!currentTarget || activityState === 'completed'}
                  className="w-full mb-2.5 py-2.5 rounded-xl bg-[#f8b844] text-sm text-[#3f2f11] font-semibold hover:bg-[#edab32] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Focus Hint
                </button>

                <button
                  onClick={handleSwitchTarget}
                  disabled={!currentTarget || activityState === 'completed' || remainingTargetKeys.length <= 1}
                  className="w-full mb-2.5 py-2.5 rounded-xl bg-[#eaf2f8] text-sm text-[#244b6a] font-semibold hover:bg-[#dce8f4] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Switch Target
                </button>

                {activityState === 'completed' ? (
                  <>
                    <div className="rounded-xl bg-[#edf6f1] border border-[#cce5d8] px-3 py-3 mb-3 text-sm text-[#315a46]">
                      Final Score: <span className="font-black">{finalScore ?? 0}</span> / {simulation?.MaxScore || 100}
                    </div>

                    <button
                      onClick={startRun}
                      className="w-full mb-2.5 py-2.5 rounded-xl bg-[#12324a] text-sm text-white font-semibold hover:bg-[#0f2a3e] transition-colors"
                    >
                      Replay Simulation
                    </button>

                    <button
                      onClick={() => navigate('/simulations')}
                      className="w-full py-2.5 rounded-xl bg-[#e9f1f8] text-sm text-[#295170] font-semibold hover:bg-[#dae8f4] transition-colors"
                    >
                      Return to Hub
                    </button>
                  </>
                ) : (
                  <button
                    onClick={submitRun}
                    disabled={submitting || (missionTargets.length > 0 && completedTargetKeys.length === 0)}
                    className="w-full py-2.5 rounded-xl bg-[#12324a] text-sm text-white font-semibold hover:bg-[#0f2a3e] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {submitting
                      ? 'Submitting...'
                      : missionTargets.length > 0 && completedTargetKeys.length === missionTargets.length
                        ? 'Submit Completed Run'
                        : `Submit Current Run (${completedTargetKeys.length}/${missionTargets.length})`}
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="simulation-surface xl:col-span-2 rounded-3xl border border-[#d5e5f0] bg-white p-4 shadow-sm">
                <div className="flex flex-wrap gap-2 mb-3">
                  {perspectives.map((perspective) => {
                    const isActive = activePerspective?.id === perspective.id;
                    return (
                      <button
                        key={perspective.id}
                        onClick={() => setActivePerspectiveId(perspective.id)}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                          isActive
                            ? 'bg-[#12324a] text-white'
                            : 'bg-[#eaf2f8] text-[#315a79] hover:bg-[#dce8f3]'
                        }`}
                      >
                        {perspective.name}
                      </button>
                    );
                  })}
                </div>

                <div
                  className="simulation-soft relative w-full max-w-[1060px] mx-auto rounded-2xl overflow-hidden border border-[#d9e6ef] bg-[#ecf4fb]"
                  style={{ height: 'clamp(350px, 57vh, 580px)' }}
                >
                  {activePerspective?.backgroundImage ? (
                    <img
                      src={toDisplayUrl(activePerspective.backgroundImage)}
                      alt={activePerspective.name}
                      className="absolute inset-0 w-full h-full object-contain"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-[#628199] text-sm">
                      This perspective has no background image.
                    </div>
                  )}

                  {displayedLayers.map((layer) => (
                    <img
                      key={`${layer.key}-${activePerspective?.id}`}
                      src={toDisplayUrl(layer.layerImage)}
                      alt={layer.label}
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                    />
                  ))}

                  {currentTargetPlacement && (
                    <>
                      <div className="absolute inset-0 bg-[rgba(8,20,30,0.44)] pointer-events-none"></div>

                      {currentTargetImage ? (
                        <svg className="absolute inset-0 w-full h-full">
                          <image
                            href={toDisplayUrl(currentTargetImage)}
                            x="0"
                            y="0"
                            width="100%"
                            height="100%"
                            preserveAspectRatio="xMidYMid meet"
                            opacity="1"
                            style={{
                              pointerEvents: 'none',
                              filter: isMaskHovered
                                ? 'brightness(1.26) saturate(1.4) drop-shadow(0 0 14px rgba(255,226,138,1)) drop-shadow(0 0 30px rgba(248,184,68,0.95)) drop-shadow(0 0 48px rgba(248,184,68,0.72))'
                                : 'brightness(1.17) saturate(1.22) drop-shadow(0 0 10px rgba(255,232,163,0.98)) drop-shadow(0 0 22px rgba(248,184,68,0.86)) drop-shadow(0 0 36px rgba(248,184,68,0.62))'
                            }}
                          />

                          <image
                            href={toDisplayUrl(currentTargetImage)}
                            x="0"
                            y="0"
                            width="100%"
                            height="100%"
                            preserveAspectRatio="xMidYMid meet"
                            opacity="0.001"
                            style={{ pointerEvents: 'visiblePainted' }}
                            onDragOver={handleMaskDragOver}
                            onDragLeave={handleMaskDragLeave}
                            onDrop={handleDropOnMask}
                            onClick={handleMaskClick}
                          />
                        </svg>
                      ) : (
                        <div
                          className="absolute -translate-x-1/2 -translate-y-1/2 w-24 h-24 sm:w-28 sm:h-28 rounded-xl border-2 border-dashed border-[#ffe38a] bg-[#f8b844]/28"
                          style={{
                            left: `${currentTargetPlacement.zone.x}%`,
                            top: `${currentTargetPlacement.zone.y}%`,
                            boxShadow: isMaskHovered
                              ? '0 0 0 2px rgba(255,226,138,0.9), 0 0 36px rgba(248,184,68,0.95), 0 0 58px rgba(248,184,68,0.75)'
                              : '0 0 0 1px rgba(255,226,138,0.72), 0 0 24px rgba(248,184,68,0.72), 0 0 40px rgba(248,184,68,0.55)'
                          }}
                          onDragOver={handleMaskDragOver}
                          onDragLeave={handleMaskDragLeave}
                          onDrop={handleDropOnMask}
                          onClick={handleMaskClick}
                        ></div>
                      )}
                    </>
                  )}
                </div>

                <div className="mt-3 text-xs text-[#567083] flex flex-wrap gap-3">
                  <span className="inline-flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#0e2435]/70"></span>
                    Masked board
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#f8b844]"></span>
                    Visible target shape
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#2f8f63]"></span>
                    {activityMode === ACTIVITY_MODES.disassembly ? 'Layer removed' : 'Layer added'}
                  </span>
                </div>
              </div>

              <div className="simulation-surface rounded-3xl border border-[#d5e5f0] bg-white p-4 shadow-sm">
                <h3 className="simulation-muted text-sm uppercase tracking-wide font-semibold text-[#607f97] mb-3">
                  {activityMode === ACTIVITY_MODES.disassembly ? 'Removal Queue' : 'Part Tray (Drag From Here)'}
                </h3>

                <div className={`grid gap-3 max-h-[440px] overflow-auto pr-1 ${
                  activityMode === ACTIVITY_MODES.disassembly
                    ? 'grid-cols-1'
                    : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-2'
                }`}>
                  {itemCards.map((item) => {
                    const isCurrent = item.key === currentTargetKey;
                    const canDrag = activityMode === ACTIVITY_MODES.assembly && activityState === 'active' && !item.completed;

                    return (
                      <div
                        key={item.key}
                        draggable={canDrag}
                        onDragStart={(event) => handleDragStart(event, item.key)}
                        onDragEnd={handleDragEnd}
                        className={`rounded-xl border p-2.5 transition-all select-none ${
                          item.completed
                            ? 'bg-[#eaf6ef] border-[#bfe7d1] opacity-80'
                            : isCurrent
                              ? 'bg-[#fff4de] border-[#efcd90] shadow-sm'
                              : 'bg-[#f4f8fb] border-[#d9e6ef] hover:border-[#9fc2da]'
                        } ${canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
                      >
                        <div className="w-full h-20 rounded-lg border border-[#d7e4ef] bg-white mb-2 overflow-hidden">
                          {item.image ? (
                            <img
                              src={toDisplayUrl(item.image)}
                              alt={item.label}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[11px] text-[#6e8799] px-2 text-center">
                              No image
                            </div>
                          )}
                        </div>

                        <p className="text-xs font-semibold text-[#24455f] leading-tight">{item.label}</p>

                        <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-[#4f6f84]">
                          <ToolIcon tool={item.requiredTool} className="w-3.5 h-3.5" />
                          {TOOL_LABELS[item.requiredTool]}
                        </div>

                        {item.completed ? (
                          <p className="text-[11px] text-[#2f8f63] font-semibold mt-1">
                            {activityMode === ACTIVITY_MODES.disassembly ? 'Removed' : 'Placed'}
                          </p>
                        ) : isCurrent ? (
                          <p className="text-[11px] text-[#9d6c22] font-semibold mt-1">Current target</p>
                        ) : (
                          <p className="text-[11px] text-[#5d7a91] mt-1">
                            {activityMode === ACTIVITY_MODES.disassembly ? 'Pending removal' : 'Ready to drag'}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 pt-3 border-t border-[#dbe8f1]">
                  <p className="text-xs uppercase tracking-wide text-[#607f97] font-semibold mb-2">Tools</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setSelectedTool(TOOL_TYPES.hand)}
                      className={`flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                        selectedTool === TOOL_TYPES.hand
                          ? 'bg-[#12324a] text-white border-[#12324a]'
                          : 'bg-[#f1f7fc] text-[#264c69] border-[#d4e3ef] hover:bg-[#e5f0f8]'
                      }`}
                    >
                      <HandToolIcon className="w-4 h-4" />
                      Hand
                    </button>

                    <button
                      onClick={() => setSelectedTool(TOOL_TYPES.screwdriver)}
                      className={`flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                        selectedTool === TOOL_TYPES.screwdriver
                          ? 'bg-[#12324a] text-white border-[#12324a]'
                          : 'bg-[#f1f7fc] text-[#264c69] border-[#d4e3ef] hover:bg-[#e5f0f8]'
                      }`}
                    >
                      <ScrewdriverIcon className="w-4 h-4" />
                      Screwdriver
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SimulationActivity;