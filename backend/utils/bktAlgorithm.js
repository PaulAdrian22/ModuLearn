// BKT Algorithm Utility
// Implements Bayesian Knowledge Tracing calculations

/**
 * Update knowledge state based on answer correctness
 * @param {number} pKnown - Current probability of knowing the skill
 * @param {number} pLearn - Probability of learning (transition)
 * @param {number} pSlip - Probability of slip (knowing but answering incorrectly)
 * @param {number} pGuess - Probability of guess (not knowing but answering correctly)
 * @param {boolean} isCorrect - Whether the answer was correct
 * @returns {number} - Updated probability of knowing
 */
const updateKnowledgeState = (pKnown, pLearn, pSlip, pGuess, isCorrect) => {
  let newPKnown;
  
  if (isCorrect) {
    // Update based on correct answer
    // P(L | correct) = [P(L) × (1 - P(S))] / [P(L) × (1 - P(S)) + (1 - P(L)) × P(G)]
    const numerator = pKnown * (1 - pSlip);
    const denominator = pKnown * (1 - pSlip) + (1 - pKnown) * pGuess;
    newPKnown = numerator / denominator;
  } else {
    // Update based on incorrect answer
    // P(L | incorrect) = [P(L) × P(S)] / [P(L) × P(S) + (1 - P(L)) × (1 - P(G))]
    const numerator = pKnown * pSlip;
    const denominator = pKnown * pSlip + (1 - pKnown) * (1 - pGuess);
    newPKnown = numerator / denominator;
  }
  
  // Apply learning transition
  // P(L_{n+1}) = P(L_n) + (1 - P(L_n)) × P(T)
  newPKnown = newPKnown + (1 - newPKnown) * pLearn;
  
  // Ensure bounds [0, 1]
  newPKnown = Math.max(0, Math.min(1, newPKnown));
  
  // Round to 4 decimal places
  return parseFloat(newPKnown.toFixed(4));
};

/**
 * Check if skill is mastered
 * @param {number} pKnown - Current probability of knowing
 * @param {number} threshold - Mastery threshold (default 0.95)
 * @returns {boolean} - Whether skill is mastered
 */
const isMastered = (pKnown, threshold = 0.95) => {
  return pKnown >= threshold;
};

/**
 * Calculate proficiency level based on P(Known)
 * @param {number} pKnown - Current probability of knowing
 * @returns {string} - Proficiency level
 */
const getProficiencyLevel = (pKnown) => {
  if (pKnown >= 0.95) return 'Mastered';
  if (pKnown >= 0.70) return 'Advanced';
  if (pKnown >= 0.50) return 'Intermediate';
  if (pKnown >= 0.30) return 'Beginner';
  return 'Novice';
};

/**
 * Recommend next skill to practice from array of knowledge states
 * @param {Array} knowledgeStates - Array of {skillName, pKnown} objects
 * @param {number} masteryThreshold - Threshold for mastery
 * @returns {object|null} - Recommended skill or null if all mastered
 */
const recommendNextSkill = (knowledgeStates, masteryThreshold = 0.95) => {
  // Filter unmastered skills
  const unmastered = knowledgeStates.filter(state => state.pKnown < masteryThreshold);
  
  if (unmastered.length === 0) {
    return null; // All skills mastered
  }
  
  // Sort by pKnown (lowest first - needs most practice)
  unmastered.sort((a, b) => a.pKnown - b.pKnown);
  
  return {
    skillName: unmastered[0].skillName,
    pKnown: unmastered[0].pKnown,
    proficiencyLevel: getProficiencyLevel(unmastered[0].pKnown),
    reason: 'This skill needs the most practice'
  };
};

/**
 * Calculate estimated attempts to mastery
 * @param {number} pKnown - Current probability of knowing
 * @param {number} pLearn - Probability of learning
 * @param {number} threshold - Mastery threshold
 * @returns {number} - Estimated number of attempts
 */
const estimateAttemptsToMastery = (pKnown, pLearn, threshold = 0.95) => {
  if (pKnown >= threshold) return 0;
  
  let attempts = 0;
  let currentPKnown = pKnown;
  
  // Simulate learning (assume all correct answers)
  while (currentPKnown < threshold && attempts < 100) {
    currentPKnown = currentPKnown + (1 - currentPKnown) * pLearn;
    attempts++;
  }
  
  return attempts;
};

/**
 * Per-skill BKT parameters based on skill category
 * G = Guess, T = Transit (Learn), S = Slip
 */
const SKILL_BKT_PARAMS = {
  'Memorization':              { pGuess: 0.15, pLearn: 0.10, pSlip: 0.40 },
  'Technical Comprehension':   { pGuess: 0.15, pLearn: 0.10, pSlip: 0.40 },
  'Analytical Thinking':       { pGuess: 0.14, pLearn: 0.11, pSlip: 0.43 },
  'Critical Thinking':         { pGuess: 0.13, pLearn: 0.12, pSlip: 0.45 },
  'Problem Solving':           { pGuess: 0.13, pLearn: 0.12, pSlip: 0.45 }
};

/**
 * Get BKT parameters for a specific skill
 * @param {string} skillName - Name of the skill
 * @returns {object} - { pGuess, pLearn, pSlip }
 */
const getSkillParams = (skillName) => {
  return SKILL_BKT_PARAMS[skillName] || { pGuess: 0.25, pLearn: 0.10, pSlip: 0.10 };
};

module.exports = {
  updateKnowledgeState,
  isMastered,
  getProficiencyLevel,
  recommendNextSkill,
  estimateAttemptsToMastery,
  SKILL_BKT_PARAMS,
  getSkillParams
};
