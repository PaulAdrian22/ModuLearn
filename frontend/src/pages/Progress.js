import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../components/Navbar';
import SkeletonLoader from '../components/SkeletonLoader';

const Progress = () => {
  const navigate = useNavigate();
  const [progressData, setProgressData] = useState(null);
  const [bktData, setBktData] = useState([]);
  const [skillsData, setSkillsData] = useState([]);
  const [learningSummary, setLearningSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showLoading, setShowLoading] = useState(false);
  const [scrollThumbTop, setScrollThumbTop] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const scrollContainerRef = React.useRef(null);
  const scrollThumbRef = React.useRef(null);
  const dragStartY = React.useRef(0);
  const dragStartScrollTop = React.useRef(0);

  useEffect(() => {
    fetchProgressData();
  }, []);

  // Handle scroll synchronization
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollPercentage = container.scrollTop / (container.scrollHeight - container.clientHeight);
      const maxThumbTop = 580 - (580 * 0.3); // maxHeight - thumbHeight
      setScrollThumbTop(scrollPercentage * maxThumbTop);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Handle thumb drag
  const handleThumbMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartY.current = e.clientY;
    dragStartScrollTop.current = scrollContainerRef.current?.scrollTop || 0;
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging || !scrollContainerRef.current) return;

      const deltaY = e.clientY - dragStartY.current;
      const maxThumbTop = 580 - (580 * 0.3);
      const scrollRatio = (scrollContainerRef.current.scrollHeight - scrollContainerRef.current.clientHeight) / maxThumbTop;
      
      scrollContainerRef.current.scrollTop = dragStartScrollTop.current + (deltaY * scrollRatio);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const fetchProgressData = async () => {
    try {
      setLoading(true);
      
      // Delay showing loading spinner
      const loadingTimer = setTimeout(() => setShowLoading(true), 200);
      
      // Fetch progress stats
      const progressResponse = await axios.get('/progress');
      setProgressData(progressResponse.data);
      
      // Fetch BKT knowledge states
      const bktResponse = await axios.get('/bkt/knowledge-states');
      setBktData(bktResponse.data);
      
      // Fetch learning skills analytics
      const skillsResponse = await axios.get('/learning-skills/analytics');
      setSkillsData(skillsResponse.data);

      // Fetch detailed learning progress summary for the bottom panel
      const summaryResponse = await axios.get('/users/learning-progress-summary');
      setLearningSummary(summaryResponse.data);
      
      clearTimeout(loadingTimer);
      setLoading(false);
      setShowLoading(false);
    } catch (err) {
      console.error('Error fetching progress data:', err);
      setLoading(false);
      setShowLoading(false);
    }
  };

  const TOKEN_ICON_BY_KEY = {
    play: (
      <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 5v14l11-7z" />
      </svg>
    ),
    flame: (
      <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M13.5 2s.7 3-1.6 5.4c-2.2 2.3-2.3 4.1-1 5.5.9 1 2.7 1.1 3.8-.1 2.2-2.2 1.6-6.3 1.6-6.3s3.7 2.8 3.7 7.1c0 4.5-3.3 8.4-8 8.4s-8-3.9-8-8.1c0-2.5 1-4.7 2.7-6.4C8.8 5.5 10 3.8 10.3 2c0 0 1.2.6 3.2 0z" />
      </svg>
    ),
    shield: (
      <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2 4 5v6c0 5.1 3.4 9.8 8 11 4.6-1.2 8-5.9 8-11V5l-8-3zm-1 13-3-3 1.4-1.4L11 12.2l3.6-3.6L16 10l-5 5z" />
      </svg>
    ),
    speed: (
      <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 13h8v-2H4v2zm0 4h6v-2H4v2zM4 9h10V7H4v2zm9.6 10 1.4-1.4-2.1-2.1 2.1-2.1-1.4-1.4-3.5 3.5 3.5 3.5zM19 7h-2v6h2V7z" />
      </svg>
    ),
    brain: (
      <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 3a3 3 0 0 0-3 3v.2A3.8 3.8 0 0 0 3 10a3.8 3.8 0 0 0 3 3.8V18a3 3 0 0 0 3 3h1v-8H9V3zm6 0h-1v8h1v10h1a3 3 0 0 0 3-3v-4.2A3.8 3.8 0 0 0 21 10a3.8 3.8 0 0 0-3-3.8V6a3 3 0 0 0-3-3z" />
      </svg>
    ),
    trophy: (
      <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18 4V2H6v2H3v3c0 2.6 1.9 4.8 4.5 5.2A5.5 5.5 0 0 0 11 16v2H8v2h8v-2h-3v-2a5.5 5.5 0 0 0 3.5-3.6C19.1 11.8 21 9.6 21 7V4h-3zm-2 6V4h3v3a3 3 0 0 1-3 3zM5 7V4h3v6a3 3 0 0 1-3-3z" />
      </svg>
    ),
    chart: (
      <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20h16v-2H4v2zM6 10h3v6H6v-6zm5-4h3v10h-3V6zm5 7h3v3h-3v-3z" />
      </svg>
    ),
    rocket: (
      <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14 3c3.6.2 6.8 3.4 7 7-2.1.9-4.3 1.3-6.5 1.2l-3.7 3.7-1.8-1.8 3.7-3.7c-.1-2.2.3-4.4 1.3-6.4zM7 14l3 3-4.5 1.5L7 14zm10-6a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM4 20l3-3 1 1-3 3H4z" />
      </svg>
    ),
    journey: (
      <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 5.5A2.5 2.5 0 0 1 5.5 3H12v14H5.5A2.5 2.5 0 0 0 3 19.5v-14zM21 19.5A2.5 2.5 0 0 0 18.5 17H12V3h6.5A2.5 2.5 0 0 1 21 5.5v14zM5.5 5A.5.5 0 0 0 5 5.5v11a2.5 2.5 0 0 1 .5-.05H10V5H5.5zm13 0H14v11.45h4.5a2.5 2.5 0 0 1 .5.05v-11a.5.5 0 0 0-.5-.5z" />
      </svg>
    )
  };

  const TOKEN_DEFINITIONS = [
    {
      key: 'journey-begins',
      name: 'Journey Begins',
      subtitle: 'Open a lesson',
      description: 'Unlocked when you start your first lesson journey.',
      iconKey: 'journey',
      bgColor: 'bg-[#4FC3F7]',
      isUnlocked: (metrics) => metrics.openedLessons >= 1
    },
    {
      key: 'kickstarter',
      name: 'Kickstarter Token',
      subtitle: 'Complete your first lesson',
      description: 'Unlocked once you finish at least 1 lesson.',
      iconKey: 'play',
      bgColor: 'bg-[#8BC34A]',
      isUnlocked: (metrics) => metrics.completedLessons >= 1
    },
    {
      key: 'igniter',
      name: 'Igniter Token',
      subtitle: 'Pass 1 final assessment',
      description: 'Represents your first full assessment win.',
      iconKey: 'flame',
      bgColor: 'bg-[#FF9800]',
      isUnlocked: (metrics) => metrics.finalTaken >= 1
    },
    {
      key: 'safety',
      name: 'Safety Token',
      subtitle: 'Reach 40% mastery level',
      description: 'Shows growing confidence and safe practice.',
      iconKey: 'shield',
      bgColor: 'bg-[#64B5F6]',
      isUnlocked: (metrics) => metrics.masteryPercent >= 40
    },
    {
      key: 'fast-learner',
      name: 'Fast Learner Token',
      subtitle: 'Take 6 review assessments',
      description: 'Earned through consistent review effort.',
      iconKey: 'speed',
      bgColor: 'bg-[#FFD54F]',
      isUnlocked: (metrics) => metrics.reviewTaken >= 6
    },
    {
      key: 'critical-thinker',
      name: 'Critical Thinker Token',
      subtitle: 'Get 3 skills above 70%',
      description: 'Unlocked by strengthening multiple skills.',
      iconKey: 'brain',
      bgColor: 'bg-[#9575CD]',
      isUnlocked: (metrics) => metrics.highSkillCount >= 3
    },
    {
      key: 'mastery',
      name: 'Mastery Token',
      subtitle: 'Get 2 skills above 95%',
      description: 'Proof of elite command in key competencies.',
      iconKey: 'trophy',
      bgColor: 'bg-[#FFB74D]',
      isUnlocked: (metrics) => metrics.masteredSkillCount >= 2
    },
    {
      key: 'consistency',
      name: 'Consistency Token',
      subtitle: 'Reach 70% path progress',
      description: 'Tracks long-term consistency in your path.',
      iconKey: 'chart',
      bgColor: 'bg-[#4DD0E1]',
      isUnlocked: (metrics) => metrics.pathPercent >= 70
    },
    {
      key: 'overachiever',
      name: 'Overachiever Token',
      subtitle: 'Average 85+ in assessments',
      description: 'Awarded for sustained high performance.',
      iconKey: 'rocket',
      bgColor: 'bg-[#EC407A]',
      isUnlocked: (metrics) => metrics.avgOverallScore >= 85
    }
  ];

  // Skill definitions with icons, colors, and descriptions
  const SKILL_DEFS = {
    'Memorization': {
      description: 'Good ability to remember terms, hardware functions, etc.',
      icon: (
        <svg className="w-8 h-8 text-[#0B2B4C]" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
        </svg>
      ),
      color: '#F39C12'
    },
    'Analytical Thinking': {
      description: 'Skills in breaking down complex concepts and procedures',
      icon: (
        <svg className="w-8 h-8 text-[#0B2B4C]" fill="currentColor" viewBox="0 0 24 24">
          <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
        </svg>
      ),
      color: '#2BC4B3'
    },
    'Critical Thinking': {
      description: 'Strong evaluation skills based on current knowledge',
      icon: (
        <svg className="w-8 h-8 text-[#0B2B4C]" fill="currentColor" viewBox="0 0 24 24">
          <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
        </svg>
      ),
      color: '#87CEEB'
    },
    'Problem Solving': {
      description: 'Ability to identify and respond properly to complex situations',
      icon: (
        <svg className="w-8 h-8 text-[#0B2B4C]" fill="currentColor" viewBox="0 0 24 24">
          <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 12h-2v-2h2v2zm0-4h-2V6h2v4z"/>
        </svg>
      ),
      color: '#FF6B6B'
    },
    'Technical Comprehension': {
      description: 'Skills in breaking down complex concepts and procedures.',
      icon: (
        <svg className="w-8 h-8 text-[#0B2B4C]" fill="currentColor" viewBox="0 0 24 24">
          <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/>
        </svg>
      ),
      color: '#9B59B6'
    }
  };

  // Build skills array from live BKT data, falling back to 0% for skills without data
  const skillOrder = ['Memorization', 'Analytical Thinking', 'Critical Thinking', 'Problem Solving', 'Technical Comprehension'];
  const skills = skillOrder.map(name => {
    const bktRecord = bktData.find(b => b.SkillName === name);
    const def = SKILL_DEFS[name];
    return {
      name,
      percentage: bktRecord ? Math.round(parseFloat(bktRecord.PKnown) * 100) : 0,
      description: def.description,
      icon: def.icon,
      color: def.color
    };
  });

  const formatMinutesToHoursAndMinutes = (totalMinutes = 0) => {
    const minutes = Math.max(0, parseInt(totalMinutes, 10) || 0);
    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;
    if (hours === 0) return `${remaining} Minute${remaining === 1 ? '' : 's'}`;
    if (remaining === 0) return `${hours} Hour${hours === 1 ? '' : 's'}`;
    return `${hours} Hour${hours === 1 ? '' : 's'} ${remaining} Minute${remaining === 1 ? '' : 's'}`;
  };

  const summary = learningSummary || {
    learningPathProgress: {
      completedLessons: progressData?.filter(p => (p.CompletionRate || 0) >= 100).length || 0,
      totalLessons: progressData?.length || 0,
      progressPercent: progressData?.length ? Math.round((progressData.filter(p => (p.CompletionRate || 0) >= 100).length / progressData.length) * 100) : 0,
    },
    lessonPerformance: {
      learningTimeMinutes: 0,
      averageTimePerLessonMinutes: 0,
      lessonLevel: 'Introductory Level',
      mostChallengedLesson: null,
      wellGraspedLesson: null,
      masteryLevelPercent: 0,
    },
    assessment: {
      totalReviewAssessmentsTaken: 0,
      averageReviewAssessmentScore: 0,
      totalFinalAssessmentsTaken: 0,
      averageFinalAssessmentScore: 0,
    }
  };

  const tokenMetrics = {
    openedLessons: Array.isArray(progressData)
      ? progressData.filter((lesson) => Number(lesson.CompletionRate || 0) > 0).length
      : 0,
    completedLessons: summary.learningPathProgress.completedLessons || 0,
    pathPercent: summary.learningPathProgress.progressPercent || 0,
    masteryPercent: summary.lessonPerformance.masteryLevelPercent || 0,
    reviewTaken: summary.assessment.totalReviewAssessmentsTaken || 0,
    finalTaken: summary.assessment.totalFinalAssessmentsTaken || 0,
    avgReview: summary.assessment.averageReviewAssessmentScore || 0,
    avgFinal: summary.assessment.averageFinalAssessmentScore || 0,
    highSkillCount: skills.filter((skill) => skill.percentage >= 70).length,
    masteredSkillCount: skills.filter((skill) => skill.percentage >= 95).length,
    avgOverallScore: Math.round(
      ((summary.assessment.averageReviewAssessmentScore || 0) + (summary.assessment.averageFinalAssessmentScore || 0)) / 2
    )
  };

  const iconTokens = TOKEN_DEFINITIONS.map((token) => ({
    ...token,
    unlocked: token.isUnlocked(tokenMetrics),
    icon: TOKEN_ICON_BY_KEY[token.iconKey]
  }));

  const achievementTokens = iconTokens.filter((token) => token.unlocked);
  const lockedIconTokens = iconTokens.filter((token) => !token.unlocked);

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <Navbar />
      
      <div className="w-full px-8 py-8 min-h-[calc(100vh-80px)] custom-scrollbar">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-[#0B2B4C] mb-2">Your Proficiencies</h1>
          <p className="text-gray-600 text-lg">Check your performance and track your progress here. Keep up the great work!</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Adaptive Tokens */}
          <div className="bg-white rounded-lg border border-gray-300 relative">
            {/* Header - Fixed */}
            <div className="p-6 pb-4">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-[#0B2B4C]">Achievement Tokens</h2>
                <div className="text-xl font-bold text-gray-600">
                  {achievementTokens.length}
                  <span className="text-gray-400"> / {iconTokens.length}</span>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-2">
                Tokens unlock automatically based on your current progress and mastery.
              </p>
            </div>

            {/* Scrollable Content Area */}
            <div className="relative px-6 pb-6">
              <div 
                ref={scrollContainerRef}
                className="overflow-y-auto pr-4" 
                style={{ 
                  maxHeight: '580px',
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none'
                }}
              >
                <style jsx>{`
                  div::-webkit-scrollbar {
                    display: none;
                  }
                `}</style>
                
                {/* Achievement Tokens (Unlocked Icon Tokens) */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  {achievementTokens.length === 0 && (
                    <div className="col-span-2 border border-dashed border-gray-300 rounded-lg p-6 text-center text-gray-500">
                      No achievement tokens unlocked yet. Keep progressing to unlock your first token.
                    </div>
                  )}
                  {achievementTokens.map((token) => (
                    <div key={token.key} className="flex flex-col items-center text-center p-4 border border-gray-200 rounded-lg">
                      <div className={`w-20 h-20 ${token.bgColor} rounded-full flex items-center justify-center mb-3 shadow-inner`}>
                        {token.icon}
                      </div>
                      <h3 className="font-bold text-[#0B2B4C] mb-1">{token.name}</h3>
                      <p className="text-xs text-gray-500 mb-2">{token.subtitle}</p>
                      <p className="text-xs text-gray-600">{token.description}</p>
                    </div>
                  ))}
                </div>

                {/* Icon Tokens */}
                <div className="pt-6 border-t border-gray-200">
                  <h2 className="text-2xl font-bold text-[#0B2B4C] mb-6">Icon Tokens</h2>
                  
                  <div className="grid grid-cols-3 gap-4">
                    {lockedIconTokens.map((token) => (
                      <div
                        key={token.key}
                        className="group flex flex-col items-center text-center p-4 border rounded-lg border-gray-300 bg-gray-50"
                      >
                        <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-3 relative ${token.unlocked ? token.bgColor : 'bg-gray-300'}`}>
                          <div className={token.unlocked ? '' : 'opacity-35'}>{token.icon}</div>
                          {!token.unlocked && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/35 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                              <svg className="w-9 h-9 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zM9 6a3 3 0 0 1 6 0v2H9V6z" />
                              </svg>
                            </div>
                          )}
                          {token.unlocked && (
                            <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-[#2BC4B3] border-2 border-white flex items-center justify-center">
                              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <h3 className={`font-bold mb-1 text-sm ${token.unlocked ? 'text-[#0B2B4C]' : 'text-gray-500'}`}>
                          {token.name}
                        </h3>
                        <p className="text-xs text-gray-500 mb-2">{token.subtitle}</p>
                        <p className="text-xs text-gray-600">{token.description}</p>
                        {!token.unlocked && (
                          <span className="mt-2 text-[11px] font-semibold text-gray-500 bg-white border border-gray-300 px-2 py-1 rounded-full">
                            Locked
                          </span>
                        )}
                      </div>
                    ))}
                    {lockedIconTokens.length === 0 && (
                      <div className="col-span-3 border border-dashed border-gray-300 rounded-lg p-6 text-center text-gray-500">
                        All icon tokens are unlocked and moved to Achievement Tokens.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Custom Vertical Scrollbar */}
              <div 
                className="absolute right-2 top-0 bottom-0 w-2 bg-gray-200 rounded-full"
                style={{ 
                  height: '100%',
                  maxHeight: '580px'
                }}
              >
                <div 
                  ref={scrollThumbRef}
                  className="w-full bg-[#2BC4B3] rounded-full cursor-pointer hover:bg-[#25a896] transition-colors select-none"
                  style={{ 
                    height: '30%',
                    position: 'relative',
                    top: `${scrollThumbTop}px`
                  }}
                  onMouseDown={handleThumbMouseDown}
                ></div>
              </div>
            </div>
          </div>

          {/* Right Column - Mastery Performance */}
          <div className="bg-white rounded-lg p-6 border border-gray-300">
            <h2 className="text-2xl font-bold text-[#0B2B4C] mb-6">Mastery Performance</h2>
            
            <div className="space-y-6">
              {skills.map((skill, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-start gap-4">
                    <div className="mt-1">
                      {skill.icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="font-bold text-[#0B2B4C] text-lg">{skill.name}</h3>
                        <span className="text-xl font-bold" style={{ color: skill.color }}>
                          {skill.percentage}%
                        </span>
                      </div>
                      
                      <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                        <div 
                          className="h-2.5 rounded-full duration-500"
                          style={{ 
                            width: `${skill.percentage}%`,
                            backgroundColor: skill.color
                          }}
                        ></div>
                      </div>
                      
                      <p className="text-sm text-gray-600">{skill.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Panel - Learning Path Progress */}
        <div className="mt-8 bg-white rounded-lg border border-gray-300 p-6">
          <h2 className="text-3xl md:text-4xl font-bold text-[#0B2B4C] mb-4">Learning Path Progress</h2>

          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden mb-2">
            <div
              className="h-full rounded-full bg-[#87CEEB] transition-all duration-500"
              style={{ width: `${summary.learningPathProgress.progressPercent || 0}%` }}
            ></div>
          </div>

          <p className="text-lg sm:text-xl md:text-2xl text-[#1F1F1F] mb-6 leading-snug">
            Lessons Completed:{' '}
            <span className="text-[#4DD0E1] font-semibold">{summary.learningPathProgress.completedLessons}</span>
            {' / '}
            <span className="font-semibold">{summary.learningPathProgress.totalLessons}</span>
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <h3 className="text-2xl md:text-3xl font-bold text-[#0B2B4C] mb-3">Lesson Performance</h3>
              <div className="space-y-1 text-sm sm:text-base md:text-lg lg:text-xl leading-snug text-[#1F1F1F]">
                <p>
                  Learning Time : <span className="text-[#4DD0E1] font-semibold">{formatMinutesToHoursAndMinutes(summary.lessonPerformance.learningTimeMinutes)}</span>
                </p>
                <p>
                  Average Time Per Lesson : <span className="text-[#4DD0E1] font-semibold">{formatMinutesToHoursAndMinutes(summary.lessonPerformance.averageTimePerLessonMinutes)}</span>
                </p>
                <p>
                  Lesson Level : <span className="text-[#4DD0E1] font-semibold">{summary.lessonPerformance.lessonLevel}</span>
                </p>
                <p>
                  Most Challenged Lesson : <span className="text-[#4DD0E1] font-semibold">{summary.lessonPerformance.mostChallengedLesson || 'Not Available Yet'}</span>
                </p>
                <p>
                  Well Grasped Lesson : <span className="text-[#4DD0E1] font-semibold">{summary.lessonPerformance.wellGraspedLesson || 'Not Available Yet'}</span>
                </p>
                <p>
                  Mastery Level : <span className="text-[#4DD0E1] font-semibold">{summary.lessonPerformance.masteryLevelPercent}%</span>
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-2xl md:text-3xl font-bold text-[#0B2B4C] mb-3">Assessment</h3>
              <div className="space-y-1 text-sm sm:text-base md:text-lg lg:text-xl leading-snug text-[#1F1F1F]">
                <p>
                  Total Review Assessment Taken: <span className="text-[#4DD0E1] font-semibold">{summary.assessment.totalReviewAssessmentsTaken}</span>
                </p>
                <p>
                  Average Review Assessment Score: <span className="text-[#4DD0E1] font-semibold">{summary.assessment.averageReviewAssessmentScore}</span>
                </p>
                <p>
                  Total Final Assessment Score: <span className="text-[#4DD0E1] font-semibold">{summary.assessment.totalFinalAssessmentsTaken}</span>
                </p>
                <p>
                  Average Final Assessment Score: <span className="text-[#4DD0E1] font-semibold">{summary.assessment.averageFinalAssessmentScore}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Progress;
