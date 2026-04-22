import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../App';
import SimulationRenderer from '../components/SimulationRenderer';
import { isDisassemblyActivity, normalizeConfig } from '../data/simulationActivities';

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
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [simulation, setSimulation] = useState(null);
  const [config, setConfig] = useState(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealedIds, setRevealedIds] = useState(() => new Set());
  const [mistakes, setMistakes] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const startedRef = useRef(false);
  const startTimeRef = useRef(Date.now());

  const timeline = config?.timeline || [];
  const meta = config?.meta || null;
  const totalSteps = timeline.length;
  const currentMoment = timeline[currentIndex] || null;
  const disassembly = useMemo(() => isDisassemblyActivity(meta), [meta]);

  const title = simulation?.SimulationTitle || meta?.title || '';
  const displayedTitle = title.replace(/^activity\s*\d+\s*:?\s*/i, '').trim() || title;
  const maxScore = Number(simulation?.MaxScore || 100);
  const score = Math.max(0, maxScore - mistakes * PENALTY_PER_MISTAKE);
  const progressPercent = totalSteps > 0 ? Math.round((revealedIds.size / totalSteps) * 100) : 0;

  // Fetch simulation + merged config.
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
        const normalized = normalizeConfig(configRes.data?.config || {});
        setConfig(normalized);
      } catch (error) {
        console.error('Failed to load simulation:', error);
        if (mounted) setLoadError(error.response?.data?.message || error.message || 'Unable to load simulation.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    run();
    return () => { mounted = false; };
  }, [id, user?.userId]);

  // Mark the simulation as started server-side.
  useEffect(() => {
    if (startedRef.current) return;
    if (!simulation || !user?.userId) return;
    startedRef.current = true;
    startTimeRef.current = Date.now();
    axios.post('/simulations/start', {
      simulationId: simulation.SimulationID,
      userId: user.userId
    }).catch((error) => console.error('Failed to mark simulation started:', error));
  }, [simulation, user?.userId]);

  // Elapsed timer.
  useEffect(() => {
    if (isCompleted || !simulation) return undefined;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isCompleted, simulation]);

  const submitCompletion = useCallback(async (finalScore, finalElapsed) => {
    if (!simulation || !user?.userId || submitting) return;
    setSubmitting(true);
    try {
      await axios.post('/simulations/complete', {
        simulationId: simulation.SimulationID,
        userId: user.userId,
        score: finalScore,
        timeSpent: finalElapsed
      });
    } catch (error) {
      console.error('Failed to submit simulation completion:', error);
    } finally {
      setSubmitting(false);
    }
  }, [simulation, user?.userId, submitting]);

  const handleAdvance = useCallback((layerId) => {
    if (isCompleted || !currentMoment) return;

    const nextRevealed = new Set(revealedIds);
    if (layerId) nextRevealed.add(layerId);
    setRevealedIds(nextRevealed);

    const focusLayers = currentMoment.layers.filter((layer) => layer.kind === 'focus');
    const everyFocusRevealed = focusLayers.length === 0
      || focusLayers.every((layer) => nextRevealed.has(layer.id));

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
  }, [isCompleted, currentMoment, currentIndex, revealedIds, totalSteps, maxScore, mistakes, submitCompletion]);

  // Only advance automatically for truly empty moments.
  useEffect(() => {
    if (isCompleted || !currentMoment) return;
    if ((currentMoment.layers || []).length === 0) {
      // Empty moment - auto-advance after a short delay
      const timer = setTimeout(() => {
        handleAdvance(null);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isCompleted, currentMoment, currentIndex, handleAdvance]);

  const handleExit = () => { navigate('/simulations'); };

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

  return (
    <div className="simulation-theme min-h-screen bg-[#F5F7FA]">
      <div className="bg-[#0B2B4C] text-white px-5 md:px-8 py-4 flex items-center gap-4 shadow">
        <button
          onClick={handleExit}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
          aria-label="Back to simulations"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">{displayedTitle}</h1>
      </div>

      <div className="w-full px-4 md:px-8 py-6 grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-[#e4ebf2] p-5 md:p-6">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <h2 className="text-xl font-semibold text-[#0B2B4C]">
              {disassembly ? 'Click a highlighted part to remove it' : 'Click the highlighted area to reveal'}
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
          />

          {isCompleted && (
            <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-200 p-5 text-center">
              <h3 className="text-xl font-bold text-[#0B2B4C] mb-1">Activity complete!</h3>
              <p className="text-sm text-gray-600 mb-1">Score: <span className="font-bold text-[#0B2B4C]">{score}/{maxScore}</span></p>
              <p className="text-sm text-gray-600 mb-4">Time: <span className="font-bold text-[#0B2B4C]">{formatElapsed(elapsed)}</span></p>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={handleReplay}
                  className="px-4 py-2 rounded-lg bg-white border border-[#dce8f0] text-[#0B2B4C] font-semibold hover:bg-[#F5F7FA]"
                >
                  Try again
                </button>
                <button
                  onClick={handleExit}
                  className="px-4 py-2 rounded-lg bg-[#0B2B4C] text-white font-semibold hover:bg-[#143a63]"
                >
                  Finish
                </button>
              </div>
            </div>
          )}

          <div className="mt-4">
            <div className="flex justify-between items-center text-xs font-semibold text-[#334155] mb-1">
              <span>Progress</span>
              <span>{Math.min(currentIndex, totalSteps)} / {totalSteps} moments</span>
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
            <ol className="list-decimal pl-5 space-y-1.5 text-sm text-[#334155] max-h-[260px] overflow-y-auto custom-scrollbar pr-1">
              {(meta?.steps || []).map((step, index) => (
                <li key={index} className="leading-snug">{step}</li>
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
