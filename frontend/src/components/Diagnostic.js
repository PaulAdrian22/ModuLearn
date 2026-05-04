import React, { useState, useEffect } from 'react';
import { bktApi } from '../services/api';
import SkillMasteryResults from './SkillMasteryResults';
import { resolveCorrectAnswerText, shuffleQuestionChoicesList } from '../utils/assessmentShuffle';
import { getPreferredLanguage, normalizePreferredLanguage } from '../utils/languagePreference';

const Diagnostic = ({ questions, onComplete, onSkip, moduleId = null, onBack = null, preferredLanguage = null }) => {
  const selectedLanguage = normalizePreferredLanguage(
    preferredLanguage || getPreferredLanguage() || 'English'
  );
  const isTaglish = selectedLanguage === 'Taglish';
  const copy = {
    diagnostic: isTaglish ? 'Diagnostic' : 'Diagnostic',
    diagnosticScore: isTaglish ? 'Diagnostic Score' : 'Diagnostic Score',
    completed: isTaglish ? 'Assessment Complete!' : 'Assessment Complete!',
    timeSpent: isTaglish ? 'Oras na nagamit' : 'Time spent',
    answered: isTaglish
      ? 'Tama mong nasagot'
      : 'You answered',
    basedOnPerformance: isTaglish
      ? "Base sa performance mo, ipo-personalize namin ang learning experience mo!"
      : "Based on your performance, we'll personalize your learning experience!",
    continueToLesson: isTaglish ? 'Continue sa Lesson' : 'Continue to Lesson',
    back: isTaglish ? 'Back' : 'Back',
    skip: isTaglish ? 'Skip' : 'Skip',
    instruction: isTaglish
      ? "Sagutin ang mga tanong base sa alam mo. Huwag mag-alala sa score, gabay lang ito para mas maayos ang learning experience mo!"
      : "Answer these questions according to what you know. Don't worry about the score, this will only help you have a better learning experience!",
    questionLabel: isTaglish ? 'Tanong' : 'Question'
  };

  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [showResults, setShowResults] = useState(false);
  const [score, setScore] = useState(0);
  const [skillResults, setSkillResults] = useState(null);
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [questionTimes, setQuestionTimes] = useState({});
  const [elapsedTime, setElapsedTime] = useState(0);
  const [assessmentQuestions, setAssessmentQuestions] = useState(() => shuffleQuestionChoicesList(questions));

  const formatTime = (seconds) => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(safeSeconds / 60);
    const secs = safeSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    setAssessmentQuestions(shuffleQuestionChoicesList(questions));
    setCurrentQuestion(0);
    setSelectedAnswers({});
    setShowResults(false);
    setScore(0);
    setSkillResults(null);
    setQuestionTimes({});
    setElapsedTime(0);
  }, [questions]);

  useEffect(() => {
    if (showResults || assessmentQuestions.length === 0) return;
    setQuestionStartTime(Date.now());
  }, [currentQuestion, showResults, assessmentQuestions.length]);

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
    setSelectedAnswers({
      ...selectedAnswers,
      [currentQuestion]: answer
    });
  };

  const handleNext = () => {
    const updatedQuestionTimes = updateCurrentQuestionTime();
    setQuestionTimes(updatedQuestionTimes);

    if (currentQuestion < assessmentQuestions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      handleSubmit(updatedQuestionTimes);
    }
  };

  const handleSubmit = async (finalQuestionTimes) => {
    const updatedQuestionTimes = finalQuestionTimes || updateCurrentQuestionTime();
    setQuestionTimes(updatedQuestionTimes);

    // Calculate score
    let correct = 0;
    const answers = [];
    assessmentQuestions.forEach((q, index) => {
      const userAnswer = selectedAnswers[index];
      const correctAnswerText = resolveCorrectAnswerText(q);
      const isCorrect = userAnswer === correctAnswerText;
      if (isCorrect) correct++;
      answers.push({
        skill: q.skill || 'Memorization',
        isCorrect,
        responseTime: updatedQuestionTimes[index] || 0,
        questionType: q.questionType || q.type || 'Easy'
      });
    });
    const finalScore = assessmentQuestions.length > 0
      ? (correct / assessmentQuestions.length) * 100
      : 0;
    setScore(finalScore);
    const totalTimeSpent = Object.values(updatedQuestionTimes).reduce(
      (total, seconds) => total + Number(seconds || 0),
      0
    );
    setElapsedTime(totalTimeSpent);
    setShowResults(true);

    // Batch update BKT skill mastery (exclude No Skill questions)
    try {
      const skillAnswers = answers.filter(a => a.skill !== 'No Skill');
      if (skillAnswers.length > 0) {
        const res = await bktApi.batchUpdate({
          answers: skillAnswers,
          assessmentType: 'Diagnostic',
          moduleId: moduleId ?? null,
          timeSpentSeconds: totalTimeSpent,
        });
        setSkillResults(res);
      }
    } catch (err) {
      console.error('Error updating skill mastery:', err);
    }
  };

  const currentQ = assessmentQuestions[currentQuestion];
  const correctAnswerCount = assessmentQuestions.reduce((total, question, index) => {
    const userAnswer = selectedAnswers[index];
    const correctAnswerText = resolveCorrectAnswerText(question);
    return total + (userAnswer === correctAnswerText ? 1 : 0);
  }, 0);

  if (showResults) {
    return (
      <div className="fixed inset-0 bg-gray-100 z-50 overflow-y-auto">
        {/* Header */}
        <div className="bg-[#1e3a5f] text-white py-4 px-6 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="3" fill="currentColor"/>
              <circle cx="12" cy="4" r="2" fill="currentColor"/>
              <circle cx="12" cy="20" r="2" fill="currentColor"/>
              <circle cx="4" cy="12" r="2" fill="currentColor"/>
              <circle cx="20" cy="12" r="2" fill="currentColor"/>
              <line x1="12" y1="7" x2="12" y2="9" stroke="currentColor" strokeWidth="2"/>
              <line x1="12" y1="15" x2="12" y2="17" stroke="currentColor" strokeWidth="2"/>
              <line x1="7" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="2"/>
              <line x1="15" y1="12" x2="17" y2="12" stroke="currentColor" strokeWidth="2"/>
            </svg>
            <h1 className="text-2xl font-semibold">{copy.diagnosticScore}</h1>
          </div>
        </div>

        {/* Score Display */}
        <div className="py-8 px-8">
          <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full mx-auto p-8 text-center my-auto">
            <div className="mb-8">
              <div className="w-28 h-28 bg-gradient-to-br from-[#2BC4B3] to-[#1a9d8f] rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                <svg className="w-14 h-14 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              
              <h2 className="text-3xl font-bold text-gray-800 mb-4">{copy.completed}</h2>
              <p className="text-5xl font-bold text-[#2BC4B3] mb-4">{score.toFixed(0)}%</p>
              <div className="flex items-center justify-center gap-2 mb-4 text-gray-500">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-base">{copy.timeSpent}: {formatTime(elapsedTime)}</span>
              </div>
              <p className="text-lg text-gray-600">
                {copy.answered} {correctAnswerCount} / {assessmentQuestions.length}
              </p>
            </div>

            <p className="text-base text-gray-600 mb-8">
              {copy.basedOnPerformance}
            </p>

            {skillResults && skillResults.skills && skillResults.skills.length > 0 && (
              <SkillMasteryResults
                skills={skillResults.skills}
                masteryThreshold={skillResults.masteryThreshold}
              />
            )}

            <button
              onClick={() => onComplete(score)}
              className="px-10 py-3 bg-[#2BC4B3] hover:bg-[#1a9d8f] text-white rounded-full text-lg font-semibold shadow-lg transition-all hover:scale-105"
            >
              {copy.continueToLesson}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-100 z-50 overflow-hidden">
      {/* Header */}
      <div className="bg-[#1e3a5f] text-white py-4 px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="3" fill="currentColor"/>
              <circle cx="12" cy="4" r="2" fill="currentColor"/>
              <circle cx="12" cy="20" r="2" fill="currentColor"/>
              <circle cx="4" cy="12" r="2" fill="currentColor"/>
              <circle cx="20" cy="12" r="2" fill="currentColor"/>
              <line x1="12" y1="7" x2="12" y2="9" stroke="currentColor" strokeWidth="2"/>
              <line x1="12" y1="15" x2="12" y2="17" stroke="currentColor" strokeWidth="2"/>
              <line x1="7" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="2"/>
              <line x1="15" y1="12" x2="17" y2="12" stroke="currentColor" strokeWidth="2"/>
            </svg>
            <h1 className="text-2xl font-semibold">{copy.diagnostic}</h1>
          </div>
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="px-5 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all font-medium"
              >
                {copy.back}
              </button>
            )}
            {onSkip && (
              <button
                onClick={onSkip}
                className="px-5 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all font-medium"
              >
                {copy.skip}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex items-center justify-center h-[calc(100vh-64px)] px-6 py-6">
        <div className="bg-white rounded-xl shadow-lg max-w-4xl w-full p-10 border-2 border-dashed border-gray-300">
          {/* Instructions */}
          <div className="text-center mb-6">
            <p className="text-xl font-bold text-gray-800">
              {copy.instruction}
            </p>
          </div>

          <div className="mb-6 text-right">
            <p className="text-sm uppercase tracking-wide text-gray-500">{copy.questionLabel}</p>
            <p className="text-xl font-bold text-[#1e3a5f]">
              {currentQuestion + 1} / {assessmentQuestions.length}
            </p>
          </div>

          {/* Question */}
          <div className="mb-6">
            <div className="bg-[#1e3a5f] text-white px-6 py-4 rounded-lg mb-5 text-center">
              <h3 className="text-xl font-bold">
                {currentQuestion + 1}.  {currentQ.question}
              </h3>
            </div>

            {/* Answer Options - NEUTRAL COLORS */}
            <div className="space-y-2">
              {currentQ.options.map((option, index) => {
                const letters = ['a', 'b', 'c', 'd'];
                const letter = letters[index];
                const isSelected = selectedAnswers[currentQuestion] === option;
                
                return (
                  <button
                    key={index}
                    onClick={() => handleAnswerSelect(option)}
                    className={`w-full text-left px-5 py-3.5 border-l-4 transition-all text-base ${
                      isSelected 
                        ? 'border-l-[#2BC4B3] bg-[#2BC4B3]/20 font-medium' 
                        : 'border-l-gray-200 bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    {letter}. {option}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Next Button */}
          <div className="flex justify-end mt-6">
            <button
              onClick={handleNext}
              disabled={!selectedAnswers[currentQuestion]}
              className="w-14 h-14 bg-[#2BC4B3] hover:bg-[#1a9d8f] disabled:bg-gray-300 disabled:cursor-not-allowed rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105"
            >
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Diagnostic;
