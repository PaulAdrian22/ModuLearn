// Learning Skill Controller
// Handles learning skill evaluation and tracking

const { query } = require('../config/database');

// Get user's learning skills
const getUserLearningSkills = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const skills = await query(
      `SELECT ls.*, a.AssessmentType, a.DateTaken 
       FROM learning_skill ls 
       JOIN assessment a ON ls.AssessmentID = a.AssessmentID 
       WHERE ls.UserID = ? 
       ORDER BY ls.EvaluationDate DESC`,
      [userId]
    );
    
    res.json(skills);
    
  } catch (error) {
    console.error('Get learning skills error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch learning skills'
    });
  }
};

// Get skills by category
const getSkillsByCategory = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { category } = req.params;
    
    const skills = await query(
      `SELECT ls.*, a.AssessmentType, a.DateTaken 
       FROM learning_skill ls 
       JOIN assessment a ON ls.AssessmentID = a.AssessmentID 
       WHERE ls.UserID = ? AND ls.SkillCategory = ? 
       ORDER BY ls.EvaluationDate DESC`,
      [userId, category]
    );
    
    res.json(skills);
    
  } catch (error) {
    console.error('Get skills by category error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch skills by category'
    });
  }
};

// Create learning skill evaluation
const createSkillEvaluation = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { assessmentId, skillCategory, scorePercentage } = req.body;
    
    // Verify assessment belongs to user
    const assessments = await query(
      'SELECT UserID FROM assessment WHERE AssessmentID = ?',
      [assessmentId]
    );
    
    if (assessments.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Assessment not found'
      });
    }
    
    if (assessments[0].UserID !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Access denied to this assessment'
      });
    }
    
    // Insert skill evaluation
    const result = await query(
      'INSERT INTO learning_skill (UserID, AssessmentID, SkillCategory, ScorePercentage) VALUES (?, ?, ?, ?)',
      [userId, assessmentId, skillCategory, scorePercentage]
    );
    
    const newSkill = await query(
      'SELECT * FROM learning_skill WHERE SkillID = ?',
      [result.insertId]
    );
    
    res.status(201).json({
      message: 'Skill evaluation created',
      skill: newSkill[0]
    });
    
  } catch (error) {
    console.error('Create skill evaluation error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create skill evaluation'
    });
  }
};

// Get skill analytics (average per category)
const getSkillAnalytics = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const analytics = await query(
      `SELECT 
        SkillCategory,
        AVG(ScorePercentage) as avgScore,
        COUNT(*) as evaluationCount,
        MAX(ScorePercentage) as maxScore,
        MIN(ScorePercentage) as minScore,
        MAX(EvaluationDate) as lastEvaluation
       FROM learning_skill 
       WHERE UserID = ? 
       GROUP BY SkillCategory`,
      [userId]
    );
    
    // Format the results
    const formattedAnalytics = analytics.map(row => ({
      skillCategory: row.SkillCategory,
      averageScore: parseFloat(row.avgScore).toFixed(2),
      evaluationCount: row.evaluationCount,
      maxScore: parseFloat(row.maxScore).toFixed(2),
      minScore: parseFloat(row.minScore).toFixed(2),
      lastEvaluation: row.lastEvaluation,
      proficiencyLevel: getProficiencyLevel(row.avgScore)
    }));
    
    res.json(formattedAnalytics);
    
  } catch (error) {
    console.error('Get skill analytics error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch skill analytics'
    });
  }
};

// Helper function to determine proficiency level
const getProficiencyLevel = (score) => {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Very Good';
  if (score >= 70) return 'Good';
  if (score >= 60) return 'Satisfactory';
  return 'Needs Improvement';
};

module.exports = {
  getUserLearningSkills,
  getSkillsByCategory,
  createSkillEvaluation,
  getSkillAnalytics
};
