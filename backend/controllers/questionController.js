// Question Controller
// Handles CRUD operations for questions

const { query } = require('../config/database');

// Get all questions
const getAllQuestions = async (req, res) => {
  try {
    const { moduleId } = req.query;
    
    let sql = 'SELECT * FROM question';
    const params = [];
    
    if (moduleId) {
      sql += ' WHERE ModuleID = ?';
      params.push(moduleId);
    }
    
    sql += ' ORDER BY QuestionID';
    
    const questions = await query(sql, params);
    res.json(questions);
    
  } catch (error) {
    console.error('Get questions error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch questions'
    });
  }
};

// Get question by ID
const getQuestionById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const questions = await query(
      'SELECT * FROM question WHERE QuestionID = ?',
      [id]
    );
    
    if (questions.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Question not found'
      });
    }
    
    res.json(questions[0]);
    
  } catch (error) {
    console.error('Get question error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch question'
    });
  }
};

// Create new question
const createQuestion = async (req, res) => {
  try {
    const { moduleId, questionText, correctAnswer } = req.body;
    
    // Verify module exists
    const modules = await query(
      'SELECT ModuleID FROM module WHERE ModuleID = ?',
      [moduleId]
    );
    
    if (modules.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Module not found'
      });
    }
    
    const result = await query(
      'INSERT INTO question (ModuleID, QuestionText, CorrectAnswer) VALUES (?, ?, ?)',
      [moduleId, questionText, correctAnswer]
    );
    
    const newQuestion = await query(
      'SELECT * FROM question WHERE QuestionID = ?',
      [result.insertId]
    );
    
    res.status(201).json({
      message: 'Question created successfully',
      question: newQuestion[0]
    });
    
  } catch (error) {
    console.error('Create question error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create question'
    });
  }
};

// Update question
const updateQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const { moduleId, questionText, correctAnswer } = req.body;
    
    // Check if question exists
    const existingQuestion = await query(
      'SELECT QuestionID FROM question WHERE QuestionID = ?',
      [id]
    );
    
    if (existingQuestion.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Question not found'
      });
    }
    
    await query(
      'UPDATE question SET ModuleID = ?, QuestionText = ?, CorrectAnswer = ? WHERE QuestionID = ?',
      [moduleId, questionText, correctAnswer, id]
    );
    
    const updatedQuestion = await query(
      'SELECT * FROM question WHERE QuestionID = ?',
      [id]
    );
    
    res.json({
      message: 'Question updated successfully',
      question: updatedQuestion[0]
    });
    
  } catch (error) {
    console.error('Update question error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update question'
    });
  }
};

// Delete question
const deleteQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    
    const existingQuestion = await query(
      'SELECT QuestionID FROM question WHERE QuestionID = ?',
      [id]
    );
    
    if (existingQuestion.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Question not found'
      });
    }
    
    await query('DELETE FROM question WHERE QuestionID = ?', [id]);
    
    res.json({
      message: 'Question deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete question error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete question'
    });
  }
};

module.exports = {
  getAllQuestions,
  getQuestionById,
  createQuestion,
  updateQuestion,
  deleteQuestion
};
