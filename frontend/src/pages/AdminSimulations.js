import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../App';
import AdminNavbar from '../components/AdminNavbar';

const AdminSimulations = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [simulations, setSimulations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role !== 'admin') {
      navigate('/dashboard');
      return;
    }
    fetchData();
  }, [user, navigate]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const simRes = await axios.get('/simulations');
      setSimulations(Array.isArray(simRes.data) ? simRes.data : []);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching data:', err);
      setSimulations([]);
      setLoading(false);
    }
  };

  const handleAddSimulation = () => {
    navigate('/admin/simulations/add');
  };

  const handleEditSimulation = (simulationId) => {
    navigate(`/admin/simulations/edit/${simulationId}`);
  };

  const handleDeleteSimulation = async (simulationId) => {
    if (!window.confirm('Are you sure you want to delete this simulation?')) return;
    try {
      await axios.delete(`/simulations/admin/${simulationId}`);
      fetchData();
    } catch (err) {
      console.error('Error deleting simulation:', err);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${month} / ${day} / ${year}`;
  };

  const getSimBorderColor = (order) => {
    const colors = {
      1: '#8AB4F8',
      2: '#4DD0E1',
      3: '#FFB74D',
      4: '#EF5350',
      5: '#9B59B6',
      6: '#66BB6A',
      7: '#FF7043'
    };
    return colors[order] || '#8AB4F8';
  };

  const getActivityTypeIcon = (type) => {
    const t = (type || '').toLowerCase();
    if (t.includes('diagram') || t.includes('interactive')) {
      return (
        <svg className="w-5 h-5 text-[#1e5a8e]" fill="currentColor" viewBox="0 0 24 24">
          <path d="M21,16V4H3V16H21M21,2A2,2 0 0,1 23,4V16A2,2 0 0,1 21,18H14V20H16V22H8V20H10V18H3C1.89,18 1,17.1 1,16V4C1,2.89 1.89,2 3,2H21M5,6H14V11H5V6M15,6H19V8H15V6M19,9V14H15V9H19M5,12H9V14H5V12M10,12H14V14H10V12Z"/>
        </svg>
      );
    }
    if (t.includes('step') || t.includes('activity')) {
      return (
        <svg className="w-5 h-5 text-[#1e5a8e]" fill="currentColor" viewBox="0 0 24 24">
          <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M9,13V11H18V13H9M9,17V15H15V17H9Z"/>
        </svg>
      );
    }
    return (
      <svg className="w-5 h-5 text-[#1e5a8e]" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M7.07,18.28C7.5,17.38 10.12,16.5 12,16.5C13.88,16.5 16.5,17.38 16.93,18.28C15.57,19.36 13.86,20 12,20C10.14,20 8.43,19.36 7.07,18.28M18.36,16.83C16.93,15.09 13.46,14.5 12,14.5C10.54,14.5 7.07,15.09 5.64,16.83C4.62,15.5 4,13.82 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,13.82 19.38,15.5 18.36,16.83M12,6C10.06,6 8.5,7.56 8.5,9.5C8.5,11.44 10.06,13 12,13C13.94,13 15.5,11.44 15.5,9.5C15.5,7.56 13.94,6 12,6M12,11A1.5,1.5 0 0,1 10.5,9.5A1.5,1.5 0 0,1 12,8A1.5,1.5 0 0,1 13.5,9.5A1.5,1.5 0 0,1 12,11Z"/>
      </svg>
    );
  };

  // Sort simulations by order
  const sortedSimulations = [...simulations].sort((a, b) => a.SimulationOrder - b.SimulationOrder);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA]">
        <AdminNavbar />
        <div className="flex items-center justify-center h-64">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <AdminNavbar />
      
      <div className="w-full px-8 py-8 min-h-[calc(100vh-80px)] custom-scrollbar">
        {/* Header and Add Button */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-[#1e5a8e]">Simulations</h1>
          <button
            onClick={handleAddSimulation}
            className="px-6 py-3 bg-[#FFB74D] hover:bg-[#FFA726] text-white rounded-lg font-bold shadow-md transition-all"
          >
            Add Simulation
          </button>
        </div>

        {/* Simulations List */}
        <div className="space-y-4">
          {sortedSimulations.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm text-center py-16">
              <h3 className="text-xl font-bold text-gray-700 mb-2">No simulations found</h3>
              <p className="text-gray-500 mb-6">Start by creating your first simulation activity</p>
              <button
                onClick={handleAddSimulation}
                className="px-6 py-3 bg-[#FFB74D] hover:bg-[#FFA726] text-white rounded-lg font-bold transition-colors duration-200"
              >
                Create Simulation
              </button>
            </div>
          ) : (
            sortedSimulations.map((simulation) => (
              <div
                key={simulation.SimulationID}
                className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden flex"
              >
                {/* Colored Left Border */}
                <div
                  className="w-2"
                  style={{ backgroundColor: getSimBorderColor(simulation.SimulationOrder) }}
                ></div>

                {/* Content */}
                <div className="flex-1 p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-gray-900 mb-2">
                        Activity {simulation.SimulationOrder}: {simulation.SimulationTitle}
                      </h3>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-sm font-semibold text-[#1e5a8e]">Date Created</p>
                      <p className="text-sm text-gray-600">{formatDate(simulation.created_at)}</p>
                    </div>
                  </div>

                  <div className="mb-4">
                    <p className="text-sm font-semibold text-gray-700 mb-1">Description</p>
                    <p className="text-sm text-gray-600">
                      {simulation.Description || 'No description available.'}
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6">
                      {/* Activity Type */}
                      <p className="text-sm flex items-center gap-2">
                        {getActivityTypeIcon(simulation.ActivityType)}
                        <span className="font-semibold text-[#2BC4B3]">Type: </span>
                        <span className="text-gray-700">{simulation.ActivityType || 'General'}</span>
                      </p>

                      {/* Max Score */}
                      <span className="flex items-center gap-1 text-sm text-gray-600">
                        <svg className="w-5 h-5 text-[#1e5a8e]" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                        </svg>
                        <span className="font-semibold">{simulation.MaxScore}</span> Points
                      </span>

                      {/* Time Limit */}
                      <span className="flex items-center gap-1 text-sm text-gray-600">
                        <svg className="w-5 h-5 text-[#1e5a8e]" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22C6.47,22 2,17.5 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z"/>
                        </svg>
                        <span className="font-semibold">
                          {simulation.TimeLimit > 0 ? `${simulation.TimeLimit} min` : 'No limit'}
                        </span>
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleEditSimulation(simulation.SimulationID)}
                        className="px-5 py-2 bg-[#4DD0E1] hover:bg-[#2BC4B3] text-white rounded-lg font-semibold transition-all shadow-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteSimulation(simulation.SimulationID)}
                        className="px-5 py-2 bg-[#EF9A9A] hover:bg-[#E57373] text-white rounded-lg font-semibold transition-all shadow-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminSimulations;
