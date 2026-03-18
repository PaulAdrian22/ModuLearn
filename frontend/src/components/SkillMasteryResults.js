import React, { useState, useEffect } from 'react';

const SKILL_COLORS = {
  'Memorization':            { bar: '#8AB4F8', bg: '#E8F0FE', icon: '🧠' },
  'Technical Comprehension': { bar: '#4DD0E1', bg: '#E0F7FA', icon: '🔧' },
  'Analytical Thinking':     { bar: '#FFB74D', bg: '#FFF3E0', icon: '📊' },
  'Critical Thinking':       { bar: '#EF5350', bg: '#FFEBEE', icon: '💡' },
  'Problem Solving':         { bar: '#AB47BC', bg: '#F3E5F5', icon: '🧩' }
};

const SkillMasteryResults = ({ skills, masteryThreshold = 0.95 }) => {
  const [animatedWidths, setAnimatedWidths] = useState({});
  const [showBars, setShowBars] = useState(false);

  useEffect(() => {
    if (!skills || skills.length === 0) return;

    // Start animation after a short delay
    const timer1 = setTimeout(() => setShowBars(true), 300);

    // Animate bars sequentially
    skills.forEach((skill, index) => {
      setTimeout(() => {
        setAnimatedWidths(prev => ({
          ...prev,
          [skill.skillName]: skill.newPKnown * 100
        }));
      }, 500 + index * 400);
    });

    return () => clearTimeout(timer1);
  }, [skills]);

  if (!skills || skills.length === 0) return null;

  const getProficiencyLabel = (pKnown) => {
    if (pKnown >= 0.95) return 'Mastered';
    if (pKnown >= 0.70) return 'Advanced';
    if (pKnown >= 0.50) return 'Intermediate';
    if (pKnown >= 0.30) return 'Beginner';
    return 'Novice';
  };

  return (
    <div className="w-full mt-4">
      <h3 className="text-base font-bold text-[#0B2B4C] mb-3 text-center">
        Skill Mastery Progress
      </h3>

      <div className="space-y-3">
        {skills.map((skill, index) => {
          const colors = SKILL_COLORS[skill.skillName] || { bar: '#9E9E9E', bg: '#F5F5F5', icon: '📝' };
          const prevWidth = skill.previousPKnown * 100;
          const newWidth = animatedWidths[skill.skillName] || prevWidth;
          const gained = skill.newPKnown - skill.previousPKnown;
          const proficiency = getProficiencyLabel(skill.newPKnown);

          return (
            <div
              key={skill.skillName}
              className="rounded-lg p-3"
              style={{
                backgroundColor: colors.bg,
                opacity: showBars ? 1 : 0,
                transform: showBars ? 'translateY(0)' : 'translateY(10px)',
                transition: `opacity 0.4s ease ${index * 0.15}s, transform 0.4s ease ${index * 0.15}s`
              }}
            >
              {/* Skill header */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-base">{colors.icon}</span>
                  <span className="font-semibold text-xs text-[#0B2B4C]">{skill.skillName}</span>
                </div>
                <div className="flex items-center gap-2">
                  {gained > 0 && (
                    <span className="text-xs font-bold text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full">
                      +{(gained * 100).toFixed(1)}%
                    </span>
                  )}
                  {gained < 0 && (
                    <span className="text-xs font-bold text-red-500 bg-red-100 px-1.5 py-0.5 rounded-full">
                      {(gained * 100).toFixed(1)}%
                    </span>
                  )}
                  <span className="text-xs font-medium text-gray-500">
                    {proficiency}
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="relative w-full h-3 bg-white/70 rounded-full overflow-hidden shadow-inner">
                {/* Previous mastery (faded) */}
                <div
                  className="absolute top-0 left-0 h-full rounded-full opacity-30"
                  style={{
                    width: `${prevWidth}%`,
                    backgroundColor: colors.bar
                  }}
                />
                {/* Current mastery (animated) */}
                <div
                  className="absolute top-0 left-0 h-full rounded-full"
                  style={{
                    width: `${newWidth}%`,
                    backgroundColor: colors.bar,
                    transition: 'width 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: `0 0 8px ${colors.bar}60`
                  }}
                />
                {/* Percentage label inside bar */}
                <div className="absolute inset-0 flex items-center justify-end pr-2">
                  <span className="text-xs font-bold text-white drop-shadow-sm"
                    style={{ opacity: newWidth > 8 ? 1 : 0 }}
                  >
                    {newWidth.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Mastery badge */}
              {skill.isMastered && (
                <div className="flex items-center justify-center gap-1 mt-1.5"
                  style={{
                    opacity: showBars ? 1 : 0,
                    transition: `opacity 0.5s ease ${0.8 + index * 0.4}s`
                  }}
                >
                  <span className="text-yellow-500 text-xs">⭐</span>
                  <span className="text-xs font-bold text-yellow-600">MASTERED</span>
                  <span className="text-yellow-500 text-xs">⭐</span>
                </div>
              )}

              {/* Questions breakdown */}
              <div className="mt-1 text-xs text-gray-500 text-right">
                {skill.correctCount}/{skill.questionsAnswered} correct
              </div>
            </div>
          );
        })}
      </div>

      {/* Mastery threshold indicator */}
      <div className="mt-3 text-center text-xs text-gray-400">
        Mastery threshold: {(masteryThreshold * 100).toFixed(0)}%
      </div>
    </div>
  );
};

export default SkillMasteryResults;
