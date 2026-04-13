import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../App';
import SkillMasteryResults from '../components/SkillMasteryResults';
import { resolveCorrectAnswerText, shuffleArray, shuffleQuestionChoicesList } from '../utils/assessmentShuffle';
import { withPreferredLanguage } from '../utils/languagePreference';

const FINAL_TOTAL_QUESTIONS = 45;
const RETAKE_FINAL_EASY_TARGET = Math.ceil(FINAL_TOTAL_QUESTIONS / 2);
const RETAKE_REVIEW_EASY_TARGET = FINAL_TOTAL_QUESTIONS - RETAKE_FINAL_EASY_TARGET;

const normalizeAssessmentQuestionType = (value = '', fallback = 'Easy') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'situational') return 'Situational';
  if (normalized === 'easy') return 'Easy';
  return fallback;
};

const getQuestionSkillTag = (question = {}) => {
  const skill = String(question?.skill || question?.skillTag || 'No Skill').trim();
  return skill || 'No Skill';
};

const getQuestionKey = (question = {}, source = 'final', index = 0) => {
  if (question?.__questionKey) return question.__questionKey;
  if (question?.id !== undefined && question?.id !== null) return `${source}:id:${question.id}`;

  const normalizedQuestion = String(question?.question || question?.questionText || '')
    .trim()
    .toLowerCase();
  const normalizedSkill = getQuestionSkillTag(question).toLowerCase();
  const normalizedAnswer = resolveCorrectAnswerText(question).trim().toLowerCase();
  return `${source}:text:${normalizedQuestion}|skill:${normalizedSkill}|answer:${normalizedAnswer}|idx:${index}`;
};

const applyFinalTimingRule = (responseTime, questionType, isCorrect) => {
  const safeResponseTime = Math.max(0, Number(responseTime || 0));
  const normalizedType = normalizeAssessmentQuestionType(questionType, 'Easy');

  if (normalizedType === 'Situational') {
    return !(safeResponseTime < 120 && isCorrect);
  }

  return !(safeResponseTime < 60 && isCorrect);
};

