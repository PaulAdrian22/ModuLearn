import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import AdminNavbar from '../components/AdminNavbar';
import { themedConfirm } from '../utils/themedConfirm';
import { adminApi } from '../services/api';
import { useAsyncData } from '../hooks/useAsyncData';

const decodeHtmlEntities = (value = '') => {
  const normalized = String(value)
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([\da-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  const parser = new DOMParser();
  const doc = parser.parseFromString(normalized, 'text/html');
  return doc.documentElement.textContent || '';
};

const toPlainText = (value = '') => decodeHtmlEntities(String(value).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

const stripObjectivesFromSummary = (value = '') => {
  const plain = toPlainText(value);
  if (!plain) return '';

  const objectiveStart = plain.search(/\b(?:learning\s*objectives?|objectives?)\b\s*[:\-]/i);
  if (objectiveStart === -1) {
    return plain;
  }

  return plain.slice(0, objectiveStart).trim();
};

const toBooleanFlag = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
  }
  return false;
};

const normalizeLessonLanguage = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();

  if (normalized === 'english') return 'English';
  if (normalized === 'taglish' || normalized === 'filipino' || normalized === 'tagalog') return 'Taglish';

  return 'English';
};

const PROTECTED_LESSON_ORDER_MIN = 1;
const PROTECTED_LESSON_ORDER_MAX = 7;

const isProtectedLessonFromDeletion = (lesson) => {
  const difficulty = String(lesson?.Difficulty || '').trim().toLowerCase();
  if (difficulty === 'supplementary') {
    return false;
  }

  const lessonOrder = Number(lesson?.LessonOrder);
  return Number.isFinite(lessonOrder)
    && lessonOrder >= PROTECTED_LESSON_ORDER_MIN
    && lessonOrder <= PROTECTED_LESSON_ORDER_MAX;
};

