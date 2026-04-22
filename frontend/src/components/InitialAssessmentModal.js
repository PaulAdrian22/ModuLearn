import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { resolveCorrectAnswerText, shuffleQuestionChoicesList } from '../utils/assessmentShuffle';
import { normalizePreferredLanguage } from '../utils/languagePreference';

const SKILL_PROGRESS_COLORS = {
  Memorization: '#F39C12',
  'Analytical Thinking': '#2BC4B3',
  'Critical Thinking': '#87CEEB',
  'Problem Solving': '#FF6B6B',
  'Technical Comprehension': '#9B59B6',
};

const DEFAULT_SKILL_PROGRESS_COLOR = '#4DD0E1';
const OVERALL_BASELINE_GRADIENT = 'linear-gradient(90deg, #9EDAF3 0%, #4DD0E1 100%)';

const InitialAssessmentModal = ({
  questions = [],
  language = 'English',
  standalone = false,
  onComplete,
}) => {
  const normalizedLanguage = normalizePreferredLanguage(language || 'English');
  const isTaglish = normalizedLanguage === 'Taglish';

  const copy = useMemo(
    () => ({
      title: isTaglish ? 'Initial Assessment' : 'Initial Assessment',
      subtitle: isTaglish
        ? '35-item baseline check ito para ma-personalize ang learning path mo. Kasama ito sa initial mastery calculation pero hindi ka agad mamamarkahang mastered.'
        : 'This 35-item baseline check personalizes your learning path. It is included in your initial mastery calculation without immediately marking skills as mastered.',
      questionLabel: isTaglish ? 'Tanong' : 'Question',
      helper: isTaglish
        ? 'Sagutin base sa alam mo ngayon. Walang pressure, para sa tamang pacing lang ito.'
        : 'Answer based on what you currently know. No pressure, this is for proper pacing only.',
      completeTitle: isTaglish ? 'Assessment Complete!' : 'Assessment Complete!',
      summaryLabel: isTaglish ? 'Tama mong sagot' : 'Correct answers',
      timeSpent: isTaglish ? 'Oras na nagamit' : 'Time spent',
      masteryMessageLabel: isTaglish ? 'Update' : 'Update',
      masterySummaryTitle: isTaglish ? 'Initial Mastery Baseline' : 'Initial Mastery Baseline',
      masterySummarySubtitle: isTaglish
        ? 'Ito ang computed baseline per skill mula sa initial assessment mo.'
        : 'These are the computed per-skill baseline values from your initial assessment.',
      overallProgressLabel: isTaglish ? 'Overall baseline progress' : 'Overall baseline progress',
      initialLevelLabel: isTaglish ? 'Initial L' : 'Initial L',
      weightedInitialLabel: isTaglish ? 'Weighted Baseline' : 'Weighted Baseline',
      continueButton: isTaglish ? 'Continue sa Dashboard' : 'Continue to Dashboard',
      nextAria: isTaglish ? 'Next question' : 'Next question',
      loadingSubmit: isTaglish ? 'Sinisave ang results...' : 'Saving results...',
      saveError: isTaglish
        ? 'Hindi naisave ang assessment. Paki-try ulit.'
        : 'Assessment could not be saved. Please try again.',
    }),
    [isTaglish]
  );

  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [questionTimes, setQuestionTimes] = useState({});
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [assessmentQuestions, setAssessmentQuestions] = useState(() => shuffleQuestionChoicesList(questions));
  const [showResults, setShowResults] = useState(false);
  const [score, setScore] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [masterySkills, setMasterySkills] = useState([]);
  const [assessmentMessage, setAssessmentMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [animatedOverallProgress, setAnimatedOverallProgress] = useState(0);
  const [animatedSkillWidths, setAnimatedSkillWidths] = useState({});

  useEffect(() => {
    setAssessmentQuestions(shuffleQuestionChoicesList(questions));
    setCurrentQuestion(0);
    setSelectedAnswers({});
    setQuestionTimes({});
    setShowResults(false);
    setScore(0);
    setElapsedTime(0);
    setMasterySkills([]);
    setAssessmentMessage('');
    setSubmitError('');
  }, [questions]);

  useEffect(() => {
    if (showResults || assessmentQuestions.length === 0) return;
    setQuestionStartTime(Date.now());
  }, [showResults, currentQuestion, assessmentQuestions.length]);

  const toNumberOrNull = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };

  const skillBreakdown = useMemo(() => {
    return masterySkills
      .map((skill) => {
        const initialL = toNumberOrNull(skill?.initialL);
        const wmInitial = toNumberOrNull(skill?.wmInitial);
        const remainingL = toNumberOrNull(skill?.remainingL);

        if (initialL === null) {
          return null;
        }

        return {
          skillName: String(skill?.skillName || 'Skill'),
          initialL,
          wmInitial,
          remainingL,
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.skillName.localeCompare(right.skillName));
  }, [masterySkills]);

  useEffect(() => {
    if (!showResults) {
      setAnimatedOverallProgress(0);
      setAnimatedSkillWidths({});
      return;
    }

    const targetOverall = Math.max(0, Math.min(100, Number(score || 0)));

    if (typeof window === 'undefined') {
      setAnimatedOverallProgress(targetOverall);
      const immediateSkillWidths = skillBreakdown.reduce((accumulator, skill) => {
        accumulator[skill.skillName] = Math.max(0, Math.min(100, skill.initialL * 100));
        return accumulator;
      }, {});
      setAnimatedSkillWidths(immediateSkillWidths);
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      setAnimatedOverallProgress(targetOverall);
    });

    const timers = skillBreakdown.map((skill, index) => {
      return window.setTimeout(() => {
        setAnimatedSkillWidths((previous) => ({
          ...previous,
          [skill.skillName]: Math.max(0, Math.min(100, skill.initialL * 100)),
        }));
      }, 240 + index * 180);
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      timers.forEach((timerId) => window.clearTimeout(timerId));
    };
  }, [score, showResults, skillBreakdown]);

  const formatTime = (seconds) => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = safeSeconds % 60;
    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
  };

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

  const handleAnswerSelect = (answer) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [currentQuestion]: answer,
    }));
  };

  const handleNext = () => {
    const updatedQuestionTimes = updateCurrentQuestionTime();
    setQuestionTimes(updatedQuestionTimes);

    if (currentQuestion < assessmentQuestions.length - 1) {
      setCurrentQuestion((prev) => prev + 1);
      return;
    }

    handleSubmit(updatedQuestionTimes);
  };

  const notifyAchievementRefresh = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('achievementMetricsUpdated'));
    }
  };

  const handleSubmit = async (finalQuestionTimes) => {
    const updatedQuestionTimes = finalQuestionTimes || updateCurrentQuestionTime();
    setQuestionTimes(updatedQuestionTimes);
    setSubmitting(true);
    setSubmitError('');

    let correctAnswers = 0;
    const mappedAnswers = assessmentQuestions.map((question, index) => {
      const selectedAnswer = selectedAnswers[index];
      const correctAnswerText = resolveCorrectAnswerText(question);
      const isCorrect = selectedAnswer === correctAnswerText;
      if (isCorrect) {
        correctAnswers += 1;
      }

      return {
        skill: question.skill || question.skillTag || 'Memorization',
        isCorrect,
        responseTime: updatedQuestionTimes[index] || 0,
        questionType: 'Situational',
      };
    });

    const totalTimeSpent = Object.values(updatedQuestionTimes).reduce(
      (sum, value) => sum + Number(value || 0),
      0
    );

    const finalScore = assessmentQuestions.length > 0
      ? (correctAnswers / assessmentQuestions.length) * 100
      : 0;

    try {
      const response = await axios.post('/bkt/batch-update', {
        answers: mappedAnswers,
        assessmentType: 'Initial',
        moduleId: null,
        timeSpentSeconds: totalTimeSpent,
      });

      const returnedSkills = Array.isArray(response?.data?.skills)
        ? response.data.skills
        : [];

      setScore(finalScore);
      setElapsedTime(totalTimeSpent);
      setMasterySkills(returnedSkills);
      setAssessmentMessage(String(response?.data?.message || ''));
      setShowResults(true);
      notifyAchievementRefresh();
    } catch (error) {
      console.error('Error saving initial assessment:', error);
      setSubmitError(copy.saveError);
    } finally {
      setSubmitting(false);
    }
  };

  const currentQ = assessmentQuestions[currentQuestion];

  if (showResults) {
    const correctCount = Math.round((score / 100) * assessmentQuestions.length);

    return (
      <div className={standalone ? 'min-h-screen bg-gradient-to-br from-[#d9f5f1] via-[#eef8ff] to-[#d3ecfb]' : 'fixed inset-0 bg-black/45 backdrop-blur-sm z-[10000] overflow-hidden'}>
        <div className={standalone ? 'w-full max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10' : 'h-full w-full p-3 sm:p-6 flex items-center justify-center'}>
          <div className={`w-full rounded-2xl bg-white shadow-2xl border border-gray-200 flex flex-col overflow-hidden ${standalone ? '' : 'max-w-3xl max-h-full'}`}>
            <div className="bg-[#284C71] px-6 py-4 text-white rounded-t-2xl">
              <h2 className="text-2xl font-bold">{copy.completeTitle}</h2>
            </div>

            <div className="px-5 sm:px-6 py-6 text-center overflow-y-auto min-h-0">
              <div className="mb-6">
                <div className="w-24 h-24 bg-gradient-to-br from-[#42C5B6] to-[#37A89C] rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-5xl font-bold text-[#2F8F86]">{score.toFixed(0)}%</p>
              </div>

              <div className="w-full max-w-md mx-auto mb-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#2a597d] mb-2">{copy.overallProgressLabel}</p>
                <div className="h-3 rounded-full bg-[#dceaf4] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-[width] duration-[1400ms] ease-out"
                    style={{
                      width: `${Math.max(0, Math.min(100, animatedOverallProgress))}%`,
                      background: OVERALL_BASELINE_GRADIENT,
                    }}
                  ></div>
                </div>
              </div>

              <p className="text-lg text-gray-700 mb-2">
                {copy.summaryLabel}: <span className="font-semibold">{correctCount} / {assessmentQuestions.length}</span>
              </p>
              <p className="text-sm text-gray-500 mb-4">
                {copy.timeSpent}: {formatTime(elapsedTime)}
              </p>

              {assessmentMessage && (
                <p className="text-sm text-[#284C71] bg-[#e8f6f4] border border-[#b8ebe4] rounded-lg px-3 py-2 mb-5">
                  <span className="font-semibold">{copy.masteryMessageLabel}: </span>
                  {assessmentMessage}
                </p>
              )}

              {skillBreakdown.length > 0 && (
                <div className="text-left border border-gray-200 rounded-xl px-4 py-4 mb-6 bg-gray-50">
                  <h3 className="text-base sm:text-lg font-bold text-[#284C71]">{copy.masterySummaryTitle}</h3>
                  <p className="text-xs sm:text-sm text-gray-600 mt-1 mb-3">{copy.masterySummarySubtitle}</p>

                  <div className="space-y-3">
                    {skillBreakdown.map((skill) => {
                      const animatedWidth = Math.max(
                        0,
                        Math.min(100, Number(animatedSkillWidths[skill.skillName] || 0))
                      );
                      const skillBarColor = SKILL_PROGRESS_COLORS[skill.skillName] || DEFAULT_SKILL_PROGRESS_COLOR;

                      return (
                        <div key={skill.skillName} className="rounded-lg border border-gray-200 bg-white px-3 py-3">
                          <p className="text-sm font-semibold text-[#173F65] mb-2 flex items-center justify-between gap-3">
                            <span>{skill.skillName}</span>
                            <span className="text-xs font-bold" style={{ color: skillBarColor }}>
                              {animatedWidth.toFixed(1)}%
                            </span>
                          </p>
                          <div className="h-2 rounded-full bg-[#dceaf4] overflow-hidden mb-2">
                            <div
                              className="h-full rounded-full transition-[width] duration-1000 ease-out"
                              style={{
                                width: `${animatedWidth}%`,
                                backgroundColor: skillBarColor,
                                boxShadow: `0 0 8px ${skillBarColor}55`,
                              }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <button
                onClick={() => onComplete?.({
                  score,
                  totalQuestions: assessmentQuestions.length,
                  elapsedTime,
                  masterySkills: skillBreakdown,
                })}
                className="px-8 py-3 bg-[#42C5B6] hover:bg-[#37A89C] text-white rounded-full text-lg font-semibold shadow-lg transition-all hover:scale-105"
              >
                {copy.continueButton}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!assessmentQuestions.length) {
    return null;
  }

  const currentProgress = assessmentQuestions.length > 0
    ? Math.round(((currentQuestion + 1) / assessmentQuestions.length) * 100)
    : 0;

  return (
    <div className={standalone ? 'min-h-screen bg-gradient-to-br from-[#d9f5f1] via-[#eef8ff] to-[#d3ecfb]' : 'fixed inset-0 bg-black/45 backdrop-blur-sm z-[10000] overflow-hidden'}>
      <div className={standalone ? 'w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10' : 'h-full w-full p-3 sm:p-6 flex items-center justify-center'}>
        <div className={`w-full rounded-2xl bg-white shadow-2xl border border-gray-200 flex flex-col overflow-hidden ${standalone ? '' : 'max-w-5xl max-h-full'}`}>
          <div className="bg-[#284C71] px-6 py-4 text-white rounded-t-2xl">
            <h2 className="text-2xl font-bold">{copy.title}</h2>
            <p className="text-sm text-white/85 mt-1">{copy.subtitle}</p>
          </div>

          <div className="px-5 sm:px-10 py-6 overflow-y-auto min-h-0">
            <div className="text-center mb-6">
              <p className="text-base sm:text-lg font-bold text-gray-800">{copy.helper}</p>
            </div>

            <div className="mb-6 text-right">
              <p className="text-sm uppercase tracking-wide text-gray-500">{copy.questionLabel}</p>
              <p className="text-xl font-bold text-[#284C71]">
                {currentQuestion + 1} / {assessmentQuestions.length}
              </p>
              <div className="mt-2 h-2 rounded-full bg-[#dceaf4] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#2FCAB8] to-[#1fa997] transition-all duration-500"
                  style={{ width: `${currentProgress}%` }}
                ></div>
              </div>
            </div>

            <div className="mb-4">
              <div className="bg-[#284C71] text-white px-4 sm:px-6 py-4 rounded-lg mb-5 text-center">
                <h3 className="text-lg sm:text-xl font-bold break-words">
                  {currentQuestion + 1}. {currentQ.question}
                </h3>
              </div>

              <div className="space-y-2">
                {(Array.isArray(currentQ.options) ? currentQ.options : [])
                  .filter((option) => String(option || '').trim() !== '')
                  .map((option, index) => {
                    const letters = ['a', 'b', 'c', 'd'];
                    const isSelected = selectedAnswers[currentQuestion] === option;

                    return (
                      <button
                        key={`${currentQuestion}-${index}`}
                        onClick={() => handleAnswerSelect(option)}
                        className={`w-full text-left px-4 sm:px-5 py-3.5 border-l-4 transition-all text-sm sm:text-base ${
                          isSelected
                            ? 'border-l-[#2FCAB8] bg-[#2FCAB8]/20 font-medium'
                            : 'border-l-gray-200 bg-gray-50 hover:bg-gray-100'
                        }`}
                      >
                        {letters[index]}. {option}
                      </button>
                    );
                  })}
              </div>
            </div>

            {submitError && (
              <p className="text-sm text-red-600 mb-1 text-center">{submitError}</p>
            )}
          </div>

          <div className="px-5 sm:px-10 py-4 border-t border-gray-200 flex justify-end">
            <button
              onClick={handleNext}
              disabled={!selectedAnswers[currentQuestion] || submitting}
              className="w-14 h-14 bg-[#42C5B6] hover:bg-[#37A89C] disabled:bg-gray-300 disabled:cursor-not-allowed rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105"
              aria-label={copy.nextAria}
              title={submitting ? copy.loadingSubmit : copy.nextAria}
            >
              {submitting ? (
                <svg className="w-6 h-6 text-white animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle cx="12" cy="12" r="9" strokeWidth="3" strokeOpacity="0.35" />
                  <path d="M21 12a9 9 0 00-9-9" strokeWidth="3" strokeLinecap="round" />
                </svg>
              ) : (
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InitialAssessmentModal;
