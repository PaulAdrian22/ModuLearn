// BKT Controller
// Handles Bayesian Knowledge Tracing operations

const { query, getConnection } = require('../config/database');
const { updateKnowledgeState, recommendNextSkill, getSkillParams, SKILL_BKT_PARAMS } = require('../utils/bktAlgorithm');

// Get user's BKT knowledge states
const getUserKnowledgeStates = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const knowledgeStates = await query(
      'SELECT * FROM bkt_model WHERE UserID = ? ORDER BY SkillName',
      [userId]
    );
    
    res.json(knowledgeStates);
    
  } catch (error) {
    console.error('Get knowledge states error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch knowledge states'
    });
  }
};

// Get knowledge state for specific skill
const getSkillKnowledgeState = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { skillName } = req.params;
    
    const knowledgeStates = await query(
      'SELECT * FROM bkt_model WHERE UserID = ? AND SkillName = ?',
      [userId, skillName]
    );
    
    if (knowledgeStates.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Knowledge state not found for this skill'
      });
    }
    
    res.json(knowledgeStates[0]);
    
  } catch (error) {
    console.error('Get skill knowledge state error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch skill knowledge state'
    });
  }
};

// Initialize BKT for a skill
const initializeSkillKnowledge = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { skillName } = req.body;
    
    // Check if already exists
    const existing = await query(
      'SELECT BkID FROM bkt_model WHERE UserID = ? AND SkillName = ?',
      [userId, skillName]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'BKT model already initialized for this skill'
      });
    }
    
    // Insert with default values
    const result = await query(
      `INSERT INTO bkt_model (UserID, SkillName, PKnown, PLearn, PSlip, PGuess) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId,
        skillName,
        parseFloat(process.env.BKT_DEFAULT_PKNOWN) || 0.1,
        parseFloat(process.env.BKT_DEFAULT_PLEARN) || 0.3,
        parseFloat(process.env.BKT_DEFAULT_PSLIP) || 0.1,
        parseFloat(process.env.BKT_DEFAULT_PGUESS) || 0.25
      ]
    );
    
    const newKnowledgeState = await query(
      'SELECT * FROM bkt_model WHERE BkID = ?',
      [result.insertId]
    );
    
    res.status(201).json({
      message: 'BKT model initialized',
      knowledgeState: newKnowledgeState[0]
    });
    
  } catch (error) {
    console.error('Initialize skill knowledge error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to initialize BKT model'
    });
  }
};

// Update BKT based on answer correctness
const updateKnowledge = async (req, res) => {
  const connection = await getConnection();
  
  try {
    await connection.beginTransaction();
    
    const userId = req.user.userId;
    const { skillName, isCorrect } = req.body;
    
    // Get current knowledge state
    const [knowledgeStates] = await connection.execute(
      'SELECT * FROM bkt_model WHERE UserID = ? AND SkillName = ?',
      [userId, skillName]
    );
    
    if (knowledgeStates.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({
        error: 'Not Found',
        message: 'Knowledge state not found. Initialize first.'
      });
    }
    
    const currentState = knowledgeStates[0];
    
    // Calculate new knowledge probability using BKT algorithm
    const newPKnown = updateKnowledgeState(
      parseFloat(currentState.PKnown),
      parseFloat(currentState.PLearn),
      parseFloat(currentState.PSlip),
      parseFloat(currentState.PGuess),
      isCorrect
    );
    
    // Update knowledge state
    await connection.execute(
      'UPDATE bkt_model SET PKnown = ?, updated_at = CURRENT_TIMESTAMP WHERE UserID = ? AND SkillName = ?',
      [newPKnown, userId, skillName]
    );
    
    await connection.commit();
    connection.release();
    
    const masteryThreshold = parseFloat(process.env.BKT_MASTERY_THRESHOLD) || 0.95;
    const isMastered = newPKnown >= masteryThreshold;
    
    res.json({
      message: 'Knowledge state updated',
      skillName,
      previousPKnown: parseFloat(currentState.PKnown),
      newPKnown,
      isMastered,
      masteryThreshold
    });
    
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Update knowledge error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update knowledge state'
    });
  }
};

// Get recommended next skill to practice
const getRecommendation = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Get all knowledge states
    const knowledgeStates = await query(
      'SELECT SkillName, PKnown FROM bkt_model WHERE UserID = ? ORDER BY PKnown ASC',
      [userId]
    );
    
    if (knowledgeStates.length === 0) {
      return res.json({
        message: 'No knowledge states found. Start learning to get recommendations.'
      });
    }
    
    const masteryThreshold = parseFloat(process.env.BKT_MASTERY_THRESHOLD) || 0.95;
    
    // Find unmastered skills
    const unmasteredSkills = knowledgeStates.filter(
      state => parseFloat(state.PKnown) < masteryThreshold
    );
    
    if (unmasteredSkills.length === 0) {
      return res.json({
        message: 'All skills mastered! Excellent work!',
        recommendation: null
      });
    }
    
    // Recommend skill with lowest proficiency
    const recommendation = unmasteredSkills[0];
    
    res.json({
      recommendation: {
        skillName: recommendation.SkillName,
        currentProficiency: parseFloat(recommendation.PKnown),
        masteryThreshold,
        reason: 'This skill needs the most practice'
      }
    });
    
  } catch (error) {
    console.error('Get recommendation error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get recommendation'
    });
  }
};

// Batch update BKT for multiple skill-tagged questions after an assessment
const batchUpdateKnowledge = async (req, res) => {
  const connection = await getConnection();
  
  try {
    await connection.beginTransaction();
    
    const userId = req.user.userId;
    const { answers } = req.body;
    // answers = [{ skill: 'Memorization', isCorrect: true }, ...]
    
    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ error: 'Bad Request', message: 'answers array is required' });
    }
    
    // Group answers by skill
    const skillAnswers = {};
    for (const answer of answers) {
      const skill = answer.skill || 'Memorization';
      if (!skillAnswers[skill]) {
        skillAnswers[skill] = [];
      }
      skillAnswers[skill].push(answer.isCorrect);
    }
    
    const masteryThreshold = parseFloat(process.env.BKT_MASTERY_THRESHOLD) || 0.95;
    const results = [];
    
    for (const [skillName, correctnessArray] of Object.entries(skillAnswers)) {
      // Get or create BKT record for this skill
      const [existing] = await connection.execute(
        'SELECT * FROM bkt_model WHERE UserID = ? AND SkillName = ?',
        [userId, skillName]
      );
      
      const skillParams = getSkillParams(skillName);
      let currentPKnown;
      let previousPKnown;
      
      if (existing.length === 0) {
        // Initialize with default pKnown
        currentPKnown = 0.10;
        await connection.execute(
          `INSERT INTO bkt_model (UserID, SkillName, PKnown, PLearn, PSlip, PGuess) VALUES (?, ?, ?, ?, ?, ?)`,
          [userId, skillName, currentPKnown, skillParams.pLearn, skillParams.pSlip, skillParams.pGuess]
        );
      } else {
        currentPKnown = parseFloat(existing[0].PKnown);
        // Update stored params to match skill-specific values
        await connection.execute(
          'UPDATE bkt_model SET PLearn = ?, PSlip = ?, PGuess = ? WHERE UserID = ? AND SkillName = ?',
          [skillParams.pLearn, skillParams.pSlip, skillParams.pGuess, userId, skillName]
        );
      }
      
      previousPKnown = currentPKnown;
      
      // Process each answer for this skill
      for (const isCorrect of correctnessArray) {
        currentPKnown = updateKnowledgeState(
          currentPKnown,
          skillParams.pLearn,
          skillParams.pSlip,
          skillParams.pGuess,
          isCorrect
        );
      }
      
      // Save updated PKnown
      await connection.execute(
        'UPDATE bkt_model SET PKnown = ?, updated_at = CURRENT_TIMESTAMP WHERE UserID = ? AND SkillName = ?',
        [currentPKnown, userId, skillName]
      );
      
      results.push({
        skillName,
        previousPKnown,
        newPKnown: currentPKnown,
        isMastered: currentPKnown >= masteryThreshold,
        questionsAnswered: correctnessArray.length,
        correctCount: correctnessArray.filter(Boolean).length
      });
    }
    
    await connection.commit();
    connection.release();
    
    res.json({
      message: 'Knowledge states updated',
      masteryThreshold,
      skills: results
    });
    
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Batch update knowledge error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update knowledge states'
    });
  }
};

module.exports = {
  getUserKnowledgeStates,
  getSkillKnowledgeState,
  initializeSkillKnowledge,
  updateKnowledge,
  getRecommendation,
  batchUpdateKnowledge
};