const AdminLessons = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('english'); // 'english', 'taglish', 'deleted'
  const [lessonActionLoading, setLessonActionLoading] = useState({});

  useEffect(() => {
    if (user?.role !== 'admin') navigate('/dashboard');
  }, [user, navigate]);

  const {
    data: lessonsData,
    loading,
    refetch: fetchLessons,
  } = useAsyncData(
    () => adminApi.modules.listAll({ includeDeleted: true }),
    [],
    { initial: [] },
  );
  const lessons = lessonsData ?? [];

  const handleAddLesson = () => {
    navigate('/admin/lessons/add?type=supplementary');
  };

  // Optimistic updates dropped in favor of refetch — useAsyncData owns the
  // list and re-fires on demand. The visual delay is small (~200ms in
  // practice); if it becomes a UX problem, swap to a local mirror.
  const updateLessonInState = (/* lessonId, patch */) => {
    fetchLessons();
  };

  const withLessonAction = async (lessonId, actionFn) => {
    setLessonActionLoading((prev) => ({ ...prev, [lessonId]: true }));
    try {
      await actionFn();
    } finally {
      setLessonActionLoading((prev) => ({ ...prev, [lessonId]: false }));
    }
  };

  const handleEditLesson = (lesson) => {
    if (toBooleanFlag(lesson.Is_Completed)) {
      return;
    }

    navigate(`/admin/lessons/edit/${lesson.ModuleID}`);
  };

  const handleDeleteLesson = async (lessonId) => {
    if (lessons.some((lesson) => Number(lesson.ModuleID) === Number(lessonId) && isProtectedLessonFromDeletion(lesson))) {
      return;
    }

    const shouldDelete = await themedConfirm({
      title: 'Move Lesson to Recycle Bin',
      message: 'This lesson will be moved to Deleted Lessons and can be restored later.',
      confirmText: 'Move to Bin',
      cancelText: 'Cancel',
      variant: 'danger'
    });

    if (!shouldDelete) {
      return;
    }

    try {
      await withLessonAction(lessonId, async () => {
        await adminApi.modules.softDelete(lessonId);
      });
      fetchLessons();
    } catch (err) {
      console.error('Error deleting lesson:', err);
    }
  };

  const handleRestoreLesson = async (lessonId) => {
    const shouldRestore = await themedConfirm({
      title: 'Restore Lesson',
      message: 'Restore this lesson from Deleted Lessons?',
      confirmText: 'Restore',
      cancelText: 'Cancel',
      variant: 'success'
    });

    if (!shouldRestore) {
      return;
    }

    try {
      await withLessonAction(lessonId, async () => {
        await adminApi.modules.restore(lessonId);
      });
      fetchLessons();
    } catch (err) {
      console.error('Error restoring lesson:', err);
    }
  };

  const handlePermanentDeleteLesson = async (lessonId) => {
    if (lessons.some((lesson) => Number(lesson.ModuleID) === Number(lessonId) && isProtectedLessonFromDeletion(lesson))) {
      return;
    }

    const shouldDeletePermanently = await themedConfirm({
      title: 'Delete Permanently',
      message: 'This will permanently remove the lesson and cannot be undone.',
      confirmText: 'Delete Permanently',
      cancelText: 'Cancel',
      variant: 'danger'
    });

    if (!shouldDeletePermanently) {
      return;
    }

    try {
      await withLessonAction(lessonId, async () => {
        await adminApi.modules.hardDelete(lessonId);
      });
      fetchLessons();
    } catch (err) {
      console.error('Error permanently deleting lesson:', err);
    }
  };

  const handleToggleCompletion = async (lesson) => {
    const lessonId = lesson.ModuleID;
    const isCompleted = toBooleanFlag(lesson.Is_Completed);
    const nextCompleted = !isCompleted;

    if (nextCompleted) {
      const shouldMarkComplete = await themedConfirm({
        title: 'Mark Lesson as Complete?',
        message: 'This will lock editing for this lesson until you set it back to incomplete.',
        confirmText: 'Mark Complete',
        cancelText: 'Cancel',
        variant: 'warning'
      });

      if (!shouldMarkComplete) {
        return;
      }
    }

    try {
      await withLessonAction(lessonId, async () => {
        const updated = await adminApi.modules.setCompletion(lessonId, nextCompleted);
        updateLessonInState(lessonId, { Is_Completed: updated?.is_completed ?? nextCompleted });
      });
    } catch (err) {
      console.error('Error updating lesson completion state:', err);
    }
  };

  const handleToggleLock = async (lesson) => {
    const lessonId = lesson.ModuleID;
    const isUnlocked = toBooleanFlag(lesson.Is_Unlocked);
    const nextUnlocked = !isUnlocked;

    try {
      await withLessonAction(lessonId, async () => {
        const updated = await adminApi.modules.setLockState(lessonId, nextUnlocked);
        updateLessonInState(lessonId, { Is_Unlocked: updated?.is_unlocked ?? nextUnlocked });
      });
    } catch (err) {
      console.error('Error updating lesson lock state:', err);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not available';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return 'Not available';
    return new Intl.DateTimeFormat(undefined, {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    }).format(date);
  };

  const getDifficultyColor = (difficulty) => {
    const colors = {
      'Easy': '#589AD7',
      'Challenging': '#C8B35E',
      'Advanced': '#B98A54',
      'Supplementary': '#8D6EB1'
    };
    return colors[difficulty] || colors['Easy'];
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AdminNavbar />
        <div className="flex items-center justify-center h-64">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  const englishLessonsCount = lessons.filter(
    (lesson) => !toBooleanFlag(lesson.Is_Deleted) && normalizeLessonLanguage(lesson.LessonLanguage) === 'English'
  ).length;
  const taglishLessonsCount = lessons.filter(
    (lesson) => !toBooleanFlag(lesson.Is_Deleted) && normalizeLessonLanguage(lesson.LessonLanguage) === 'Taglish'
  ).length;
  const deletedLessonsCount = lessons.filter((lesson) => toBooleanFlag(lesson.Is_Deleted)).length;

  // Filter lessons based on active tab
  const filteredLessons = lessons.filter(lesson => {
    const isDeleted = toBooleanFlag(lesson.Is_Deleted);
    if (activeTab === 'deleted') return isDeleted;
    if (isDeleted) return false;
    if (activeTab === 'english') return normalizeLessonLanguage(lesson.LessonLanguage) === 'English';
    if (activeTab === 'taglish') return normalizeLessonLanguage(lesson.LessonLanguage) === 'Taglish';
    return false;
  });

  return (
    <div className="min-h-screen bg-background">
      <AdminNavbar />
      
      <div className="w-full px-8 py-8 min-h-[calc(100vh-80px)] custom-scrollbar">
        {/* Tabs and Add Button */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-8 border-b-2 border-gray-200">
            <button
              onClick={() => setActiveTab('english')}
              className={`pb-3 px-2 font-bold text-lg relative ${
                activeTab === 'english'
                  ? 'text-secondary'
                  : 'text-gray-500'
              }`}
            >
              English Lessons ({englishLessonsCount})
              {activeTab === 'english' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-highlight"></div>
              )}
            </button>
            <button
              onClick={() => setActiveTab('taglish')}
              className={`pb-3 px-2 font-bold text-lg relative ${
                activeTab === 'taglish'
                  ? 'text-secondary'
                  : 'text-gray-500'
              }`}
            >
              Taglish Lessons ({taglishLessonsCount})
              {activeTab === 'taglish' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-highlight"></div>
              )}
            </button>
            <button
              onClick={() => setActiveTab('deleted')}
              className={`pb-3 px-2 font-bold text-lg relative ${
                activeTab === 'deleted'
                  ? 'text-secondary'
                  : 'text-gray-500'
              }`}
            >
              Deleted Lessons ({deletedLessonsCount})
              {activeTab === 'deleted' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-highlight"></div>
              )}
            </button>
          </div>

          <button
            onClick={handleAddLesson}
            className="px-6 py-3 bg-[#E9B766] hover:bg-[#FFA726] text-white rounded-lg font-bold shadow-md transition-all"
          >
            Add Supplementary Lesson
          </button>
        </div>

        {/* Lessons List */}
        <div className="space-y-4">
          {filteredLessons.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm text-center py-16">
              <h3 className="text-xl font-bold text-gray-700 mb-2">
                {activeTab === 'deleted' ? 'Recycle bin is empty' : 'No lessons found'}
              </h3>
              <p className="text-gray-500 mb-6">
                {activeTab === 'deleted'
                  ? 'Deleted lessons will appear here and can be restored.'
                  : `Start by creating your first ${activeTab === 'taglish' ? 'Taglish' : 'English'} supplementary lesson`}
              </p>
              {activeTab !== 'deleted' && (
                <button 
                  onClick={handleAddLesson} 
                  className="px-6 py-3 bg-[#E9B766] hover:bg-[#FFA726] text-white rounded-lg font-bold transition-colors duration-200"
                >
                  Create Supplementary Lesson
                </button>
              )}
            </div>
          ) : (
            filteredLessons.map((lesson) => {
              const isDeleteProtected = isProtectedLessonFromDeletion(lesson);

              return (
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
                  {toBooleanFlag(lesson.Is_Deleted) && (
                    <div className="mb-3 inline-flex items-center rounded-full bg-[#FDECEC] px-3 py-1 text-xs font-semibold text-[#C0392B]">
                      In Recycle Bin
                    </div>
                  )}

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">
                        Lesson {lesson.LessonOrder} : {toPlainText(lesson.ModuleTitle) || 'Untitled Lesson'}
                      </h3>
                    </div>
                    <div className="sm:text-right sm:ml-4 flex-shrink-0">
                      <div>
                        <p className="text-xs sm:text-sm font-semibold text-secondary">Last Update</p>
                        <p className="text-xs sm:text-sm text-gray-600">{formatDate(lesson.updated_at || lesson.created_at)}</p>
                      </div>
                      {isDeleteProtected && (
                        <div className="mt-2 inline-flex items-center rounded-full bg-[#E8F4FF] px-3 py-1 text-xs font-semibold text-secondary">
                          Protected (Lesson 1-7)
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mb-4">
                    <p className="text-sm font-semibold text-gray-700 mb-1">Description</p>
                    <p className="text-sm text-gray-600">
                      {stripObjectivesFromSummary(lesson.Description) || 'No description available.'}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_auto] gap-4 items-start">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 min-w-0">
                      <p className="text-sm">
                        <span className="font-semibold text-highlight-dark">Difficulty : </span>
                        <span className="text-gray-700">{lesson.Difficulty || 'Easy'}</span>
                      </p>

                      <p className="text-sm">
                        <span className="font-semibold text-highlight-dark">Language : </span>
                        <span className="text-gray-700">{normalizeLessonLanguage(lesson.LessonLanguage)}</span>
                      </p>

                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          toBooleanFlag(lesson.Is_Completed)
                            ? 'bg-[#E8F7EE] text-[#228B5A]'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {toBooleanFlag(lesson.Is_Completed) ? 'Completed' : 'Incomplete'}
                      </span>

                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          toBooleanFlag(lesson.Is_Unlocked)
                            ? 'bg-[#E8F4FF] text-secondary'
                            : 'bg-[#FDECEC] text-[#C0392B]'
                        }`}
                      >
                        {toBooleanFlag(lesson.Is_Unlocked) ? 'Unlocked' : 'Locked'}
                      </span>
                      
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <svg className="w-5 h-5 text-secondary" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3M14 17H7V15H14V17M17 13H7V11H17V13M17 9H7V7H17V9Z"/>
                          </svg>
                          <span className="font-semibold">{lesson.topicCount || 0}</span> Topics
                        </span>
                        
                        <span className="flex items-center gap-1">
                          <svg className="w-5 h-5 text-secondary" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12,3C10.73,3 9.6,3.8 9.18,5H3V7H4.95L2,14C1.53,16 3,17 5.5,17C8,17 9.56,16 9,14L6.05,7H9.17C9.5,7.85 10.15,8.5 11,8.83V20H2V22H22V20H13V8.82C13.85,8.5 14.5,7.85 14.82,7H17.95L15,14C14.53,16 16,17 18.5,17C21,17 22.56,16 22,14L19.05,7H21V5H14.83C14.4,3.8 13.27,3 12,3M12,5A1,1 0 0,1 13,6A1,1 0 0,1 12,7A1,1 0 0,1 11,6A1,1 0 0,1 12,5M5.5,10.25L7,14H4L5.5,10.25M18.5,10.25L20,14H17L18.5,10.25Z"/>
                          </svg>
                          <span className="font-semibold">{lesson.assessmentCount || 0}</span> Assessments
                        </span>

                        <span className="flex items-center gap-1">
                          <svg className="w-5 h-5 text-secondary" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22C6.47,22 2,17.5 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z"/>
                          </svg>
                          <span className="font-semibold">{lesson.duration || 30}</span> Minutes
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 2xl:justify-end">
                      {toBooleanFlag(lesson.Is_Deleted) ? (
                        <>
                          <button
                            onClick={() => handleRestoreLesson(lesson.ModuleID)}
                            disabled={Boolean(lessonActionLoading[lesson.ModuleID])}
                            className="min-w-[172px] px-5 py-2 text-center bg-[#81C784] hover:bg-[#66BB6A] text-white rounded-lg font-semibold transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            Restore Lesson
                          </button>
                          {!isDeleteProtected && (
                            <button
                              onClick={() => handlePermanentDeleteLesson(lesson.ModuleID)}
                              disabled={Boolean(lessonActionLoading[lesson.ModuleID])}
                              className="min-w-[172px] px-5 py-2 text-center bg-[#EF5350] hover:bg-[#E53935] text-white rounded-lg font-semibold transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              Delete Permanently
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleEditLesson(lesson)}
                            disabled={toBooleanFlag(lesson.Is_Completed) || Boolean(lessonActionLoading[lesson.ModuleID])}
                            className={`min-w-[160px] px-5 py-2 text-center rounded-lg font-semibold transition-all shadow-sm ${
                              toBooleanFlag(lesson.Is_Completed)
                                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                : 'bg-[#64D0E0] hover:bg-highlight text-white'
                            }`}
                          >
                            {toBooleanFlag(lesson.Is_Completed) ? 'Editing Locked' : 'Edit Lesson'}
                          </button>
                          <button
                            onClick={() => handleToggleCompletion(lesson)}
                            disabled={Boolean(lessonActionLoading[lesson.ModuleID])}
                            className={`min-w-[160px] px-5 py-2 text-center text-white rounded-lg font-semibold transition-all shadow-sm ${
                              toBooleanFlag(lesson.Is_Completed)
                                ? 'bg-[#90CAF9] hover:bg-[#64B5F6]'
                                : 'bg-[#81C784] hover:bg-[#66BB6A]'
                            } disabled:opacity-60 disabled:cursor-not-allowed`}
                          >
                            {toBooleanFlag(lesson.Is_Completed) ? 'Mark Incomplete' : 'Mark Complete'}
                          </button>
                          <button
                            onClick={() => handleToggleLock(lesson)}
                            disabled={Boolean(lessonActionLoading[lesson.ModuleID]) || Number(lesson.LessonOrder) === 1}
                            className={`min-w-[160px] px-5 py-2 text-center text-white rounded-lg font-semibold transition-all shadow-sm ${
                              toBooleanFlag(lesson.Is_Unlocked)
                                ? 'bg-[#E9B766] hover:bg-[#FFA726]'
                                : 'bg-[#7986CB] hover:bg-[#5C6BC0]'
                            } disabled:opacity-60 disabled:cursor-not-allowed`}
                            title={Number(lesson.LessonOrder) === 1 ? 'Lesson 1 must stay unlocked' : undefined}
                          >
                            {toBooleanFlag(lesson.Is_Unlocked) ? 'Lock Lesson' : 'Unlock Lesson'}
                          </button>
                          {!isDeleteProtected && (
                            <button
                              onClick={() => handleDeleteLesson(lesson.ModuleID)}
                              disabled={Boolean(lessonActionLoading[lesson.ModuleID])}
                              className="min-w-[160px] px-5 py-2 text-center bg-[#EF9A9A] hover:bg-[#E57373] text-white rounded-lg font-semibold transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              Delete Lesson
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminLessons;
