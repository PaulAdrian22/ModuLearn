import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../App';
import Navbar from '../components/Navbar';

const SimulationActivity = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [simulation, setSimulation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Background image for activity board
  const [backgroundImage, setBackgroundImage] = useState(null);

  // Activity states: 'intro' | 'active' | 'completed'
  const [activityState, setActivityState] = useState('intro');

  // Timer
  const [timeLeft, setTimeLeft] = useState(0); // in seconds
  const [elapsedTime, setElapsedTime] = useState(0); // in seconds
  const timerRef = useRef(null);

  // Drag & drop state
  const [dropZones, setDropZones] = useState([]);
  const [draggableItems, setDraggableItems] = useState([]);
  const [dragItem, setDragItem] = useState(null);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [draggingItemId, setDraggingItemId] = useState(null);

  const activityAreaRef = useRef(null);

  // Fetch simulation
  useEffect(() => {
    fetchSimulation();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSimulation = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/simulations/${id}?userId=${user.userId}`);
      setSimulation(response.data);

      // Initialize drag-and-drop puzzle from simulation data
      initializePuzzle(response.data);

      setLoading(false);
    } catch (err) {
      console.error('Error fetching simulation:', err);
      setError('Failed to load simulation.');
      setLoading(false);
    }
  };

  const initializePuzzle = (sim) => {
    let zones = [];
    let items = [];

    // Try to load zone data from simulation
    if (sim.ZoneData) {
      try {
        const zoneData = typeof sim.ZoneData === 'string' ? JSON.parse(sim.ZoneData) : sim.ZoneData;
        
        // Load background image from server path
        if (zoneData.backgroundImage) {
          // Convert server path to full URL
          if (zoneData.backgroundImage.startsWith('/uploads')) {
            const apiBaseUrl = axios.defaults.baseURL || 'http://localhost:5000/api';
            const baseUrl = apiBaseUrl.replace('/api', '');
            const fullUrl = `${baseUrl}${zoneData.backgroundImage}`;
            setBackgroundImage(fullUrl);
          } else {
            setBackgroundImage(zoneData.backgroundImage);
          }
        }
        
        if (zoneData.dropZones && Array.isArray(zoneData.dropZones) && zoneData.dropZones.length > 0) {
          // Use admin-configured zones
          zones = zoneData.dropZones.map(z => ({
            id: z.id,
            label: z.label,
            matched: false,
            x: Number(z.x),
            y: Number(z.y)
          }));
          
          // Load small images for draggable items
          items = zoneData.dropZones.map(z => {
            let smallImageUrl = null;
            
            // Convert server path to full URL if small image exists
            if (z.smallImage) {
              if (z.smallImage.startsWith('/uploads')) {
                const apiBaseUrl = axios.defaults.baseURL || 'http://localhost:5000/api';
                const baseUrl = apiBaseUrl.replace('/api', '');
                smallImageUrl = `${baseUrl}${z.smallImage}`;
              } else {
                smallImageUrl = z.smallImage;
              }
            }
            
            return {
              id: z.id,
              label: z.label,
              placed: false,
              placedInZone: null,
              smallImage: smallImageUrl
            };
          });
        }
      } catch (parseErr) {
        console.error('Error parsing ZoneData:', parseErr);
      }
    }

    // Fallback to dummy zones if no zone data
    if (zones.length === 0) {
      const numZones = Math.min(sim.MaxScore || 5, 10);
      const zoneLabels = [
        'CPU', 'RAM', 'GPU', 'PSU', 'SSD',
        'Motherboard', 'HDD', 'Fan', 'Heatsink', 'BIOS Chip'
      ];

      const positions = [
        { x: 18, y: 22 }, { x: 50, y: 18 }, { x: 82, y: 22 },
        { x: 30, y: 50 }, { x: 70, y: 50 },
        { x: 18, y: 78 }, { x: 50, y: 78 }, { x: 82, y: 78 },
        { x: 38, y: 35 }, { x: 62, y: 65 }
      ];

      for (let i = 0; i < numZones; i++) {
        const label = zoneLabels[i] || `Component ${i + 1}`;
        const pos = positions[i] || { x: 15 + (i % 4) * 25, y: 20 + Math.floor(i / 4) * 30 };
        zones.push({
          id: i + 1,
          label: label,
          matched: false,
          x: pos.x,
          y: pos.y
        });
        items.push({
          id: i + 1,
          label: label,
          placed: false,
          placedInZone: null
        });
      }
    }

    // Shuffle draggable items
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    setDropZones(zones);
    setDraggableItems(shuffled);
  };

  // Start the activity
  const handleStart = async () => {
    try {
      await axios.post('/simulations/start', {
        simulationId: parseInt(id),
        userId: user.userId
      });
    } catch (err) {
      console.error('Error starting simulation:', err);
    }

    setActivityState('active');
    setElapsedTime(0);

    // Always countdown — use TimeLimit if set, otherwise default 10 minutes
    const countdownSeconds = simulation.TimeLimit > 0 ? simulation.TimeLimit * 60 : 10 * 60;
    setTimeLeft(countdownSeconds);
  };

  // Timer effect — always countdown
  useEffect(() => {
    if (activityState !== 'active') return;

    timerRef.current = setInterval(() => {
      setElapsedTime(prev => prev + 1);

      setTimeLeft(prev => {
        if (prev <= 1) {
          // Time's up - auto submit
          clearInterval(timerRef.current);
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activityState]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAutoSubmit = () => {
    // Calculate current score and submit
    const correctCount = dropZones.filter(z => z.matched).length;
    submitResults(correctCount);
  };

  // Drag handlers
  const handleDragStart = (e, item) => {
    if (activityState !== 'active') return;
    setDragItem(item);
    setDraggingItemId(item.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.id.toString());

    // Create a clean, fully opaque drag image clone
    const el = e.currentTarget;
    const clone = el.cloneNode(true);
    clone.style.position = 'absolute';
    clone.style.top = '-9999px';
    clone.style.left = '-9999px';
    clone.style.opacity = '1';
    clone.style.transform = 'none';
    clone.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
    clone.style.borderRadius = '8px';
    clone.style.width = el.offsetWidth + 'px';
    clone.style.background = 'white';
    clone.style.zIndex = '99999';
    clone.style.pointerEvents = 'none';
    document.body.appendChild(clone);
    e.dataTransfer.setDragImage(clone, el.offsetWidth / 2, el.offsetHeight / 2);
    setTimeout(() => { if (clone.parentNode) clone.parentNode.removeChild(clone); }, 0);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, zone) => {
    e.preventDefault();
    if (activityState !== 'active') return;

    const droppedId = Number(e.dataTransfer.getData('text/plain'));
    const droppedItem = draggableItems.find(item => item.id === droppedId) || dragItem;
    if (!droppedItem || droppedItem.placed) {
      setDragItem(null);
      setDraggingItemId(null);
      return;
    }

    const isCorrect = droppedItem.id === zone.id;

    if (isCorrect) {
      // Mark zone as matched
      setDropZones(prev => prev.map(z =>
        z.id === zone.id ? { ...z, matched: true } : z
      ));
      // Mark item as placed
      setDraggableItems(prev => prev.map(item =>
        item.id === droppedItem.id ? { ...item, placed: true, placedInZone: zone.id } : item
      ));
      setFeedback('correct');
    } else {
      setFeedback('incorrect');
    }

    setDragItem(null);
    setDraggingItemId(null);

    // Clear feedback after 800ms
    setTimeout(() => setFeedback(''), 800);
  };

  // Check if all zones are filled
  useEffect(() => {
    if (activityState !== 'active') return;
    const allMatched = dropZones.length > 0 && dropZones.every(z => z.matched);
    if (allMatched) {
      // Small delay before showing completion
      setTimeout(() => {
        const correctCount = dropZones.filter(z => z.matched).length;
        submitResults(correctCount);
      }, 600);
    }
  }, [dropZones, activityState]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitResults = async (correctCount) => {
    if (activityState === 'completed') return;

    if (timerRef.current) clearInterval(timerRef.current);

    const maxScore = simulation?.MaxScore || dropZones.length;
    const finalScore = Math.round((correctCount / dropZones.length) * maxScore);
    setScore(finalScore);
    setActivityState('completed');

    try {
      await axios.post('/simulations/complete', {
        simulationId: parseInt(id),
        userId: user.userId,
        score: finalScore,
        timeSpent: elapsedTime
      });
    } catch (err) {
      console.error('Error completing simulation:', err);
    }
  };

  const handleSubmitManual = () => {
    const correctCount = dropZones.filter(z => z.matched).length;
    submitResults(correctCount);
  };

  const handleRetry = () => {
    setActivityState('intro');
    setScore(0);
    setElapsedTime(0);
    setFeedback('');
    if (simulation) initializePuzzle(simulation);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA]">
        <Navbar />
        <div className="flex items-center justify-center h-96">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  if (error || !simulation) {
    return (
      <div className="min-h-screen bg-[#F5F7FA]">
        <Navbar />
        <div className="max-w-4xl mx-auto px-6 py-16 text-center">
          <svg className="w-16 h-16 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <h2 className="text-2xl font-bold text-gray-700 mb-2">{error || 'Simulation not found'}</h2>
          <button
            onClick={() => navigate('/simulations')}
            className="mt-4 px-6 py-3 bg-[#2BC4B3] text-white rounded-lg font-semibold hover:bg-[#1e5a8e] transition-colors"
          >
            Back to Simulations
          </button>
        </div>
      </div>
    );
  }

  // INTRO SCREEN
  if (activityState === 'intro') {
    return (
      <div className="min-h-screen bg-[#F5F7FA]">
        <Navbar />
        <div className="max-w-3xl mx-auto px-6 py-12">
          {/* Back button */}
          <button
            onClick={() => navigate('/simulations')}
            className="flex items-center gap-2 text-[#1e5a8e] hover:text-[#2BC4B3] font-semibold mb-8 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Simulations
          </button>

          <div className="bg-white rounded-2xl shadow-lg p-10 text-center">
            {/* Activity icon */}
            <div className="w-20 h-20 bg-[#2BC4B3] rounded-2xl flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>

            <h1 className="text-3xl font-bold text-[#0B2B4C] mb-4">
              {simulation.SimulationTitle}
            </h1>

            <p className="text-gray-600 text-lg mb-8 max-w-xl mx-auto">
              {simulation.Description || 'Drag the labels to their correct positions on the activity board.'}
            </p>

            {/* Info cards */}
            <div className="flex justify-center gap-6 mb-10">
              <div className="bg-[#F5F7FA] rounded-xl px-6 py-4 text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <svg className="w-5 h-5 text-[#F39C12]" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <span className="text-sm font-semibold text-gray-500">Max Score</span>
                </div>
                <p className="text-2xl font-bold text-[#0B2B4C]">{simulation.MaxScore} pts</p>
              </div>

              {simulation.TimeLimit > 0 && (
                <div className="bg-[#F5F7FA] rounded-xl px-6 py-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <svg className="w-5 h-5 text-[#EF5350]" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm font-semibold text-gray-500">Time Limit</span>
                  </div>
                  <p className="text-2xl font-bold text-[#0B2B4C]">{simulation.TimeLimit} min</p>
                </div>
              )}

              <div className="bg-[#F5F7FA] rounded-xl px-6 py-4 text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <svg className="w-5 h-5 text-[#4A90E2]" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                    <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm font-semibold text-gray-500">Items</span>
                </div>
                <p className="text-2xl font-bold text-[#0B2B4C]">{dropZones.length || Math.min(simulation.MaxScore || 5, 10)}</p>
              </div>
            </div>

            {/* Previous attempt info */}
            {simulation.CompletionStatus === 'completed' && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-8 max-w-md mx-auto">
                <p className="text-green-800 font-semibold text-sm">
                  Previous best: {simulation.Score || 0} / {simulation.MaxScore} pts
                  ({simulation.Attempts || 0} attempt{(simulation.Attempts || 0) !== 1 ? 's' : ''})
                </p>
              </div>
            )}

            <button
              onClick={handleStart}
              className="px-12 py-4 bg-[#2BC4B3] text-white text-lg font-bold rounded-xl hover:bg-[#1e5a8e] transition-colors shadow-lg hover:shadow-xl"
            >
              {simulation.CompletionStatus === 'completed' ? 'Retake Activity' : 'Start Activity'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // COMPLETED SCREEN
  if (activityState === 'completed') {
    const maxScore = simulation?.MaxScore || dropZones.length;
    const scorePercent = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    const isPerfect = scorePercent === 100;
    const isGood = scorePercent >= 70;

    return (
      <div className="min-h-screen bg-[#F5F7FA]">
        <Navbar />
        <div className="max-w-3xl mx-auto px-6 py-12">
          <div className="bg-white rounded-2xl shadow-lg p-10 text-center">
            {/* Result icon */}
            <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 ${
              isPerfect ? 'bg-[#66BB6A]' : isGood ? 'bg-[#2BC4B3]' : 'bg-[#F39C12]'
            }`}>
              {isPerfect ? (
                <svg className="w-14 h-14 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-14 h-14 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              )}
            </div>

            <h1 className="text-3xl font-bold text-[#0B2B4C] mb-2">
              {isPerfect ? 'Perfect Score!' : isGood ? 'Great Job!' : 'Activity Complete'}
            </h1>
            <p className="text-gray-500 mb-8">{simulation.SimulationTitle}</p>

            {/* Score display */}
            <div className="flex justify-center gap-8 mb-10">
              <div className="bg-[#F5F7FA] rounded-xl px-8 py-5 text-center">
                <p className="text-sm font-semibold text-gray-500 mb-1">Score</p>
                <p className="text-4xl font-bold" style={{ color: isPerfect ? '#66BB6A' : isGood ? '#2BC4B3' : '#F39C12' }}>
                  {score} / {maxScore}
                </p>
                <p className="text-sm text-gray-400 mt-1">{scorePercent}%</p>
              </div>

              <div className="bg-[#F5F7FA] rounded-xl px-8 py-5 text-center">
                <p className="text-sm font-semibold text-gray-500 mb-1">Time</p>
                <p className="text-4xl font-bold text-[#4A90E2]">
                  {formatTime(elapsedTime)}
                </p>
                <p className="text-sm text-gray-400 mt-1">elapsed</p>
              </div>

              <div className="bg-[#F5F7FA] rounded-xl px-8 py-5 text-center">
                <p className="text-sm font-semibold text-gray-500 mb-1">Correct</p>
                <p className="text-4xl font-bold text-[#9B59B6]">
                  {dropZones.filter(z => z.matched).length} / {dropZones.length}
                </p>
                <p className="text-sm text-gray-400 mt-1">placed</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-center gap-4">
              <button
                onClick={handleRetry}
                className="px-8 py-3 bg-[#87CEEB] text-white font-semibold rounded-lg hover:bg-[#6CB4D9] transition-colors shadow-sm"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Try Again
                </span>
              </button>
              <button
                onClick={() => navigate('/simulations')}
                className="px-8 py-3 bg-[#2BC4B3] text-white font-semibold rounded-lg hover:bg-[#1e5a8e] transition-colors shadow-sm"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                  All Simulations
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ACTIVE ACTIVITY SCREEN
  const matchedCount = dropZones.filter(z => z.matched).length;
  const totalZones = dropZones.length;
  const progressPercent = totalZones > 0 ? Math.round((matchedCount / totalZones) * 100) : 0;
  const unplacedItems = draggableItems.filter(item => !item.placed);

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <Navbar />
      
      {/* Activity Header Bar */}
      <div className="bg-[#0B2B4C] px-6 py-4 shadow-lg">
        <div className="w-full">
          {/* Title and Back Button */}
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => {
                if (window.confirm('Are you sure you want to leave? Your progress will be lost.')) {
                  if (timerRef.current) clearInterval(timerRef.current);
                  navigate('/simulations');
                }
              }}
              className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-white font-bold text-xl flex-1">
              {simulation.SimulationTitle}
            </h1>
            
            {/* Timer */}
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              timeLeft < 60
                ? 'bg-red-500/20 text-red-300 animate-pulse'
                : 'bg-white/10 text-white'
            }`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-mono font-bold text-lg">
                {formatTime(timeLeft)}
              </span>
            </div>

            <button
              onClick={handleSubmitManual}
              className="px-6 py-2.5 bg-[#2BC4B3] text-white font-semibold rounded-lg hover:bg-[#1e5a8e] transition-colors"
            >
              Submit
            </button>
          </div>

          {/* Progress Bar */}
          <div className="flex items-center gap-3">
            <span className="text-white/70 text-sm font-medium">Progress:</span>
            <div className="flex-1 bg-white/20 rounded-full h-3">
              <div
                className="h-3 rounded-full bg-[#2BC4B3] transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
            <span className="text-white font-bold">{matchedCount}/{totalZones} zones</span>
          </div>
        </div>
      </div>

      {/* Feedback toast */}
      {feedback && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 animate-bounce">
          <div className={`px-6 py-3 rounded-xl shadow-lg font-bold text-white text-lg ${
            feedback === 'correct' ? 'bg-[#66BB6A]' : 'bg-[#EF5350]'
          }`}>
            {feedback === 'correct' ? '✓ Correct!' : '✗ Try Again'}
          </div>
        </div>
      )}

      {/* Main: two-column layout matching AddSimulation builder */}
      <div className="w-full px-4 md:px-8 py-4 md:py-6">
        <p className="text-gray-600 text-center text-sm mb-6 font-medium">
          Drag each part from the right panel and drop it on the exact matching area
        </p>

        <div className="flex flex-col xl:flex-row gap-6">
          {/* Left: Activity Board (matches AddSimulation background container style) */}
          <div className="flex-1 min-w-0">
            <div
              ref={activityAreaRef}
              className="relative border-2 border-gray-300 rounded-lg overflow-hidden bg-white"
              style={{ minHeight: '62vh' }}
            >
              {/* Background image or default grid pattern */}
              {backgroundImage ? (
                <div className="relative w-fit max-w-full mx-auto" style={{ zIndex: 1 }}>
                  <img
                    src={backgroundImage}
                    alt="Activity background"
                    className="block w-auto h-auto max-w-full max-h-[74vh]"
                    draggable={false}
                  />

                  {/* Drop zone overlay sits on the same image frame as admin builder */}
                  <div className="absolute inset-0">
                    {dropZones.map((zone) => {
                      const installedItem = draggableItems.find(item => item.placedInZone === zone.id);

                      return (
                        <div
                          key={zone.id}
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, zone)}
                          className={`absolute flex items-center justify-center transition-all ${
                            zone.matched
                              ? 'w-24 h-24'
                              : 'w-16 h-16 rounded-full border-3 cursor-pointer border-[#2BC4B3] bg-[#2BC4B3]/50 hover:bg-[#2BC4B3]/70 hover:shadow-lg hover:scale-105'
                          }`}
                          style={{
                            left: `${zone.x}%`,
                            top: `${zone.y}%`,
                            transform: 'translate(-50%, -50%)',
                            zIndex: zone.matched ? 35 : 30,
                            borderWidth: zone.matched ? '0px' : '3px'
                          }}
                          title={zone.matched ? `${zone.label} installed` : `Area ${zone.id} - drop "${zone.label}" here`}
                        >
                          {zone.matched ? (
                            installedItem?.smallImage ? (
                              <div className="w-full h-full relative">
                                <img
                                  src={installedItem.smallImage}
                                  alt={installedItem.label}
                                  className="w-full h-full object-contain drop-shadow-lg"
                                  draggable={false}
                                />
                                <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-[#66BB6A] border-2 border-white flex items-center justify-center shadow-md">
                                  <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                </div>
                              </div>
                            ) : (
                              <div className="w-16 h-16 rounded-full bg-[#66BB6A]/80 border-2 border-white shadow-xl flex items-center justify-center">
                                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              </div>
                            )
                          ) : (
                            <span className="text-white font-bold text-xl drop-shadow">{zone.id}</span>
                          )}
                        </div>
                      );
                    })}

                    {/* Zone labels shown below installed parts */}
                    {dropZones.map((zone) => (
                      <div
                        key={`label-${zone.id}`}
                        className="absolute text-center z-20 pointer-events-none"
                        style={{
                          left: `${zone.x}%`,
                          top: `${zone.y}%`,
                          transform: 'translate(-50%, 42px)',
                          maxWidth: '120px'
                        }}
                      >
                        {zone.matched && (
                          <span className="text-xs font-bold px-2 py-1 rounded bg-[#66BB6A] text-white shadow-sm">
                            {zone.label}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="absolute inset-0" style={{
                  backgroundImage: `
                    linear-gradient(to right, #e5e7eb 1px, transparent 1px),
                    linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)
                  `,
                  backgroundSize: '40px 40px',
                  zIndex: 1
                }}></div>
              )}

              {/* Board label */}
              <div className="absolute top-3 left-3 bg-[#0B2B4C] text-white px-3 py-1.5 rounded-md text-xs font-bold z-20 shadow-sm">
                Activity Board
              </div>

              {/* Instructions overlay */}
              <div className="absolute top-3 right-3 bg-white border-2 border-[#2BC4B3] px-3 py-1.5 rounded-md text-xs font-semibold text-[#0B2B4C] z-20 shadow-sm hidden sm:block">
                Drop parts on matching areas
              </div>

              {!backgroundImage && (
                <>
                  {dropZones.map((zone) => {
                    const installedItem = draggableItems.find(item => item.placedInZone === zone.id);

                    return (
                      <div
                        key={`no-bg-zone-${zone.id}`}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, zone)}
                        className={`absolute flex items-center justify-center transition-all ${
                          zone.matched
                            ? 'w-24 h-24'
                            : 'w-16 h-16 rounded-full border-3 cursor-pointer border-[#2BC4B3] bg-[#2BC4B3]/50 hover:bg-[#2BC4B3]/70 hover:shadow-lg hover:scale-105'
                        }`}
                        style={{
                          left: `${zone.x}%`,
                          top: `${zone.y}%`,
                          transform: 'translate(-50%, -50%)',
                          zIndex: zone.matched ? 35 : 30,
                          borderWidth: zone.matched ? '0px' : '3px'
                        }}
                        title={zone.matched ? `${zone.label} installed` : `Area ${zone.id} - drop "${zone.label}" here`}
                      >
                        {zone.matched ? (
                          installedItem?.smallImage ? (
                            <img
                              src={installedItem.smallImage}
                              alt={installedItem.label}
                              className="w-full h-full object-contain drop-shadow-lg"
                              draggable={false}
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-full bg-[#66BB6A]/80 border-2 border-white shadow-xl flex items-center justify-center">
                              <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )
                        ) : (
                          <span className="text-white font-bold text-xl drop-shadow">{zone.id}</span>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>

          {/* Right: Draggable Items Panel (matches AddSimulation style) */}
          <div className="w-full xl:w-80 flex-shrink-0">
            <div className="flex items-center justify-between mb-4">
              <label className="block text-sm font-bold text-[#0B2B4C]">Drag Parts</label>
              <span className="text-xs font-bold text-white bg-[#2BC4B3] px-3 py-1 rounded-full shadow-sm">
                {unplacedItems.length} remaining
              </span>
            </div>

            {unplacedItems.length === 0 && matchedCount === totalZones ? (
              <div className="border-2 border-[#66BB6A] bg-[#66BB6A]/10 rounded-xl p-8 text-center">
                <svg className="w-16 h-16 text-[#66BB6A] mx-auto mb-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <p className="text-[#66BB6A] font-bold">All parts installed!</p>
                <p className="text-gray-600 text-sm mt-1">Click Submit to finish</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[74vh] overflow-y-auto pr-2 custom-scrollbar">
                {draggableItems.map((item) => (
                  <div
                    key={item.id}
                    draggable={!item.placed}
                    onDragStart={(e) => handleDragStart(e, item)}
                    onDragEnd={() => {
                      setDragItem(null);
                      setDraggingItemId(null);
                    }}
                    className={`rounded-lg p-4 transition-all duration-200 select-none ${
                      item.placed
                        ? 'bg-[#66BB6A]/10 border-2 border-[#66BB6A]/40 opacity-60'
                        : `bg-white border-2 hover:shadow-lg cursor-grab active:cursor-grabbing active:scale-[1.02] active:shadow-xl shadow-sm ${draggingItemId === item.id ? 'border-[#2BC4B3] shadow-xl scale-[1.02]' : 'border-gray-300 hover:border-[#2BC4B3]'}`
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Show small image if exists, otherwise show numbered circle */}
                      {item.smallImage ? (
                        <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border-2 border-gray-200 bg-gray-50">
                          <img 
                            src={item.smallImage} 
                            alt={item.label}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      ) : (
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm ${
                          item.placed ? 'bg-[#66BB6A]' : 'bg-[#2BC4B3]'
                        }`}>
                          {item.placed ? (
                            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <span className="text-white font-bold">{item.id}</span>
                          )}
                        </div>
                      )}
                      <span className={`text-sm font-bold flex-1 ${
                        item.placed ? 'text-[#66BB6A] line-through' : 'text-[#0B2B4C]'
                      }`}>
                        {item.label}
                      </span>
                      {!item.placed && (
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 8h16M4 16h16" />
                        </svg>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

export default SimulationActivity;
