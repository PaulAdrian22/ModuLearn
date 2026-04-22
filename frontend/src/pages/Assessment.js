import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../App';
import Navbar from '../components/Navbar';
import { trackFinalAssessment } from '../services/adaptiveLearning';
import { themedConfirm } from '../utils/themedConfirm';
import { normalizeQuestionOptionList, shuffleArray } from '../utils/assessmentShuffle';

const Assessment = () => {
  const { assessmentId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [assessment, setAssessment] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState({});
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [questionTimes, setQuestionTimes] = useState({});
  const [elapsedTime, setElapsedTime] = useState(0);
  const [shuffledOptionsByQuestion, setShuffledOptionsByQuestion] = useState({});

  useEffect(() => {
    fetchAssessment();
  }, [assessmentId]);

  useEffect(() => {
    if (loading || showResults || questions.length === 0) return;
    setQuestionStartTime(Date.now());
  }, [currentQuestion, loading, showResults, questions.length]);

  const updateCurrentQuestionTime = (existingTimes = questionTimes) => {
    const currentQuestionId = questions[currentQuestion]?.QuestionID;
    if (!currentQuestionId) return existingTimes;

    const accumulated = existingTimes[currentQuestionId] || 0;
    const additional = questionStartTime
      ? Math.max(0, Math.floor((Date.now() - questionStartTime) / 1000))
      : 0;

    return {
      ...existingTimes,
      [currentQuestionId]: accumulated + additional,
    };
  };

  const fetchAssessment = async () => {
    try {
      setLoading(true);
      
      // Fetch assessment details
      const assessmentResponse = await axios.get(`/assessments/${assessmentId}`);
      setAssessment(assessmentResponse.data);
      
      // Fetch questions for the assessment
      const questionsResponse = await axios.get(`/questions/assessment/${assessmentId}`);
      setQuestions(questionsResponse.data);
      const shuffledOptionMap = questionsResponse.data.reduce((accumulator, question) => {
        const rawOptions = normalizeQuestionOptionList([
          question.OptionA,
          question.OptionB,
          question.OptionC,
          question.OptionD,
        ]).filter((option) => option.length > 0);
        accumulator[question.QuestionID] = shuffleArray(rawOptions);
        return accumulator;
      }, {});
      setShuffledOptionsByQuestion(shuffledOptionMap);
      
      setLoading(false);
    } catch (err) {
      console.error('Error fetching assessment:', err);
      setLoading(false);
    }
  };

  const handleAnswerSelect = (questionId, answer) => {
    setAnswers({
      ...answers,
      [questionId]: answer
    });
  };

  const handleNext = () => {
    const updatedQuestionTimes = updateCurrentQuestionTime();
    setQuestionTimes(updatedQuestionTimes);

    if (currentQuestion < questions.length - 1) {
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

  const handleJumpToQuestion = (index) => {
    const updatedQuestionTimes = updateCurrentQuestionTime();
    setQuestionTimes(updatedQuestionTimes);
    setCurrentQuestion(index);
  };

  const notifyAchievementRefresh = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('achievementMetricsUpdated'));
    }
  };

  const handleSubmit = async () => {
    const shouldSubmit = await themedConfirm({
      title: 'Submit Assessment?',
      message: 'Are you sure you want to submit your assessment?',
      confirmText: 'Submit',
      cancelText: 'Review Answers'
    });

    if (!shouldSubmit) {
      return;
    }

    const updatedQuestionTimes = updateCurrentQuestionTime();
    setQuestionTimes(updatedQuestionTimes);

    setSubmitting(true);

    try {
      // Submit all answers
      const answerPromises = Object.entries(answers).map(([questionId, answer]) =>
        axios.post('/assessments/submit', {
          assessmentId: parseInt(assessmentId),
          questionId: parseInt(questionId),
          answer
        })
      );

      await Promise.all(answerPromises);

      // Grade the assessment
      const gradeResponse = await axios.post(`/assessments/grade/${assessmentId}`);
      setResults(gradeResponse.data);
      const totalTimeSpent = Object.values(updatedQuestionTimes).reduce(
        (total, seconds) => total + Number(seconds || 0),
        0
      );
      setElapsedTime(totalTimeSpent);
      setShowResults(true);
      
      // Track final assessment performance for adaptive learning (Lessons 1-4 only)
      if (assessment && assessment.ModuleID && assessment.ModuleID <= 4) {
        trackFinalAssessment(assessment.ModuleID, {
          score: gradeResponse.data.score || 0
        });
      }

      notifyAchievementRefresh();
    } catch (err) {
      console.error('Error submitting assessment:', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center h-96">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  if (!assessment || questions.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="w-full px-8 py-8">
          <div className="bg-error/20 border border-error text-error px-4 py-3 rounded-lg">
            Assessment not found or no questions available
          </div>
        </div>
      </div>
    );
  }

  if (showResults) {
    const passed = results.score >= 75;
    
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        
        <div className="max-w-4xl mx-auto px-6 py-12">
          <div className="bg-white rounded-3xl shadow-2xl p-12 text-center border-2 border-[#E5E7EB]">
            <div className={`w-40 h-40 rounded-full flex items-center justify-center mx-auto mb-8 shadow-lg ${
              passed ? 'bg-highlight' : 'bg-[#EF5350]'
            }`}>
              {passed ? (
                <svg className="w-20 h-20 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-20 h-20 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>

            <h1 className="text-5xl font-bold mb-4 text-text-primary">
              {passed ? 'Congratulations! 🎉' : 'Assessment Complete'}
            </h1>

            <div className="mb-6">
              <p className="text-6xl font-bold text-primary mb-2">
                {results.score.toFixed(0)}%
              </p>
              <p className="text-text-secondary">
                You got {results.correct} out of {results.total} questions correct
              </p>
              <div className="flex items-center justify-center gap-2 mt-3 text-text-secondary">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-base">Time spent: {Math.floor(elapsedTime / 60)}m {elapsedTime % 60}s</span>
              </div>
            </div>

            <div className="mb-8">
              {passed ? (
                <div className="bg-success/20 border border-success text-success p-4 rounded-lg">
                  Congratulations! You have passed this assessment with a score of {results.score.toFixed(0)}%
                </div>
              ) : (
                <div className="bg-warning/20 border border-warning text-warning p-4 rounded-lg">
                  You need at least 75% to pass. Review the module and try again.
                </div>
              )}
            </div>

            <div className="flex gap-4 justify-center">
              <button
                onClick={() => navigate('/')}
                className="btn btn-primary"
              >
                Back to Dashboard
              </button>
              {!passed && (
                <button
                  onClick={() => navigate(`/module/${assessment.ModuleID}`)}
                  className="btn btn-outline"
                >
                  Review Module
                </button>
              )}
            </div>
          </div>

          {/* Detailed Results */}
          <div className="card mt-8">
            <h2 className="text-2xl font-bold mb-6">Detailed Results</h2>
            
            <div className="space-y-4">
              {results.details.map((detail, index) => {
                const isCorrect = detail.isCorrect;
                
                return (
                  <div key={index} className="bg-background-light p-4 rounded-lg">
                    <div className="flex items-start gap-3 mb-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isCorrect ? 'bg-success/20 text-success' : 'bg-error/20 text-error'
                      }`}>
                        {isCorrect ? '✓' : '✗'}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium mb-2">{detail.question}</p>
                        <div className="text-sm space-y-1">
                          <p className="text-text-secondary">
                            Your answer: <span className={isCorrect ? 'text-success' : 'text-error'}>
                              {detail.userAnswer}
                            </span>
                          </p>
                          {!isCorrect && (
                            <p className="text-text-secondary">
                              Correct answer: <span className="text-success">{detail.correctAnswer}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentQuestion];
  const isAnswered = answers[currentQ.QuestionID] !== undefined;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-text-primary mb-2">{assessment.AssessmentType} Assessment</h1>
          <p className="text-gray-600 text-lg">Answer all questions to the best of your ability</p>
        </div>

        {/* Progress */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-8 border-2 border-[#E5E7EB]">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-lg text-text-primary">Question {currentQuestion + 1} of {questions.length}</h3>
            <div className="text-right">
              <span className="text-gray-600 font-medium block">
                {Object.keys(answers).length}/{questions.length} answered
              </span>
            </div>
          </div>
          
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="h-3 bg-highlight rounded-full"
              style={{ width: `${((currentQuestion + 1) / questions.length) * 100}%` }}
            ></div>
          </div>
        </div>

        {/* Question Card */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8 border-2 border-[#E5E7EB]">
          <h2 className="text-2xl font-bold text-text-primary mb-8">{currentQ.QuestionText}</h2>
          
          <div className="space-y-4">
            {(shuffledOptionsByQuestion[currentQ.QuestionID]
              || normalizeQuestionOptionList([
                currentQ.OptionA,
                currentQ.OptionB,
                currentQ.OptionC,
                currentQ.OptionD,
              ]).filter((option) => option.length > 0))
              .map((option, index) => (
                <button
                  key={index}
                  onClick={() => handleAnswerSelect(currentQ.QuestionID, option)}
                  className={`w-full text-left p-5 rounded-xl border-2 ${
                    answers[currentQ.QuestionID] === option
                      ? 'border-highlight bg-[#E8F8F5] shadow-md'
                      : 'border-[#E5E7EB] bg-white'
                  }`}
                >
                  <div className="flex items-center">
                    <div className={`w-6 h-6 rounded-full border-2 mr-3 flex items-center justify-center ${
                      answers[currentQ.QuestionID] === option
                        ? 'border-primary bg-primary'
                        : 'border-background-dark'
                    }`}>
                      {answers[currentQ.QuestionID] === option && (
                        <div className="w-3 h-3 bg-white rounded-full"></div>
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
            className="btn btn-outline disabled:opacity-50"
          >
            ← Previous
          </button>

          <div className="flex gap-2">
            {questions.map((_, index) => (
              <button
                key={index}
                onClick={() => handleJumpToQuestion(index)}
                className={`w-3 h-3 rounded-full ${
                  index === currentQuestion
                    ? 'bg-primary w-6'
                    : answers[questions[index].QuestionID]
                    ? 'bg-success'
                    : 'bg-background-dark'
                }`}
              ></button>
            ))}
          </div>

          {currentQuestion === questions.length - 1 ? (
            <button
              onClick={handleSubmit}
              disabled={submitting || Object.keys(answers).length < questions.length}
              className="btn btn-primary disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Assessment'}
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="btn btn-primary"
            >
              Next →
            </button>
          )}
        </div>

        {Object.keys(answers).length < questions.length && (
          <p className="text-center text-text-secondary text-sm mt-4">
            Please answer all questions before submitting
          </p>
        )}
      </div>
    </div>
  );
};

export default Assessment;
