// Assessment Controller
// Handles assessment creation, submission, and grading

const { query, getConnection } = require('../config/database');

// Create new assessment
const createAssessment = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { assessmentType } = req.body;
    
    const result = await query(
      'INSERT INTO assessment (UserID, AssessmentType, ResultStatus) VALUES (?, ?, ?)',
      [userId, assessmentType, 'In Progress']
    );
    
    const newAssessment = await query(
      'SELECT * FROM assessment WHERE AssessmentID = ?',
      [result.insertId]
    );
    
    res.status(201).json({
      message: 'Assessment started',
      assessment: newAssessment[0]
    });
    
  } catch (error) {
    console.error('Create assessment error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create assessment'
    });
  }
};

// Submit answer to question
const submitAnswer = async (req, res) => {
  const connection = await getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { assessmentId, questionId, userAnswer } = req.body;
    const userId = req.user.userId;
    
    // Verify assessment belongs to user
    const assessments = await connection.execute(
      'SELECT UserID FROM assessment WHERE AssessmentID = ?',
      [assessmentId]
    );
    
    if (assessments[0].length === 0 || assessments[0][0].UserID !== userId) {
      await connection.rollback();
      connection.release();
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Access denied to this assessment'
      });
    }
    
    // Get correct answer
    const questions = await connection.execute(
      'SELECT CorrectAnswer FROM question WHERE QuestionID = ?',
      [questionId]
    );
    
    if (questions[0].length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({
        error: 'Not Found',
        message: 'Question not found'
      });
    }
    
    const correctAnswer = questions[0][0].CorrectAnswer;
    const isCorrect = userAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
    
    // Insert answer
    await connection.execute(
      'INSERT INTO user_answer (AssessmentID, QuestionID, UserAnswer, IsCorrect) VALUES (?, ?, ?, ?)',
      [assessmentId, questionId, userAnswer, isCorrect]
    );
    
    await connection.commit();
    connection.release();
    
    res.json({
      message: 'Answer submitted successfully',
      isCorrect,
      correctAnswer: isCorrect ? null : correctAnswer // Only reveal if incorrect
    });
    
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Submit answer error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to submit answer'
    });
  }
};

// Complete assessment and calculate score
const completeAssessment = async (req, res) => {
  const connection = await getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { id } = req.params;
    const userId = req.user.userId;
    
    // Verify assessment belongs to user
    const assessments = await connection.execute(
      'SELECT AssessmentID FROM assessment WHERE AssessmentID = ? AND UserID = ?',
      [id, userId]
    );
    
    if (assessments[0].length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({
        error: 'Not Found',
        message: 'Assessment not found'
      });
    }
    
    // Calculate score
    const [answers] = await connection.execute(
      'SELECT COUNT(*) as total, SUM(CASE WHEN IsCorrect = 1 THEN 1 ELSE 0 END) as correct FROM user_answer WHERE AssessmentID = ?',
      [id]
    );
    
    const totalQuestions = answers[0].total;
    const correctAnswers = answers[0].correct || 0;
    const score = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;
    const resultStatus = score >= 60 ? 'Pass' : 'Fail'; // 60% passing rate
    
    // Update assessment
    await connection.execute(
      'UPDATE assessment SET TotalScore = ?, ResultStatus = ? WHERE AssessmentID = ?',
      [score.toFixed(2), resultStatus, id]
    );
    
    await connection.commit();
    connection.release();
    
    res.json({
      message: 'Assessment completed',
      totalQuestions,
      correctAnswers,
      score: parseFloat(score.toFixed(2)),
      resultStatus
    });
    
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Complete assessment error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to complete assessment'
    });
  }
};

// Get user assessments
const getUserAssessments = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const assessments = await query(
      'SELECT * FROM assessment WHERE UserID = ? ORDER BY DateTaken DESC',
      [userId]
    );
    
    res.json(assessments);
    
  } catch (error) {
    console.error('Get user assessments error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch assessments'
    });
  }
};

// Get assessment details
const getAssessmentDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    
    // Get assessment
    const assessments = await query(
      'SELECT * FROM assessment WHERE AssessmentID = ? AND UserID = ?',
      [id, userId]
    );
    
    if (assessments.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Assessment not found'
      });
    }
    
    // Get answers
    const answers = await query(
      `SELECT ua.*, q.QuestionText, q.CorrectAnswer 
       FROM user_answer ua 
       JOIN question q ON ua.QuestionID = q.QuestionID 
       WHERE ua.AssessmentID = ?`,
      [id]
    );
    
    res.json({
      assessment: assessments[0],
      answers
    });
    
  } catch (error) {
    console.error('Get assessment details error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch assessment details'
    });
  }
};

module.exports = {
  createAssessment,
  submitAnswer,
  completeAssessment,
  getUserAssessments,
  getAssessmentDetails
};
