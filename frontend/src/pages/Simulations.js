import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../App';
import Navbar from '../components/Navbar';

const Simulations = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [simulations, setSimulations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSimulations();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleTakeActivity = (simulation) => {
    navigate(`/simulation/${simulation.SimulationID}`);
  };

  const getCardColor = (order) => {
    const colors = {
      1: { solid: '#2BC4B3', tag: 'bg-[#2BC4B3]' },
      2: { solid: '#4A90E2', tag: 'bg-[#4A90E2]' },
      3: { solid: '#F39C12', tag: 'bg-[#F39C12]' },
      4: { solid: '#9B59B6', tag: 'bg-[#9B59B6]' },
      5: { solid: '#EF5350', tag: 'bg-[#EF5350]' },
      6: { solid: '#1ABC9C', tag: 'bg-[#1ABC9C]' },
      7: { solid: '#E67E22', tag: 'bg-[#E67E22]' }
    };
    return colors[order] || colors[1];
  };

  const sorted = [...simulations].sort((a, b) => a.SimulationOrder - b.SimulationOrder);

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

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <Navbar />

      <div className="w-full px-8 py-8 min-h-[calc(100vh-80px)] custom-scrollbar">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-[#0B2B4C] mb-3">Simulation Activities</h1>
          <p className="text-lg text-gray-600">
            Apply what you've learned through interactive drag-and-drop activities using digital tools!
          </p>
        </div>

        {/* Section Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-[#2BC4B3] rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-[#0B2B4C]">Activities</h2>
        </div>

        {sorted.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm text-center py-16">
            <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            <h3 className="text-xl font-bold text-gray-700 mb-2">No Activities Available Yet</h3>
            <p className="text-gray-500">Simulation activities will appear here once created by your instructor.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sorted.map((simulation) => {
              const colors = getCardColor(simulation.SimulationOrder);
              const isCompleted = simulation.CompletionStatus === 'completed';
              const score = simulation.Score || 0;
              const maxScore = simulation.MaxScore || 10;
              const scorePercent = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

              return (
                <div
                  key={simulation.SimulationID}
                  className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* Top row: order badge + status */}
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white ${colors.tag}`}>
                        {simulation.SimulationOrder}
                      </div>
                      {isCompleted ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#66BB6A] text-white text-xs font-semibold rounded-full">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Completed
                        </span>
                      ) : (
                        <span className={`px-3 py-1 ${colors.tag} text-white text-xs font-semibold rounded-full`}>
                          Available
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="text-xl font-bold text-[#0B2B4C] mb-3">
                    {simulation.SimulationTitle}
                  </h3>

                  {/* Description */}
                  <p className="text-sm text-gray-600 mb-4 line-clamp-3">
                    {simulation.Description || 'Complete this interactive drag-and-drop activity.'}
                  </p>

                  {/* Progress bar */}
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-semibold" style={{ color: colors.solid }}>
                        {isCompleted ? `${scorePercent}% Score` : 'Not started'}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{
                          width: `${isCompleted ? scorePercent : 0}%`,
                          backgroundColor: colors.solid
                        }}
                      ></div>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="flex items-center gap-4 text-xs text-gray-600 mb-5">
                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                      <span>{score} / {maxScore} pts</span>
                    </div>
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

                  {/* Action button */}
                  {isCompleted ? (
                    <button
                      onClick={() => handleTakeActivity(simulation)}
                      className="w-full py-3 bg-[#87CEEB] hover:bg-[#6CB4D9] text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Retake Activity
                    </button>
                  ) : (
                    <button
                      onClick={() => handleTakeActivity(simulation)}
                      className="w-full py-3 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
                      style={{ backgroundColor: colors.solid }}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Take Activity
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
