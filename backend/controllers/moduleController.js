// Module Controller
// Handles CRUD operations for learning modules

const { query } = require('../config/database');

// Get all modules
const getAllModules = async (req, res) => {
  try {
    const { userId } = req.query;
    
    let sql = `
      SELECT 
        m.ModuleID,
        m.ModuleTitle,
        m.Description,
        m.LessonOrder,
        m.Tesda_Reference,
        m.Is_Unlocked,
        m.Difficulty
    `;
    
    // If userId provided, include progress
    if (userId) {
      sql += `,
        p.ProgressID,
        p.CompletionRate,
        p.DateStarted,
        p.DateCompletion
      FROM module m
      LEFT JOIN progress p ON m.ModuleID = p.ModuleID AND p.UserID = ?
      ORDER BY m.LessonOrder`;
      
      const modules = await query(sql, [userId]);
      return res.json(modules);
    }
    
    sql += ' FROM module m ORDER BY m.LessonOrder';
    const modules = await query(sql);
    
    res.json(modules);
    
  } catch (error) {
    console.error('Get modules error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch modules'
    });
  }
};

// Get module by ID
const getModuleById = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;
    
    let sql = `
      SELECT 
        m.ModuleID,
        m.ModuleTitle,
        m.Description,
        m.LessonOrder,
        m.Tesda_Reference,
        m.Is_Unlocked,
        m.sections,
        m.diagnosticQuestions,
        m.reviewQuestions,
        m.finalQuestions,
        m.finalInstruction,
        m.roadmapStages
    `;
    
    if (userId) {
      sql += `,
        p.CompletionRate,
        p.DateStarted,
        p.DateCompletion
      FROM module m
      LEFT JOIN progress p ON m.ModuleID = p.ModuleID AND p.UserID = ?
      WHERE m.ModuleID = ?`;
      
      const modules = await query(sql, [userId, id]);
      
      if (modules.length === 0) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Module not found'
        });
      }
      
      // MySQL JSON columns return objects directly, no need to parse
      const module = modules[0];
      
      // Ensure arrays exist (MySQL returns null for empty JSON fields)
      if (!module.sections) module.sections = [];
      if (!module.diagnosticQuestions) module.diagnosticQuestions = [];
      if (!module.reviewQuestions) module.reviewQuestions = [];
      if (!module.finalQuestions) module.finalQuestions = [];
      
      return res.json(module);
    }
    
    sql += '\n      FROM module m WHERE m.ModuleID = ?';
    const modules = await query(sql, [id]);
    
    if (modules.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Module not found'
      });
    }
    
    // MySQL JSON columns return objects directly, no need to parse
    const module = modules[0];
    
    // Ensure arrays exist (MySQL returns null for empty JSON fields)
    if (!module.sections) module.sections = [];
    if (!module.diagnosticQuestions) module.diagnosticQuestions = [];
    if (!module.reviewQuestions) module.reviewQuestions = [];
    if (!module.finalQuestions) module.finalQuestions = [];
    
    res.json(module);
    
  } catch (error) {
    console.error('Get module error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch module'
    });
  }
};

// Create new module
const createModule = async (req, res) => {
  try {
    const { moduleTitle, description, lessonOrder, tesdaReference, isUnlocked } = req.body;
    
    // Ensure lesson 1 is always unlocked by default
    const shouldUnlock = lessonOrder === 1 ? true : (isUnlocked || false);
    
    const result = await query(
      'INSERT INTO module (ModuleTitle, Description, LessonOrder, Tesda_Reference, Is_Unlocked) VALUES (?, ?, ?, ?, ?)',
      [moduleTitle, description || null, lessonOrder, tesdaReference || null, shouldUnlock]
    );
    
    const newModule = await query(
      'SELECT * FROM module WHERE ModuleID = ?',
      [result.insertId]
    );
    
    res.status(201).json({
      message: 'Module created successfully',
      module: newModule[0]
    });
    
  } catch (error) {
    console.error('Create module error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create module'
    });
  }
};

// Update module
const updateModule = async (req, res) => {
  try {
    const { id } = req.params;
    const { moduleTitle, description, lessonOrder, tesdaReference, isUnlocked } = req.body;
    
    // Check if module exists
    const existingModule = await query(
      'SELECT ModuleID FROM module WHERE ModuleID = ?',
      [id]
    );
    
    if (existingModule.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Module not found'
      });
    }
    
    // Ensure lesson 1 is always unlocked
    const shouldUnlock = lessonOrder === 1 ? true : isUnlocked;
    
    await query(
      'UPDATE module SET ModuleTitle = ?, Description = ?, LessonOrder = ?, Tesda_Reference = ?, Is_Unlocked = ? WHERE ModuleID = ?',
      [moduleTitle, description, lessonOrder, tesdaReference, shouldUnlock, id]
    );
    
    const updatedModule = await query(
      'SELECT * FROM module WHERE ModuleID = ?',
      [id]
    );
    
    res.json({
      message: 'Module updated successfully',
      module: updatedModule[0]
    });
    
  } catch (error) {
    console.error('Update module error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update module'
    });
  }
};

// Delete module
const deleteModule = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if module exists
    const existingModule = await query(
      'SELECT ModuleID FROM module WHERE ModuleID = ?',
      [id]
    );
    
    if (existingModule.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Module not found'
      });
    }
    
    await query('DELETE FROM module WHERE ModuleID = ?', [id]);
    
    res.json({
      message: 'Module deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete module error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete module'
    });
  }
};

// Get module questions
const getModuleQuestions = async (req, res) => {
  try {
    const { id } = req.params;
    
    const questions = await query(
      'SELECT * FROM question WHERE ModuleID = ? ORDER BY QuestionID',
      [id]
    );
    
    res.json(questions);
    
  } catch (error) {
    console.error('Get module questions error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch module questions'
    });
  }
};

module.exports = {
  getAllModules,
  getModuleById,
  createModule,
  updateModule,
  deleteModule,
  getModuleQuestions
};
