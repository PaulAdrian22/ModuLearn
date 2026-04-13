import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../App';
import SkillMasteryResults from './SkillMasteryResults';
import {
  trackPerformance,
  getPerformance,
  shouldShowHints,
  getTutorialHints,
  questionVariations
} from '../services/adaptiveLearning';
import { resolveCorrectAnswerText, shuffleQuestionChoicesList } from '../utils/assessmentShuffle';

const QuickAssessment = ({ questions, onComplete, onCancel, topicTitle, moduleId, topicIndex }) => {
  const { user } = useAuth();
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [correctAnswers, setCorrectAnswers] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [score, setScore] = useState(0);
  const [cooldownEnd, setCooldownEnd] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [questionTimes, setQuestionTimes] = useState({});
  const [showHint, setShowHint] = useState(false);
  const [assessmentQuestions, setAssessmentQuestions] = useState(() => shuffleQuestionChoicesList(questions));
  const [performance, setPerformance] = useState({});
  const [skillResults, setSkillResults] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  const COOLDOWN_SECONDS = 30; // 30-second cooldown

  useEffect(() => {
    // Load performance data
    const perf = getPerformance(moduleId, topicIndex);
    setPerformance(perf);
    
    // Generate questions based on past performance
    const generatedQuestions = generateQuestionVariations(questions, perf);
    setAssessmentQuestions(shuffleQuestionChoicesList(generatedQuestions));
    
    // Check for existing cooldown
    const cooldownKey = `cooldown_${moduleId}_${topicIndex}`;
    const savedCooldown = localStorage.getItem(cooldownKey);
    
    if (savedCooldown) {
      const cooldownTime = new Date(savedCooldown);
      if (cooldownTime > new Date()) {
        setCooldownEnd(cooldownTime);
      } else {
        localStorage.removeItem(cooldownKey);
      }
    }
  }, [questions, topicTitle, moduleId, topicIndex]);

  // Generate question variations excluding correctly answered ones
  const generateQuestionVariations = (originalQuestions, perf) => {
    if (!perf.correctAnswers || perf.correctAnswers.length === 0) {
      return originalQuestions;
    }
    
    return originalQuestions.map((question, index) => {
      // If this question was answered correctly before, use variation
      if (perf.correctAnswers.includes(index)) {
        const variations = questionVariations[moduleId]?.[topicTitle];
        if (variations) {
          const variation = variations.find(v => v.original === question.question);
          if (variation && variation.variation) {
            return variation.variation;
          }
        }
      }
      return question;
    });
  };

  useEffect(() => {
    // Update retry cooldown timer
    if (cooldownEnd) {
      const timer = setInterval(() => {
        const now = new Date();
        const remaining = Math.max(0, Math.floor((cooldownEnd - now) / 1000));
        setTimeRemaining(remaining);
        
        if (remaining === 0) {
          setCooldownEnd(null);
          localStorage.removeItem(`cooldown_${moduleId}_${topicIndex}`);
        }
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [cooldownEnd, moduleId, topicIndex]);

  useEffect(() => {
    if (assessmentQuestions.length === 0) return;
    setQuestionStartTime(Date.now());
    setQuestionTimes({});
    setElapsedTime(0);
  }, [assessmentQuestions.length]);

  useEffect(() => {
    if (showResults || cooldownEnd || assessmentQuestions.length === 0) return;
    setQuestionStartTime(Date.now());
  }, [currentQuestion, showResults, cooldownEnd, assessmentQuestions.length]);

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
    }
  };

  const handlePrevious = () => {
    const updatedQuestionTimes = updateCurrentQuestionTime();
    setQuestionTimes(updatedQuestionTimes);

    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    }
  };

  const handleSubmit = async () => {
    const updatedQuestionTimes = updateCurrentQuestionTime();
    setQuestionTimes(updatedQuestionTimes);

    const timeSpent = Object.values(updatedQuestionTimes).reduce(
      (total, seconds) => total + Number(seconds || 0),
      0
    );
    
    // Calculate score and track correct answers
    let correct = 0;
    const correctIndices = [];
    assessmentQuestions.forEach((q, index) => {
      const correctAnswerText = resolveCorrectAnswerText(q);
      if (selectedAnswers[index] === correctAnswerText) {
        correct++;
        correctIndices.push(index);
      }
    });
    
    const finalScore = (correct / assessmentQuestions.length) * 100;
    setScore(finalScore);
    setCorrectAnswers(correctIndices);
    setElapsedTime(timeSpent);
    setShowResults(true);

    // Track performance for adaptive learning
    trackPerformance(moduleId, topicIndex, {
      score: finalScore,
      timeSpent,
      correctAnswers: correctIndices,
      difficulty: 'normal'
    });

    // Update BKT with batch skill update (exclude No Skill questions)
    try {
      const answers = assessmentQuestions.map((q, i) => ({
        skill: q.skill || 'Memorization',
        isCorrect: selectedAnswers[i] === resolveCorrectAnswerText(q),
        responseTime: updatedQuestionTimes[i] || 0,
        questionType: q.questionType || q.type || 'Easy'
      }));
      const skillAnswers = answers.filter(a => a.skill !== 'No Skill');
      if (skillAnswers.length > 0) {
        const numericModuleId = Number.parseInt(moduleId, 10);
        const res = await axios.post('/bkt/batch-update', {
          answers: skillAnswers,
          assessmentType: 'Review',
          moduleId: Number.isFinite(numericModuleId) ? numericModuleId : null,
          timeSpentSeconds: timeSpent
        });
        setSkillResults(res.data);
      }
    } catch (err) {
      console.error('Error updating BKT:', err);
    }
  };

  const handleRetry = () => {
    // Set cooldown
    const cooldownTime = new Date();
    cooldownTime.setSeconds(cooldownTime.getSeconds() + COOLDOWN_SECONDS);
    localStorage.setItem(`cooldown_${moduleId}_${topicIndex}`, cooldownTime.toISOString());
    setCooldownEnd(cooldownTime);
    
    // Regenerate questions with variations (excluding correctly answered ones)
    const newQuestions = generateQuestionVariations(questions, performance);
    setAssessmentQuestions(shuffleQuestionChoicesList(newQuestions));
    
    // Reset assessment state
    setCurrentQuestion(0);
    setSelectedAnswers({});
    setShowResults(false);
    setScore(0);
    setShowHint(false);
    setQuestionStartTime(Date.now());
    setQuestionTimes({});
    setElapsedTime(0);
  };

  const toggleHint = () => {
    setShowHint(!showHint);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (cooldownEnd && timeRemaining > 0) {
    return (
      <div className="card">
        <div className="text-center py-12">
          <div className="w-20 h-20 bg-warning/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          
          <h3 className="text-2xl font-bold mb-2">Assessment on Cooldown</h3>
          <p className="text-text-secondary mb-4">
            You need to wait before retrying this assessment.
          </p>
          
          <div className="text-4xl font-bold text-warning mb-2">
            {formatTime(timeRemaining)}
          </div>
          <p className="text-text-secondary text-sm">Time remaining</p>
          
          <button
            onClick={onCancel}
            className="btn btn-outline mt-6"
          >
            Review Lesson
          </button>
        </div>
      </div>
    );
  }

  if (showResults) {
    const passed = score >= 75;
    
    return (
      <div className="card">
        <div className="text-center py-8">
          <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4 ${
            passed ? 'bg-success/20' : 'bg-error/20'
          }`}>
            {passed ? (
              <svg className="w-12 h-12 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-12 h-12 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>
          
          <h3 className="text-3xl font-bold mb-2">
            {passed ? 'Congratulations!' : 'Keep Learning!'}
          </h3>
          
          <p className="text-text-secondary mb-4">
            You scored <span className="text-primary font-bold text-2xl">{score.toFixed(0)}%</span>
          </p>
          <div className="flex items-center justify-center gap-2 mb-6 text-text-secondary">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm">Time spent: {Math.floor(elapsedTime / 60)}m {elapsedTime % 60}s</span>
          </div>
          
          <div className="mb-6">
            <p className="text-sm text-text-secondary">
              {passed
                ? 'You have passed this quick assessment!'
                : 'You need at least 75% to pass. Review the material and try again.'}
            </p>
          </div>

          {skillResults && skillResults.skills && skillResults.skills.length > 0 && (
            <SkillMasteryResults
              skills={skillResults.skills}
              masteryThreshold={skillResults.masteryThreshold}
            />
          )}

          <div className="flex gap-4 justify-center">
            {passed ? (
              <button
                onClick={onComplete}
                className="btn btn-primary"
              >
                Continue to Next Topic
              </button>
            ) : (
              <>
                <button
                  onClick={handleRetry}
                  className="btn btn-primary"
                >
                  Retry ({COOLDOWN_SECONDS} sec cooldown)
                </button>
                <button
                  onClick={onCancel}
                  className="btn btn-outline"
                >
                  Review Material
                </button>
              </>
            )}
          </div>
        </div>

        {/* Answer Review */}
        <div className="mt-8 border-t border-background-light pt-6">
          <h4 className="font-bold mb-4">Answer Review</h4>
          <div className="space-y-4">
            {assessmentQuestions.map((q, index) => {
              const userAnswer = selectedAnswers[index];
              const correctAnswerText = resolveCorrectAnswerText(q);
              const isCorrect = userAnswer === correctAnswerText;
              
              return (
                <div key={index} className="bg-background-light p-4 rounded-lg">
                  <div className="flex items-start gap-3 mb-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isCorrect ? 'bg-success/20 text-success' : 'bg-error/20 text-error'
                    }`}>
                      {isCorrect ? '✓' : '✗'}
                    </div>
                    <p className="font-medium">{q.question}</p>
                  </div>
                  
                  <div className="ml-9 text-sm space-y-1">
                    <p className="text-text-secondary">
                      Your answer: <span className={isCorrect ? 'text-success' : 'text-error'}>
                        {userAnswer || 'No answer'}
                      </span>
                    </p>
                    {!isCorrect && (
                      <p className="text-text-secondary">
                        Correct answer: <span className="text-success">{correctAnswerText}</span>
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const currentQ = assessmentQuestions[currentQuestion];

  return (
    <div className="card">
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold">Quick Assessment</h3>
          <span className="text-text-secondary">
            Question {currentQuestion + 1} of {assessmentQuestions.length}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${((currentQuestion + 1) / assessmentQuestions.length) * 100}%` }}
          ></div>
        </div>
      </div>

      {/* Question */}
      <div className="mb-6">
        <p className="text-lg mb-4">{currentQ.question}</p>
        
        {/* Hint Display (only show if struggling) */}
        {performance && shouldShowHints(performance) && (
          <div className="mb-4">
            <button
              onClick={toggleHint}
              className="flex items-center gap-2 text-sm text-primary hover:text-primary-dark"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {showHint ? 'Hide Hint' : 'Need Help? Show Hint'}
            </button>
            
            {showHint && (
              <div className="mt-2 p-4 bg-blue-50 border-l-4 border-primary rounded-r-lg">
                <p className="text-sm text-text-primary">
                  💡 <strong>Hint:</strong> {getTutorialHints(topicTitle, currentQuestion)}
                </p>
              </div>
            )}
          </div>
        )}
        
        <div className="space-y-3">
          {currentQ.options.map((option, index) => (
            <button
              key={index}
              onClick={() => handleAnswerSelect(option)}
              className={`w-full text-left p-4 rounded-lg border-2 ${
                selectedAnswers[currentQuestion] === option
                  ? 'border-primary bg-primary/10'
                  : 'border-background-light hover:border-primary/50 bg-background-light'
              }`}
            >
              <div className="flex items-center">
                <div className={`w-5 h-5 rounded-full border-2 mr-3 flex items-center justify-center ${
                  selectedAnswers[currentQuestion] === option
                    ? 'border-primary bg-primary'
                    : 'border-background-dark'
                }`}>
                  {selectedAnswers[currentQuestion] === option && (
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                  )}
                </div>
                <span>{option}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center">
        <button
          onClick={handlePrevious}
          disabled={currentQuestion === 0}
          className="btn btn-outline"
        >
          Previous
        </button>

        <div className="flex gap-2">
          {assessmentQuestions.map((_, index) => (
            <div
              key={index}
              className={`w-2 h-2 rounded-full ${
                index === currentQuestion
                  ? 'bg-primary'
                  : selectedAnswers[index]
                  ? 'bg-success'
                  : 'bg-background-light'
              }`}
            ></div>
          ))}
        </div>

        {currentQuestion === assessmentQuestions.length - 1 ? (
          <button
            onClick={handleSubmit}
            disabled={!selectedAnswers[currentQuestion]}
            className="btn btn-primary"
          >
            Submit Assessment
          </button>
        ) : (
          <button
            onClick={handleNext}
            disabled={!selectedAnswers[currentQuestion]}
            className="btn btn-primary"
          >
            Next
          </button>
        )}
      </div>

      <div className="mt-4 text-center">
        <button
          onClick={onCancel}
          className="text-text-secondary hover:text-text-primary text-sm"
        >
          Cancel Assessment
        </button>
      </div>
    </div>
  );
};

export default QuickAssessment;
