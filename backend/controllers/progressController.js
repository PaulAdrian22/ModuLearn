// Progress Controller
// Handles user progress tracking

const { query, getConnection } = require('../config/database');

// Get user progress for all modules
const getUserProgress = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const progress = await query(
      `SELECT p.*, m.ModuleTitle, m.LessonOrder, m.Description 
       FROM progress p 
       JOIN module m ON p.ModuleID = m.ModuleID 
       WHERE p.UserID = ? 
       ORDER BY m.LessonOrder`,
      [userId]
    );
    
    res.json(progress);
    
  } catch (error) {
    console.error('Get user progress error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch progress'
    });
  }
};

// Get progress for specific module
const getModuleProgress = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { moduleId } = req.params;
    
    const progress = await query(
      `SELECT p.*, m.ModuleTitle, m.LessonOrder 
       FROM progress p 
       JOIN module m ON p.ModuleID = m.ModuleID 
       WHERE p.UserID = ? AND p.ModuleID = ?`,
      [userId, moduleId]
    );
    
    if (progress.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Progress record not found'
      });
    }
    
    res.json(progress[0]);
    
  } catch (error) {
    console.error('Get module progress error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch module progress'
    });
  }
};

// Start module (create progress record)
const startModule = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { moduleId } = req.body;
    
    // Check if module exists
    const modules = await query(
      'SELECT ModuleID, Is_Unlocked FROM module WHERE ModuleID = ?',
      [moduleId]
    );
    
    if (modules.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Module not found'
      });
    }
    
    if (!modules[0].Is_Unlocked) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Module is locked'
      });
    }
    
    // Check if progress already exists
    const existingProgress = await query(
      'SELECT ProgressID FROM progress WHERE UserID = ? AND ModuleID = ?',
      [userId, moduleId]
    );
    
    if (existingProgress.length > 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Module already started'
      });
    }
    
    // Create progress record
    const result = await query(
      'INSERT INTO progress (UserID, ModuleID, CompletionRate, DateStarted) VALUES (?, ?, 0, CURRENT_TIMESTAMP)',
      [userId, moduleId]
    );
    
    const newProgress = await query(
      'SELECT * FROM progress WHERE ProgressID = ?',
      [result.insertId]
    );
    
    res.status(201).json({
      message: 'Module started',
      progress: newProgress[0]
    });
    
  } catch (error) {
    console.error('Start module error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to start module'
    });
  }
};

// Update module progress
const updateProgress = async (req, res) => {
  const connection = await getConnection();
  
  try {
    await connection.beginTransaction();
    
    const userId = req.user.userId;
    const { moduleId, completionRate } = req.body;
    
    // Get progress record
    const [progress] = await connection.execute(
      'SELECT ProgressID, CompletionRate FROM progress WHERE UserID = ? AND ModuleID = ?',
      [userId, moduleId]
    );
    
    if (progress.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({
        error: 'Not Found',
        message: 'Progress record not found. Start the module first.'
      });
    }
    
    // Update progress
    const isCompleted = completionRate >= 100;
    const dateCompletion = isCompleted ? 'CURRENT_TIMESTAMP' : 'NULL';
    
    await connection.execute(
      `UPDATE progress SET CompletionRate = ?, DateCompletion = ${isCompleted ? 'CURRENT_TIMESTAMP' : 'NULL'} WHERE UserID = ? AND ModuleID = ?`,
      [completionRate, userId, moduleId]
    );
    
    // If module completed, unlock next module
    if (isCompleted) {
      const [currentModule] = await connection.execute(
        'SELECT LessonOrder FROM module WHERE ModuleID = ?',
        [moduleId]
      );
      
      if (currentModule.length > 0) {
        const nextOrder = currentModule[0].LessonOrder + 1;
        
        await connection.execute(
          'UPDATE module SET Is_Unlocked = TRUE WHERE LessonOrder = ?',
          [nextOrder]
        );
      }
    }
    
    await connection.commit();
    connection.release();
    
    const updatedProgress = await query(
      'SELECT * FROM progress WHERE UserID = ? AND ModuleID = ?',
      [userId, moduleId]
    );
    
    res.json({
      message: 'Progress updated successfully',
      progress: updatedProgress[0],
      moduleCompleted: isCompleted
    });
    
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Update progress error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update progress'
    });
  }
};

module.exports = {
  getUserProgress,
  getModuleProgress,
  startModule,
  updateProgress
};
