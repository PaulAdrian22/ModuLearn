import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../App';
import SimulationRenderer from '../components/SimulationRenderer';
import { isDisassemblyActivity, normalizeConfig } from '../data/simulationActivities';
import { stripHtmlTags } from '../utils/stripHtml';

const PENALTY_PER_MISTAKE = 5;

const formatElapsed = (seconds = 0) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
};

const SimulationActivity = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const fromLesson = searchParams.get('from') === 'lesson';
  const fromModuleId = searchParams.get('moduleId');
  const autoStart = searchParams.get('autostart') === '1';

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [simulation, setSimulation] = useState(null);
  const [config, setConfig] = useState(null);
  const [hasActivityStarted, setHasActivityStarted] = useState(false);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealedIds, setRevealedIds] = useState(() => new Set());
  const [mistakes, setMistakes] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [wrongFlash, setWrongFlash] = useState(false);
  const wrongFlashRef = useRef(null);

  const startedRef = useRef(false);
  const startTimeRef = useRef(Date.now());

  const timeline = config?.timeline || [];
  const meta = config?.meta || null;
  const totalSteps = timeline.length;
  const currentMoment = timeline[currentIndex] || null;
  const isAssembling = simulation?.ActivityType === 'Assembling';
  const disassembly = useMemo(() => {
    const type = simulation?.ActivityType;
    if (type === 'Disassembling') return true;
    if (type === 'Troubleshooting') return true;
    if (type === 'Assembling') return false;
    // No ActivityType set — fall back to title-based inference for older records.
    return isDisassemblyActivity(meta);
  }, [simulation?.ActivityType, meta]);

  const title = simulation?.SimulationTitle || meta?.title || '';
  const displayedTitle = title.replace(/^activity\s*\d+\s*:?\s*/i, '').trim() || title;
  const maxScore = Number(simulation?.MaxScore || 100);
  const score = Math.max(0, maxScore - mistakes * PENALTY_PER_MISTAKE);
  const progressPercent = totalSteps > 0
    ? (isCompleted ? 100 : Math.min(100, Math.round((Math.min(currentIndex, totalSteps) / totalSteps) * 100)))
    : (isCompleted ? 100 : 0);

  // Fetch simulation + merged config.
  // Preserve progress state if activity already started (defensive measure to prevent accidental resets).
  useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (!user?.userId || !id) return;
      setLoading(true);
      setLoadError('');
      try {
        const [simRes, configRes] = await Promise.all([
          axios.get(`/simulations/${id}?userId=${user.userId}`),
          axios.get(`/simulations/${id}/config`)
        ]);
        if (!mounted) return;
        setSimulation(simRes.data || null);
        const normalized = normalizeConfig(
          configRes.data?.config || {},
          { useActivityFallback: false }
        );
        setConfig(normalized);
        // Only reset progress on initial load; preserve if activity already started
        if (!hasActivityStarted) {
          setHasActivityStarted(false);
          setCurrentIndex(0);
          setRevealedIds(new Set());
          setMistakes(0);
          setElapsed(0);
          setIsCompleted(false);
          startedRef.current = false;
        }
      } catch (error) {
        console.error('Failed to load simulation:', error);
        if (mounted) setLoadError(error.response?.data?.message || error.message || 'Unable to load simulation.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    run();
    return () => { mounted = false; };
  }, [id, user?.userId, hasActivityStarted]);

  // Ensure currentIndex doesn't exceed timeline bounds if simulation structure changes
  useEffect(() => {
    if (currentIndex >= totalSteps && totalSteps > 0 && !isCompleted) {
      setCurrentIndex(Math.max(0, totalSteps - 1));
    } else if (totalSteps === 0 && !isCompleted) {
      setCurrentIndex(0);
    }
  }, [totalSteps, currentIndex, isCompleted]);

  // Auto-start when navigated from lesson or replay.
  useEffect(() => {
    if (!autoStart || !simulation || !config || hasActivityStarted) return;
    setHasActivityStarted(true);
    startTimeRef.current = Date.now();
  }, [autoStart, simulation, config, hasActivityStarted]);

  // Mark the simulation as started server-side.
  useEffect(() => {
    if (!hasActivityStarted) return;
    if (startedRef.current) return;
    if (!simulation || !user?.userId) return;
    startedRef.current = true;
    startTimeRef.current = Date.now();
    axios.post('/simulations/start', {
      simulationId: simulation.SimulationID,
      userId: user.userId,
      fromLesson
    }).catch((error) => console.error('Failed to mark simulation started:', error));
  }, [hasActivityStarted, simulation, user?.userId]);

  // Elapsed timer.
  useEffect(() => {
    if (!hasActivityStarted || isCompleted || !simulation) return undefined;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [hasActivityStarted, isCompleted, simulation]);

  const submitCompletion = useCallback(async (finalScore, finalElapsed) => {
    if (!simulation || !user?.userId || submitting) return;
    setSubmitting(true);
    try {
      await axios.post('/simulations/complete', {
        simulationId: simulation.SimulationID,
        userId: user.userId,
        score: finalScore,
        timeSpent: finalElapsed,
        fromLesson
      });
    } catch (error) {
      console.error('Failed to submit simulation completion:', error);
    } finally {
      setSubmitting(false);
    }
  }, [simulation, user?.userId, submitting]);

  const handleAdvance = useCallback((layerId) => {
    if (!hasActivityStarted || isCompleted || !currentMoment) return;

    const nextRevealed = new Set(revealedIds);
    if (layerId) nextRevealed.add(layerId);
    setRevealedIds(nextRevealed);

    // Only check focus layers that have a clickArea (interactable layers).
    // Layers without a clickArea are not interactable and should not block advancement.
    const interactableFocusLayers = currentMoment.layers.filter(
      (layer) => layer.kind === 'focus' && layer.clickArea
    );
    const everyFocusRevealed = interactableFocusLayers.length === 0
      || interactableFocusLayers.every((layer) => nextRevealed.has(layer.id));

    if (everyFocusRevealed) {
      const nextIndex = currentIndex + 1;
      if (nextIndex >= totalSteps) {
        setIsCompleted(true);
        const finalElapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        const finalScore = Math.max(0, maxScore - mistakes * PENALTY_PER_MISTAKE);
        submitCompletion(finalScore, finalElapsed);
      }
      setCurrentIndex(nextIndex);
    }
  }, [hasActivityStarted, isCompleted, currentMoment, currentIndex, revealedIds, totalSteps, maxScore, mistakes, submitCompletion]);

  const handleWrongClick = useCallback(() => {
    if (!hasActivityStarted || isCompleted) return;
    setMistakes((m) => m + 1);
    if (wrongFlashRef.current) clearTimeout(wrongFlashRef.current);
    setWrongFlash(true);
    wrongFlashRef.current = setTimeout(() => setWrongFlash(false), 900);
  }, [hasActivityStarted, isCompleted]);

  // Auto-advance moments that have no interactive content.
  // Scene-only moments (no focus layers, no scene clickAreas) are visual transitions
  // and must advance automatically — the user has nothing to click.
  useEffect(() => {
    if (!hasActivityStarted || isCompleted || !currentMoment) return;
    const layers = currentMoment.layers || [];
    const hasInteraction = layers.some(
      (l) => l.kind === 'focus' || (l.kind === 'scene' && (l.clickArea || l.zoomArea))
    );
    if (!hasInteraction) {
      const timer = setTimeout(() => {
        handleAdvance(null);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [hasActivityStarted, isCompleted, currentMoment, currentIndex, handleAdvance]);

  // Assembling steps are independent; reset revealed parts when the step changes
  // so components remain hidden until the correct area is satisfied in each step.
  useEffect(() => {
    if (!hasActivityStarted || !isAssembling) return;
    setRevealedIds(new Set());
  }, [hasActivityStarted, isAssembling, currentIndex]);

  const handleExit = () => {
    if (fromLesson && fromModuleId) {
      navigate(`/module/${fromModuleId}`);
    } else {
      navigate('/simulations');
    }
  };

  const handleStartActivity = () => {
    setHasActivityStarted(true);
    setElapsed(0);
    startTimeRef.current = Date.now();
  };

  const handleReplay = () => {
    setRevealedIds(new Set());
    setCurrentIndex(0);
    setMistakes(0);
    setElapsed(0);
    setIsCompleted(false);
    startTimeRef.current = Date.now();
    startedRef.current = false;
  };

  if (loading) {
    return (
      <div className="simulation-theme min-h-screen bg-[#F5F7FA]">
        <div className="flex items-center justify-center h-[60vh]">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  if (loadError || !simulation || !config) {
    return (
      <div className="simulation-theme min-h-screen bg-[#F5F7FA]">
        <div className="max-w-xl mx-auto mt-16 bg-white rounded-2xl shadow-sm p-8 text-center">
          <h2 className="text-xl font-bold text-[#0B2B4C] mb-2">Simulation unavailable</h2>
          <p className="text-gray-600 mb-5">{loadError || 'No activity data was found for this simulation.'}</p>
          <button
            onClick={handleExit}
            className="px-5 py-2 rounded-lg bg-[#0B2B4C] text-white font-semibold hover:bg-[#143a63]"
          >
            Back to Simulations
          </button>
        </div>
      </div>
    );
  }

  if (!hasActivityStarted) {
    const alreadyCompleted = simulation?.CompletionStatus === 'completed';
    const prevScore = Number(simulation?.Score || 0);
    const prevScorePercent = maxScore > 0 ? Math.round((prevScore / maxScore) * 100) : 0;

    return (
      <div className="simulation-theme min-h-screen bg-[#F5F7FA] flex items-center justify-center px-6">
        <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl border border-gray-200 p-10 relative">
          <button
            onClick={handleExit}
            className="absolute top-5 left-5 p-2 rounded-lg hover:bg-gray-100 text-[#0B2B4C]"
            title="Back to Simulations"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="pt-6 pb-20">
            <p className="text-sm font-semibold text-[#2C5A9E] uppercase tracking-wider mb-3 text-center">
              Simulation Activity
            </p>
            <h1 className="text-4xl font-bold text-[#0B2B4C] mb-5 max-w-3xl mx-auto text-center">
              {displayedTitle || 'Simulation'}
            </h1>

            {alreadyCompleted && (
              <div className="max-w-md mx-auto rounded-xl bg-emerald-50 border border-emerald-200 px-6 py-3 mb-5 flex items-center justify-center gap-3 text-sm text-emerald-700">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Previously completed — Score: <span className="font-bold">{prevScore}/{maxScore}</span> ({prevScorePercent}%)
              </div>
            )}

            <p className="text-lg text-gray-600 leading-relaxed max-w-3xl mx-auto text-center mb-6">
              {meta?.description || simulation?.Description || 'Follow the guided simulation steps and complete all moments to finish the activity.'}
            </p>

            {(meta?.steps || []).length > 0 && (
              <div className="max-w-3xl mx-auto bg-[#F8FBFF] border border-[#D7E6F5] rounded-xl p-5">
                <h2 className="text-base font-semibold text-[#0B2B4C] mb-2">What you will do</h2>
                <ol className="list-decimal pl-5 space-y-1.5 text-sm text-[#334155] max-h-56 overflow-y-auto custom-scrollbar pr-1">
                  {meta.steps.map((step, index) => (
                    <li key={index}>{stripHtmlTags(step)}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          <div className="absolute bottom-6 right-6">
            <button
              onClick={handleStartActivity}
              className="px-8 py-3 bg-[#0B2B4C] hover:bg-[#143a63] text-white rounded-xl font-semibold shadow-lg transition-colors flex items-center gap-2"
            >
              {alreadyCompleted ? 'Try Again' : 'Start Activity'}
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isCompleted) {
    return (
      <div className="simulation-theme min-h-screen bg-[#F5F7FA] flex items-center justify-center px-6">
        <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl border border-gray-200 p-10 relative">
          <button
            onClick={handleExit}
            className="absolute top-5 left-5 p-2 rounded-lg hover:bg-gray-100 text-[#0B2B4C]"
            title="Back to Simulations"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="pt-6 pb-20 flex flex-col items-center text-center">
            <p className="text-sm font-semibold text-[#2C5A9E] uppercase tracking-wider mb-3">
              Simulation Activity
            </p>
            <h1 className="text-4xl font-bold text-[#0B2B4C] mb-6 max-w-3xl">
              {displayedTitle || 'Simulation'}
            </h1>
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-8 w-full max-w-md mb-6">
              <h3 className="text-2xl font-bold text-[#0B2B4C] mb-2">Activity Complete!</h3>
              <p className="text-base text-gray-600 mb-1">
                Score: <span className="font-bold text-[#0B2B4C]">{score}/{maxScore}</span>
              </p>
              <p className="text-base text-gray-600">
                Time: <span className="font-bold text-[#0B2B4C]">{formatElapsed(elapsed)}</span>
              </p>
            </div>
          </div>

          <div className="absolute bottom-6 right-6 flex gap-3">
            <button
              onClick={handleReplay}
              className="px-6 py-3 bg-white border border-[#dce8f0] text-[#0B2B4C] rounded-xl font-semibold hover:bg-[#F5F7FA]"
            >
              Try Again
            </button>
            <button
              onClick={handleExit}
              className="px-8 py-3 bg-[#0B2B4C] hover:bg-[#143a63] text-white rounded-xl font-semibold shadow-lg transition-colors"
            >
              Finish
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="simulation-theme min-h-screen bg-[#F5F7FA]">
      <div className="bg-[#0B2B4C] text-white px-5 md:px-8 py-4 flex items-center gap-4 shadow">
        <button
          onClick={handleExit}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
          aria-label="Back to simulations"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">{displayedTitle}</h1>
      </div>

      <div className="w-full px-4 md:px-8 py-6 grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-[#e4ebf2] p-5 md:p-6">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <h2 className="text-xl font-semibold text-[#0B2B4C]">
              {simulation?.ActivityType === 'Troubleshooting'
                ? 'Identify and fix the issue'
                : disassembly
                  ? ''
                  : isAssembling
                    ? 'Drag each part from the tray to its target'
                    : 'Click the highlighted area to reveal'}
            </h2>
            <div className="text-sm text-[#334155] flex items-center gap-5 font-medium">
              <span>Score: <span className="font-bold text-[#0B2B4C]">{score}</span></span>
              <span>Time: <span className="font-bold text-[#0B2B4C]">{formatElapsed(elapsed)}</span></span>
            </div>
          </div>

          <SimulationRenderer
            config={config}
            currentIndex={currentIndex}
            revealedIds={revealedIds}
            onAdvance={isCompleted ? undefined : handleAdvance}
            onWrongClick={isCompleted ? undefined : handleWrongClick}
            disassembly={disassembly}
            assembling={isAssembling}
            assemblingAnchor="background"
            persistFocusLayers={false}
            canvasOverlay={wrongFlash ? (
              <div className="absolute inset-0 rounded-xl border-4 border-red-500 bg-red-500/10 flex items-center justify-center pointer-events-none z-20 animate-pulse">
                <div className="bg-red-600 text-white text-sm font-bold px-4 py-2 rounded-lg shadow-lg">
                  Wrong! −{PENALTY_PER_MISTAKE} pts
                </div>
              </div>
            ) : null}
          />

          <div className="mt-4">
            <div className="flex justify-between items-center text-xs font-semibold text-[#334155] mb-1">
              <span>Progress</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className="h-2 bg-emerald-500 rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-[#e4ebf2] p-5 md:p-6">
            <h3 className="text-lg font-bold text-[#0B2B4C] mb-3">Instructions</h3>
            <ol className="list-decimal pl-8 space-y-1.5 text-sm text-[#334155] max-h-[260px] overflow-y-auto custom-scrollbar pr-1">
              {(meta?.steps || []).map((step, index) => (
                <li key={index} className="leading-snug">{stripHtmlTags(step)}</li>
              ))}
            </ol>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-[#e4ebf2] p-5 md:p-6">
            <h3 className="text-lg font-bold text-[#0B2B4C] mb-3">Current step</h3>
            {currentMoment ? (
              <div>
                <p className="text-sm text-[#334155] mb-2">
                  <span className="font-semibold">{currentMoment.perspective || currentMoment.category}</span> view
                </p>
                <ul className="space-y-1.5 text-sm text-[#334155]">
                  {currentMoment.layers
                    .filter((layer) => layer.kind === 'focus')
                    .map((layer) => (
                      <li key={layer.id} className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${revealedIds.has(layer.id) ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'}`} />
                        {layer.label}
                      </li>
                    ))}
                  {currentMoment.layers.filter((l) => l.kind === 'focus').length === 0 && (
                    <li className="text-gray-500 italic">Click the highlighted zone to continue.</li>
                  )}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-gray-500 italic">Activity complete.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimulationActivity;
