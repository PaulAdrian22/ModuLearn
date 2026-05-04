import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import InitialAssessmentModal from '../components/InitialAssessmentModal';
import { normalizePreferredLanguage } from '../utils/languagePreference';
import { buildInitialAssessmentQuestions } from '../utils/initialAssessmentQuestions';

const PENDING_INITIAL_ASSESSMENT_KEY = 'modulearnPendingInitialAssessment';

const InitialAssessment = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const pendingAssessmentToken =
    typeof window !== 'undefined'
      ? window.sessionStorage.getItem(PENDING_INITIAL_ASSESSMENT_KEY)
      : null;

  const initialLanguage = useMemo(() => {
    return normalizePreferredLanguage(
      location.state?.language ||
      (typeof window !== 'undefined' ? window.localStorage.getItem('preferredLanguage') : 'English') ||
      'English'
    );
  }, [location.state?.language]);

  const [language, setLanguage] = useState(initialLanguage);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLanguage(initialLanguage);
  }, [initialLanguage]);

  useEffect(() => {
    if (pendingAssessmentToken === 'true') return;
    navigate('/dashboard', { replace: true });
  }, [navigate, pendingAssessmentToken]);

  useEffect(() => {
    if (pendingAssessmentToken !== 'true') return;
    if (!user?.userId) return;

    let cancelled = false;

    const loadQuestions = async () => {
      setLoading(true);
      setError('');

      try {
        const resolvedLanguage = normalizePreferredLanguage(language || 'English');
        const { data: rawModules, error: modError } = await (async () => {
          const { supabase } = await import('../lib/supabase');
          return supabase
            .from('modules')
            .select('id, title, lesson_order, diagnostic_questions')
            .eq('is_deleted', false)
            .order('lesson_order', { ascending: true });
        })();
        if (modError) throw modError;
        const contentModules = rawModules ?? [];
        if (cancelled) return;

        const generatedQuestions = buildInitialAssessmentQuestions(contentModules, resolvedLanguage);

        if (generatedQuestions.length < 35) {
          setError('Unable to build the full 35-item initial assessment from lesson data.');
          setQuestions([]);
          return;
        }

        setQuestions(generatedQuestions);
      } catch (requestError) {
        console.error('Error preparing initial assessment:', requestError);
        if (!cancelled) {
          setError('Failed to prepare initial assessment. Please try again.');
          setQuestions([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadQuestions();

    return () => {
      cancelled = true;
    };
  }, [pendingAssessmentToken, user?.userId, language]);

  const clearPendingAssessment = () => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(PENDING_INITIAL_ASSESSMENT_KEY);
    window.localStorage.setItem('hasCompletedInitialAssessment', 'true');
  };

  if (pendingAssessmentToken !== 'true') {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#d9f5f1] via-[#eef8ff] to-[#d3ecfb] flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-md rounded-2xl bg-white/95 border border-[#cde3f1] shadow-xl px-7 py-8 text-center">
          <div className="w-14 h-14 mx-auto mb-4 border-4 border-[#2FCAB8]/30 border-t-[#2FCAB8] rounded-full animate-spin" />
          <p className="text-lg font-semibold text-[#1f4c72]">Preparing your initial assessment...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#d9f5f1] via-[#eef8ff] to-[#d3ecfb] flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-lg rounded-2xl bg-white/95 border border-[#f4c7c7] shadow-xl px-7 py-7 text-center">
          <h1 className="text-2xl font-bold text-[#1f4c72] mb-3">Initial Assessment Unavailable</h1>
          <p className="text-sm text-[#a03333] mb-5">{error}</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-xl bg-[#2FCAB8] hover:bg-[#1fb6a5] text-white font-semibold transition-colors"
            >
              Retry
            </button>
            <button
              onClick={() => {
                clearPendingAssessment();
                navigate('/dashboard', { replace: true });
              }}
              className="px-5 py-2.5 rounded-xl bg-[#e9f2f8] hover:bg-[#dcebf5] text-[#214f74] font-semibold transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <InitialAssessmentModal
      standalone
      language={language}
      questions={questions}
      onComplete={() => {
        clearPendingAssessment();
        navigate('/dashboard', { replace: true });
      }}
    />
  );
};

export default InitialAssessment;