const FinalAssessment = () => {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [module, setModule] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [showResults, setShowResults] = useState(false);
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [skillResults, setSkillResults] = useState(null);
  const [questionStartTime, setQuestionStartTime] = useState(null);
  const [questionTimes, setQuestionTimes] = useState({});
  const [elapsedTime, setElapsedTime] = useState(0);
  const [examStarted, setExamStarted] = useState(false);
  const [attemptHistory, setAttemptHistory] = useState(null);
  const [assessmentMode, setAssessmentMode] = useState('first-take');
  const [questionMix, setQuestionMix] = useState({
    situationalFinal: 0,
    easyFinal: 0,
    easyReview: 0,
    mandatoryRetake: 0,
    total: 0,
  });

  const retakeRulesStorageKey = user?.userId
    ? `final_retake_rules_u${user.userId}_m${moduleId}`
    : null;

  const readLatestRetakeRules = () => {
    if (!retakeRulesStorageKey) return [];

    try {
      const raw = localStorage.getItem(retakeRulesStorageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return [];
      if (!Array.isArray(parsed.latestRules)) return [];
      return parsed.latestRules;
    } catch (error) {
      console.warn('Failed to parse final retake rules:', error);
      return [];
    }
  };

  const persistRetakeRules = (latestRules = [], summary = {}) => {
    if (!retakeRulesStorageKey) return;

    try {
      const raw = localStorage.getItem(retakeRulesStorageKey);
      let history = [];

      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.history)) {
          history = parsed.history;
        }
      }

      const nextEntry = {
        savedAt: new Date().toISOString(),
        score: Number(summary?.score || 0),
        totalQuestions: Number(summary?.totalQuestions || 0),
        totalCorrect: Number(summary?.totalCorrect || 0),
        rules: latestRules,
      };

      const nextPayload = {
        latestRules,
        history: [...history, nextEntry].slice(-10),
      };

      localStorage.setItem(retakeRulesStorageKey, JSON.stringify(nextPayload));
    } catch (error) {
      console.warn('Failed to persist final retake rules:', error);
    }
  };

  const extractInlineReviewQuestions = (sections = []) => {
    if (!Array.isArray(sections)) return [];

    return sections.reduce((allQuestions, section) => {
      const sectionType = String(section?.type || '').toLowerCase().trim();
      if (sectionType !== 'review-multiple-choice' && sectionType !== 'review - multiple choice') {
        return allQuestions;
      }

      const questionsInSection = Array.isArray(section?.questions) ? section.questions : [];
      return [...allQuestions, ...questionsInSection];
    }, []);
  };

  const buildFinalQuestionSet = (moduleData, attemptsCount = 0) => {
    const rawFinalQuestions = Array.isArray(moduleData?.finalQuestions) ? moduleData.finalQuestions : [];
    const rawReviewQuestions = Array.isArray(moduleData?.reviewQuestions) ? moduleData.reviewQuestions : [];
    const inlineReviewQuestions = extractInlineReviewQuestions(moduleData?.sections || []);

    const decoratedFinal = rawFinalQuestions.map((question, index) => ({
      ...question,
      sourceAssessment: 'final',
      questionType: normalizeAssessmentQuestionType(question?.questionType || question?.type || 'Situational', 'Situational'),
      __questionKey: getQuestionKey(question, 'final', index),
      skill: getQuestionSkillTag(question),
    }));

    const decoratedReview = [...rawReviewQuestions, ...inlineReviewQuestions].map((question, index) => ({
      ...question,
      sourceAssessment: 'review',
      questionType: normalizeAssessmentQuestionType(question?.questionType || question?.type || 'Easy', 'Easy'),
      __questionKey: getQuestionKey(question, 'review', index),
      skill: getQuestionSkillTag(question),
    }));

    const situationalFinalPool = decoratedFinal.filter((question) => question.questionType === 'Situational');
    const situationalReviewPool = decoratedReview.filter((question) => question.questionType === 'Situational');
    const easyFinalPool = decoratedFinal.filter((question) => question.questionType === 'Easy');
    const easyReviewPool = decoratedReview.filter((question) => question.questionType === 'Easy');

    if (attemptsCount <= 0) {
      const selectedKeys = new Set();
      const selectedQuestions = [];

      const addFromPool = (pool = [], limit = FINAL_TOTAL_QUESTIONS) => {
        const shuffledPool = shuffleArray(pool);
        shuffledPool.forEach((question) => {
          if (selectedQuestions.length >= limit) return;
          if (selectedKeys.has(question.__questionKey)) return;
          selectedKeys.add(question.__questionKey);
          selectedQuestions.push(question);
        });
      };

      // First take: prioritize situational-only coverage up to FINAL_TOTAL_QUESTIONS items.
      addFromPool(situationalFinalPool, FINAL_TOTAL_QUESTIONS);
      if (selectedQuestions.length < FINAL_TOTAL_QUESTIONS) {
        addFromPool(situationalReviewPool, FINAL_TOTAL_QUESTIONS);
      }

      return {
        mode: 'first-take',
        selectedQuestions: selectedQuestions.slice(0, FINAL_TOTAL_QUESTIONS),
        mix: {
          situationalFinal: selectedQuestions.filter(
            (question) => question.sourceAssessment === 'final' && question.questionType === 'Situational'
          ).length,
          easyFinal: selectedQuestions.filter(
            (question) => question.sourceAssessment === 'final' && question.questionType === 'Easy'
          ).length,
          easyReview: selectedQuestions.filter(
            (question) => question.sourceAssessment === 'review' && question.questionType === 'Easy'
          ).length,
          mandatoryRetake: 0,
          total: selectedQuestions.length,
        },
      };
    }

    const latestRetakeRules = readLatestRetakeRules();
    const mandatoryRules = latestRetakeRules.filter((rule) => rule?.needToAnswerAgain);
    const selectedKeys = new Set();
    const selectedFinal = [];
    const selectedReview = [];

    const addToBucket = (question, preferredBucket = question?.sourceAssessment || 'final') => {
      if (!question || selectedKeys.has(question.__questionKey)) return false;

      if (preferredBucket === 'final' && selectedFinal.length < RETAKE_FINAL_EASY_TARGET) {
        selectedFinal.push(question);
        selectedKeys.add(question.__questionKey);
        return true;
      }

      if (preferredBucket === 'review' && selectedReview.length < RETAKE_REVIEW_EASY_TARGET) {
        selectedReview.push(question);
        selectedKeys.add(question.__questionKey);
        return true;
      }

      if (selectedFinal.length < RETAKE_FINAL_EASY_TARGET) {
        selectedFinal.push(question);
        selectedKeys.add(question.__questionKey);
        return true;
      }

      if (selectedReview.length < RETAKE_REVIEW_EASY_TARGET) {
        selectedReview.push(question);
        selectedKeys.add(question.__questionKey);
        return true;
      }

      return false;
    };

    const findFromPoolByKey = (pool, questionKey) => pool.find((question) => question.__questionKey === questionKey);

    const findEasyBySkill = (skillName = '', preferredBucket = 'final') => {
      const normalizedSkill = String(skillName || '').trim().toLowerCase();
      const finalSkillMatch = easyFinalPool.find(
        (question) => !selectedKeys.has(question.__questionKey) && String(question.skill || '').trim().toLowerCase() === normalizedSkill
      );
      const reviewSkillMatch = easyReviewPool.find(
        (question) => !selectedKeys.has(question.__questionKey) && String(question.skill || '').trim().toLowerCase() === normalizedSkill
      );

      if (preferredBucket === 'final') {
        return finalSkillMatch || reviewSkillMatch || null;
      }

      return reviewSkillMatch || finalSkillMatch || null;
    };

    mandatoryRules.forEach((rule) => {
      const ruleQuestionType = normalizeAssessmentQuestionType(rule?.questionType || 'Easy', 'Easy');
      const preferredBucket = rule?.sourceAssessment === 'review' ? 'review' : 'final';

      let matchedQuestion = findFromPoolByKey(easyFinalPool, rule?.questionKey) || findFromPoolByKey(easyReviewPool, rule?.questionKey);

      // Situational items from previous attempts map to same-skill easy replacements on retake.
      if (!matchedQuestion && ruleQuestionType === 'Situational') {
        matchedQuestion = findEasyBySkill(rule?.skill, preferredBucket);
      }

      if (!matchedQuestion) {
        matchedQuestion = findEasyBySkill(rule?.skill, preferredBucket);
      }

      addToBucket(matchedQuestion, preferredBucket);
    });

    shuffleArray(easyFinalPool).forEach((question) => {
      if (selectedFinal.length >= RETAKE_FINAL_EASY_TARGET) return;
      addToBucket(question, 'final');
    });

    shuffleArray(easyReviewPool).forEach((question) => {
      if (selectedReview.length >= RETAKE_REVIEW_EASY_TARGET) return;
      addToBucket(question, 'review');
    });

    // If one pool is short, borrow from the other easy pool to maintain a full retake.
    if (selectedFinal.length < RETAKE_FINAL_EASY_TARGET) {
      shuffleArray(easyReviewPool).forEach((question) => {
        if (selectedFinal.length >= RETAKE_FINAL_EASY_TARGET) return;
        addToBucket(question, 'final');
      });
    }

    if (selectedReview.length < RETAKE_REVIEW_EASY_TARGET) {
      shuffleArray(easyFinalPool).forEach((question) => {
        if (selectedReview.length >= RETAKE_REVIEW_EASY_TARGET) return;
        addToBucket(question, 'review');
      });
    }

    const selectedQuestions = shuffleArray([
      ...selectedFinal,
      ...selectedReview,
    ]).slice(0, FINAL_TOTAL_QUESTIONS);

    return {
      mode: 'retake',
      selectedQuestions,
      mix: {
        situationalFinal: selectedQuestions.filter(
          (question) => question.sourceAssessment === 'final' && question.questionType === 'Situational'
        ).length,
        easyFinal: selectedQuestions.filter(
          (question) => question.sourceAssessment === 'final' && question.questionType === 'Easy'
        ).length,
        easyReview: selectedQuestions.filter(
          (question) => question.sourceAssessment === 'review' && question.questionType === 'Easy'
        ).length,
        mandatoryRetake: mandatoryRules.length,
        total: selectedQuestions.length,
      },
    };
  };

  const toPlainText = (value) => {
    if (!value) return '';
    const textarea = document.createElement('textarea');
    textarea.innerHTML = String(value);
    const decoded = textarea.value;
    return decoded.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  };

  const formatTime = (seconds) => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(safeSeconds / 60);
    const secs = safeSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Check if coming from review - redirect to module if so
  useEffect(() => {
    const isReview = searchParams.get('review');
    if (isReview) {
      navigate(`/module/${moduleId}`, { replace: true });
    }
  }, [searchParams, moduleId, navigate]);

  useEffect(() => {
    checkAccessAndFetchModule();
  }, [moduleId, navigate]);

  // Track when a new question is shown for response-time analytics.
  useEffect(() => {
    if (!examStarted || showResults || loading || questions.length === 0) return;
    setQuestionStartTime(Date.now());
  }, [currentQuestion, examStarted, showResults, loading, questions.length]);

  const updateCurrentQuestionTime = (existingTimes = questionTimes) => {
    const accumulated = existingTimes[currentQuestion] || 0;
    const additional = questionStartTime
      ? Math.max(0, Math.floor((Date.now() - questionStartTime) / 1000))
      : 0;

    return {
      ...existingTimes,
      [currentQuestion]: accumulated + additional,
    };
  };

  const checkAccessAndFetchModule = async () => {
    try {
      setLoading(true);
      const response = await axios.get(withPreferredLanguage(`/modules/${moduleId}?userId=${user.userId}`));
      setModule(response.data);
      
      // Check if module has diagnostic questions
      const hasDiagnosticQuestions = response.data.diagnosticQuestions && response.data.diagnosticQuestions.length > 0;
      
      // If module has diagnostic questions, check if they've been completed
      if (hasDiagnosticQuestions) {
        const diagnosticKey = `diagnostic_completed_${moduleId}`;
        const hasCompletedDiagnostic = localStorage.getItem(diagnosticKey);
        
        if (!hasCompletedDiagnostic) {
          // Redirect to module view to complete diagnostic first
          navigate(`/module/${moduleId}`, { replace: true });
          return;
        }
      }
      
      // Check if lesson content has been viewed
      const lessonViewedKey = `lesson_viewed_${moduleId}`;
      const hasViewedLesson = localStorage.getItem(lessonViewedKey);
      
      // If lesson has sections and hasn't been viewed, redirect to lesson
      if (response.data.sections && response.data.sections.length > 0 && !hasViewedLesson) {
        navigate(`/module/${moduleId}`, { replace: true });
        return;
      }
      
      // Fetch attempt history
      let totalAttempts = 0;
      try {
        const historyRes = await axios.get(`/bkt/lesson/${moduleId}/final/history`);
        setAttemptHistory(historyRes.data);
        totalAttempts = Number(historyRes.data?.totalAttempts || 0);
      } catch (histErr) {
        console.error('Error fetching attempt history:', histErr);
      }

      const finalQuestionSet = buildFinalQuestionSet(response.data, totalAttempts);
      setAssessmentMode(finalQuestionSet.mode);
      setQuestionMix(finalQuestionSet.mix);
      setQuestions(shuffleQuestionChoicesList(finalQuestionSet.selectedQuestions));
      
      setLoading(false);
    } catch (err) {
      console.error('Error fetching module:', err);
      setLoading(false);
    }
  };

  const handleAnswerSelect = (answer) => {
    setSelectedAnswers({
      ...selectedAnswers,
      [currentQuestion]: answer
    });
  };

  const handleStartExam = () => {
    const now = Date.now();
    setQuestions((previousQuestions) => shuffleQuestionChoicesList(previousQuestions));
    setCurrentQuestion(0);
    setSelectedAnswers({});
    setQuestionStartTime(now);
    setQuestionTimes({});
    setExamStarted(true);
  };

  const handleNext = () => {
    const updatedQuestionTimes = updateCurrentQuestionTime();
    setQuestionTimes(updatedQuestionTimes);

    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      handleSubmit(updatedQuestionTimes);
    }
  };

  const handleSubmit = async (finalQuestionTimes) => {
    const updatedQuestionTimes = finalQuestionTimes || updateCurrentQuestionTime();
    setQuestionTimes(updatedQuestionTimes);

    let correct = 0;
    const answers = [];
    const retakeRuleSnapshot = [];
    questions.forEach((q, index) => {
      const isCorrect = selectedAnswers[index] === resolveCorrectAnswerText(q);
      const responseTime = updatedQuestionTimes[index] || 0;
      const normalizedQuestionType = normalizeAssessmentQuestionType(
        q.questionType || q.type || (q.sourceAssessment === 'final' ? 'Situational' : 'Easy'),
        q.sourceAssessment === 'final' ? 'Situational' : 'Easy'
      );
      if (isCorrect) correct++;

      const needToAnswerAgain = applyFinalTimingRule(responseTime, normalizedQuestionType, isCorrect);
      retakeRuleSnapshot.push({
        questionKey: getQuestionKey(q, q.sourceAssessment || 'final', index),
        sourceAssessment: q.sourceAssessment || 'final',
        skill: getQuestionSkillTag(q),
        questionType: normalizedQuestionType,
        isCorrect,
        responseTime,
        needToAnswerAgain,
      });

      answers.push({
        skill: q.skill || 'Memorization',
        isCorrect,
        responseTime,
        questionType: normalizedQuestionType
      });
    });
    const finalScore = (correct / questions.length) * 100;
    setScore(finalScore);
    const totalTimeSpent = Object.values(updatedQuestionTimes).reduce(
      (total, seconds) => total + Number(seconds || 0),
      0
    );
    setElapsedTime(totalTimeSpent);
    setShowResults(true);

    persistRetakeRules(retakeRuleSnapshot, {
      score: finalScore,
      totalQuestions: questions.length,
      totalCorrect: correct,
    });

    // Batch update BKT skill mastery (exclude No Skill questions)
    try {
      const skillAnswers = answers.filter(a => a.skill !== 'No Skill');
      if (skillAnswers.length > 0) {
        const res = await axios.post('/bkt/batch-update', {
          answers: skillAnswers,
          assessmentType: 'Final',
          moduleId: parseInt(moduleId),
          timeSpentSeconds: totalTimeSpent
        });
        setSkillResults(res.data);
      }
    } catch (err) {
      console.error('Error updating skill mastery:', err);
    }

    // Update module completion
    updateModuleProgress(100);
  };

  const updateModuleProgress = async (completionRate) => {
    try {
      await axios.put('/progress/update', {
        moduleId: parseInt(moduleId),
        completionRate
      });
    } catch (err) {
      console.error('Error updating progress:', err);
    }
  };

  const currentQ = questions[currentQuestion];
  const correctAnswerCount = questions.reduce((total, question, index) => {
    return total + (selectedAnswers[index] === resolveCorrectAnswerText(question) ? 1 : 0);
  }, 0);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#F5F7FA] flex items-center justify-center">
        <div className="spinner"></div>
      </div>
    );
  }

  if (showResults) {
    return (
      <div className="fixed inset-0 bg-[#F5F7FA] z-50 overflow-hidden">
        <div className="bg-[#1e3a5f] text-white py-4 px-6">
          <h1 className="text-xl font-semibold">Final Assessment Score</h1>
        </div>

        <div className="min-h-[calc(100vh-64px)] py-8 px-8 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full mx-auto p-8 text-center my-auto">
            <div className="mb-8">
              <div className={`w-28 h-28 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg ${
                score >= 75 ? 'bg-[#2BC4B3]' : 'bg-[#EF5350]'
              }`}>
                {score >= 75 ? (
                  <svg className="w-14 h-14 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-14 h-14 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </div>
              
              <h2 className="text-3xl font-bold text-gray-800 mb-4">
                {score >= 75 ? 'Congratulations!' : 'Keep Learning!'}
              </h2>
              <p className="text-5xl font-bold text-[#2BC4B3] mb-4">{score.toFixed(0)}%</p>
              <div className="flex items-center justify-center gap-2 mb-4 text-gray-500">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-base">Time spent: {formatTime(elapsedTime)}</span>
              </div>
              <p className="text-lg text-gray-600">
                You answered {correctAnswerCount} out of {questions.length} questions correctly
              </p>
            </div>

            <p className="text-base text-gray-600 mb-8">
              {score >= 75 
                ? 'Excellent work! You have successfully completed this lesson.' 
                : 'You need at least 75% to pass. Review the lesson and try again.'}
            </p>

            {skillResults && skillResults.skills && skillResults.skills.length > 0 && (
              <SkillMasteryResults
                skills={skillResults.skills}
                masteryThreshold={skillResults.masteryThreshold}
              />
            )}

            <div className="flex gap-4 justify-center">
              <button
                onClick={() => navigate('/dashboard')}
                className="px-10 py-3 bg-[#2BC4B3] text-white rounded-full text-lg font-semibold shadow-lg"
              >
                Back to Dashboard
              </button>
              {score < 75 && (
                <button
                  onClick={() => navigate(`/module/${moduleId}?review=true`)}
                  className="px-10 py-3 bg-gray-400 text-white rounded-full text-lg font-semibold shadow-lg"
                >
                  Review Lesson
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#F5F7FA] z-50 overflow-hidden">
      {/* Header */}
      <div className="bg-[#1e3a5f] text-white py-4 px-6">
        <h1 className="text-xl font-semibold">
          Final Assessment for Lesson {module?.LessonOrder} : {toPlainText(module?.ModuleTitle)}
        </h1>
      </div>

      {!examStarted ? (
        /* Instruction Screen */
        <div className="flex items-center justify-center h-[calc(100vh-64px)] px-6 py-6 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full p-10">
            {/* Icon */}
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-[#1e3a5f] rounded-full flex items-center justify-center shadow-lg">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>

            <h2 className="text-2xl font-bold text-[#1e3a5f] text-center mb-2">Final Assessment</h2>
            <p className="text-gray-500 text-center mb-6">Lesson {module?.LessonOrder}: {toPlainText(module?.ModuleTitle)}</p>

            {/* Instruction */}
            <div className="bg-[#F5F7FA] border-l-4 border-[#1e3a5f] rounded-lg p-5 mb-6">
              <p className="text-sm font-bold text-[#1e3a5f] mb-1">Instructions</p>
              <p className="text-gray-700 leading-relaxed">
                {module?.finalInstruction || 'This final assessment affects your learning path progression. Read and answer each question carefully. Good luck!'}
              </p>
            </div>

            {/* Exam Info */}
            <div className="flex justify-center gap-6 mb-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-[#1e3a5f]">{questions.length}</p>
                <p className="text-xs text-gray-500">Questions</p>
              </div>
              <div className="border-l border-gray-200"></div>
              <div className="text-center">
                <p className="text-2xl font-bold text-[#1e3a5f]">Timing</p>
                <p className="text-xs text-gray-500">Tracked Passively</p>
              </div>
              <div className="border-l border-gray-200"></div>
              <div className="text-center">
                <p className="text-2xl font-bold text-[#1e3a5f]">75%</p>
                <p className="text-xs text-gray-500">Passing Score</p>
              </div>
            </div>

            <div className="mb-6 rounded-lg border border-[#BFE7E2] bg-[#F3FCFA] p-4">
              <p className="text-sm font-bold text-[#1e3a5f] mb-1">
                Mode: {assessmentMode === 'retake' ? 'Retake Final Assessment' : 'First Take Final Assessment'}
              </p>
              {assessmentMode === 'retake' ? (
                <p className="text-sm text-gray-700">
                  Question mix: {questionMix.easyFinal} easy final + {questionMix.easyReview} easy review
                  {questionMix.mandatoryRetake > 0 ? ` (${questionMix.mandatoryRetake} mandatory from previous attempt rules)` : ''}.
                </p>
              ) : (
                <p className="text-sm text-gray-700">
                  Question mix: {questionMix.total} situational items selected for first take.
                </p>
              )}
            </div>

            {/* Previous Records (if retake) */}
            {attemptHistory && attemptHistory.totalAttempts > 0 && (
              <div className="mb-6">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="font-bold text-amber-800">
                      Previous Records — Attempt {attemptHistory.totalAttempts + 1}
                    </p>
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {attemptHistory.attempts.map((attempt, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white rounded-lg px-4 py-2.5 border border-amber-100">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-gray-600">
                            Attempt {attempt.attemptNumber}
                          </span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            attempt.status === 'Pass' 
                              ? 'bg-green-100 text-green-700' 
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {attempt.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className={`text-lg font-bold ${
                            attempt.score >= 75 ? 'text-[#2BC4B3]' : 'text-red-500'
                          }`}>
                            {attempt.score.toFixed(0)}%
                          </span>
                          <span className="text-xs text-gray-400">
                            {new Date(attempt.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Proceed Button */}
            <button
              onClick={handleStartExam}
              className="w-full py-4 bg-[#2BC4B3] hover:bg-[#1e5a8e] text-white rounded-xl text-lg font-bold transition-all shadow-lg flex items-center justify-center gap-2"
            >
              Proceed to the Exam
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>

            {/* Back Button */}
            <button
              onClick={() => navigate(`/module/${moduleId}`)}
              className="w-full mt-3 py-3 text-gray-500 hover:text-[#1e3a5f] text-sm font-medium transition-all"
            >
              Go Back to Lesson
            </button>
          </div>
        </div>
      ) : (
      /* Exam Content */
      <div className="flex items-center justify-center h-[calc(100vh-64px)] px-6 py-6">
        <div className="bg-white rounded-xl shadow-lg max-w-4xl w-full p-10">

          <div className="flex justify-end items-center mb-6">
            <span className="text-xl text-[#1e3a5f]">
              <span className="font-bold">{currentQuestion + 1}</span> / {questions.length}
            </span>
          </div>

          {/* Question */}
          <div className="mb-6">
            <div className="bg-[#1e3a5f] text-white px-6 py-4 rounded-lg mb-5 text-center">
              <h3 className="text-xl font-bold">
                {currentQuestion + 1}.  {currentQ?.question}
              </h3>
            </div>

            {/* Answer Options - NEUTRAL COLORS */}
            <div className="space-y-2">
              {currentQ?.options.map((option, index) => {
                const letters = ['a', 'b', 'c', 'd'];
                const letter = letters[index];
                const isSelected = selectedAnswers[currentQuestion] === option;
                
                return (
                  <button
                    key={index}
                    onClick={() => handleAnswerSelect(option)}
                    className={`w-full text-left px-5 py-3.5 border-l-4 text-base ${
                      isSelected 
                        ? 'border-l-[#2BC4B3] bg-[#2BC4B3]/20 font-medium' 
                        : 'border-l-gray-200 bg-gray-50'
                    }`}
                  >
                    {letter}. {option}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Next Button */}
          <div className="flex justify-end">
            <button
              onClick={handleNext}
              disabled={!selectedAnswers[currentQuestion]}
              className="w-14 h-14 bg-[#2BC4B3] disabled:bg-gray-300 disabled:cursor-not-allowed rounded-full shadow-lg flex items-center justify-center"
            >
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};

export default FinalAssessment;
