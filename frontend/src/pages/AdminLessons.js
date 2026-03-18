import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../App';
import AdminNavbar from '../components/AdminNavbar';

const decodeHtmlEntities = (value = '') => {
  const normalized = String(value)
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([\da-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  const parser = new DOMParser();
  const doc = parser.parseFromString(normalized, 'text/html');
  return doc.documentElement.textContent || '';
};

const toPlainText = (value = '') => decodeHtmlEntities(String(value).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

const AdminLessons = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('active'); // 'active', 'hidden', 'deleted'

  useEffect(() => {
    // Check if user is admin
    if (user?.role !== 'admin') {
      navigate('/dashboard');
      return;
    }

    fetchLessons();
  }, [user, navigate]);

  const fetchLessons = async () => {
    try {
      const response = await axios.get('/admin/modules');
      console.log('Admin fetched lessons:', response.data);
      setLessons(response.data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching lessons:', err);
      setError('Failed to load lessons');
      setLoading(false);
    }
  };

  const handleAddLesson = () => {
    navigate('/admin/lessons/add');
  };

  const handleEditLesson = (lessonId) => {
    navigate(`/admin/lessons/edit/${lessonId}`);
  };

  const handleHideLesson = async (lessonId) => {
    // Implement hide functionality
    console.log('Hide lesson functionality to be implemented');
  };

  const handleDeleteLesson = async (lessonId) => {
    if (!window.confirm('Are you sure you want to delete this lesson?')) {
      return;
    }

    try {
      await axios.delete(`/admin/modules/${lessonId}`);
      fetchLessons(); // Refresh list
    } catch (err) {
      console.error('Error deleting lesson:', err);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '01 / 15 / 2025';
    const date = new Date(dateString);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${month} / ${day} / ${year}`;
  };

  const getDifficultyColor = (difficulty) => {
    const colors = {
      'Easy': '#4A90E2',
      'Challenging': '#F1C40F',
      'Advanced': '#E67E22',
      'Supplementary': '#9B59B6'
    };
    return colors[difficulty] || colors['Easy'];
  };

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

  // Filter lessons based on active tab
  const filteredLessons = lessons.filter(lesson => {
    if (activeTab === 'active') return true; // Show all for now
    if (activeTab === 'hidden') return false; // No hidden lessons yet
    if (activeTab === 'deleted') return false; // No deleted lessons yet
    return true;
  });

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <AdminNavbar />
      
      <div className="w-full px-8 py-8 min-h-[calc(100vh-80px)] custom-scrollbar">
        {/* Tabs and Add Button */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-8 border-b-2 border-gray-200">
            <button
              onClick={() => setActiveTab('active')}
              className={`pb-3 px-2 font-bold text-lg relative ${
                activeTab === 'active'
                  ? 'text-[#1e5a8e]'
                  : 'text-gray-500'
              }`}
            >
              Active Lessons
              {activeTab === 'active' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2BC4B3]"></div>
              )}
            </button>
            <button
              onClick={() => setActiveTab('hidden')}
              className={`pb-3 px-2 font-bold text-lg relative ${
                activeTab === 'hidden'
                  ? 'text-[#1e5a8e]'
                  : 'text-gray-500'
              }`}
            >
              Hidden Lessons
              {activeTab === 'hidden' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2BC4B3]"></div>
              )}
            </button>
            <button
              onClick={() => setActiveTab('deleted')}
              className={`pb-3 px-2 font-bold text-lg relative ${
                activeTab === 'deleted'
                  ? 'text-[#1e5a8e]'
                  : 'text-gray-500'
              }`}
            >
              Deleted Lessons
              {activeTab === 'deleted' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2BC4B3]"></div>
              )}
            </button>
          </div>

          <button
            onClick={handleAddLesson}
            className="px-6 py-3 bg-[#FFB74D] hover:bg-[#FFA726] text-white rounded-lg font-bold shadow-md transition-all"
          >
            Add Lesson
          </button>
        </div>

        {/* Lessons List */}
        <div className="space-y-4">
          {filteredLessons.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm text-center py-16">
              <h3 className="text-xl font-bold text-gray-700 mb-2">No lessons found</h3>
              <p className="text-gray-500 mb-6">Start by creating your first lesson</p>
              <button 
                onClick={handleAddLesson} 
                className="px-6 py-3 bg-[#FFB74D] hover:bg-[#FFA726] text-white rounded-lg font-bold transition-colors duration-200"
              >
                Create Lesson
              </button>
            </div>
          ) : (
            filteredLessons.map((lesson) => (
              <div 
                key={lesson.ModuleID} 
                className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden flex"
              >
                {/* Colored Left Border */}
                <div 
                  className="w-2"
                  style={{ backgroundColor: getDifficultyColor(lesson.Difficulty) }}
                ></div>

                {/* Content */}
                <div className="flex-1 p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-gray-900 mb-2">
                        Lesson {lesson.LessonOrder} : {toPlainText(lesson.ModuleTitle) || 'Untitled Lesson'}
                      </h3>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-sm font-semibold text-[#1e5a8e]">Date Published</p>
                      <p className="text-sm text-gray-600">{formatDate(lesson.created_at)}</p>
                    </div>
                  </div>

                  <div className="mb-4">
                    <p className="text-sm font-semibold text-gray-700 mb-1">Description</p>
                    <p className="text-sm text-gray-600">
                      {toPlainText(lesson.Description) || 'No description available.'}
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6">
                      <p className="text-sm">
                        <span className="font-semibold text-[#2BC4B3]">Difficulty : </span>
                        <span className="text-gray-700">{lesson.Difficulty || 'Easy'}</span>
                      </p>
                      
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <svg className="w-5 h-5 text-[#1e5a8e]" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3M14 17H7V15H14V17M17 13H7V11H17V13M17 9H7V7H17V9Z"/>
                          </svg>
                          <span className="font-semibold">{lesson.topicCount || 0}</span> Topics
                        </span>
                        
                        <span className="flex items-center gap-1">
                          <svg className="w-5 h-5 text-[#1e5a8e]" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12,3C10.73,3 9.6,3.8 9.18,5H3V7H4.95L2,14C1.53,16 3,17 5.5,17C8,17 9.56,16 9,14L6.05,7H9.17C9.5,7.85 10.15,8.5 11,8.83V20H2V22H22V20H13V8.82C13.85,8.5 14.5,7.85 14.82,7H17.95L15,14C14.53,16 16,17 18.5,17C21,17 22.56,16 22,14L19.05,7H21V5H14.83C14.4,3.8 13.27,3 12,3M12,5A1,1 0 0,1 13,6A1,1 0 0,1 12,7A1,1 0 0,1 11,6A1,1 0 0,1 12,5M5.5,10.25L7,14H4L5.5,10.25M18.5,10.25L20,14H17L18.5,10.25Z"/>
                          </svg>
                          <span className="font-semibold">{lesson.assessmentCount || 0}</span> Assessments
                        </span>

                        <span className="flex items-center gap-1">
                          <svg className="w-5 h-5 text-[#1e5a8e]" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22C6.47,22 2,17.5 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z"/>
                          </svg>
                          <span className="font-semibold">{lesson.duration || 30}</span> Minutes
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleEditLesson(lesson.ModuleID)}
                        className="px-5 py-2 bg-[#4DD0E1] hover:bg-[#2BC4B3] text-white rounded-lg font-semibold transition-all shadow-sm"
                      >
                        Edit Lesson
                      </button>
                      <button
                        onClick={() => handleHideLesson(lesson.ModuleID)}
                        className="px-5 py-2 bg-[#90CAF9] hover:bg-[#64B5F6] text-white rounded-lg font-semibold transition-all shadow-sm"
                      >
                        Hide Lesson
                      </button>
                      <button
                        onClick={() => handleDeleteLesson(lesson.ModuleID)}
                        className="px-5 py-2 bg-[#EF9A9A] hover:bg-[#E57373] text-white rounded-lg font-semibold transition-all shadow-sm"
                      >
                        Delete Lesson
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

export default AdminLessons;
