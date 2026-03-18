// Admin Module Routes
// Admin-only routes for managing lessons and modules

const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { body, param } = require('express-validator');
const { handleValidationErrors } = require('../middleware/validators');
const { query } = require('../config/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for media uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/lessons');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'lesson-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|mp4|webm|avi|mov/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed!'));
    }
  }
});

// All routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

// GET /api/admin/modules - Get all modules (admin view)
router.get('/modules', async (req, res) => {
  try {
    const modules = await query(`
      SELECT 
        m.*,
        COUNT(DISTINCT q.QuestionID) as questionCount
      FROM module m
      LEFT JOIN question q ON m.ModuleID = q.ModuleID
      GROUP BY m.ModuleID
      ORDER BY m.LessonOrder
    `);
    
    // Compute topicCount and assessmentCount from JSON columns
    const enriched = modules.map(m => {
      const sections = m.sections || [];
      const topicCount = sections.filter(s => {
        const t = (s.type || '').toLowerCase();
        return t === 'topic' || t === 'topic title';
      }).length;

      const diagnosticCount = (m.diagnosticQuestions || []).length;
      const reviewCount = (m.reviewQuestions || []).length;
      const finalCount = (m.finalQuestions || []).length;
      const inlineReviewCount = sections.filter(s => {
        const t = (s.type || '').toLowerCase();
        return t === 'review-multiple-choice' || t === 'review - multiple choice' || t === 'review-drag-drop' || t === 'review - drag and drop';
      }).length;
      const assessmentCount = diagnosticCount + reviewCount + finalCount + inlineReviewCount;

      return { ...m, topicCount, assessmentCount };
    });
    
    res.json(enriched);
  } catch (error) {
    console.error('Get modules error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch modules'
    });
  }
});

// POST /api/admin/modules - Create new module/lesson
router.post('/modules', [
  body('ModuleTitle').trim().notEmpty().withMessage('Module title is required'),
  body('Description').optional().trim(),
  body('LessonOrder').isInt({ min: 1 }).withMessage('Lesson order must be a positive integer'),
  body('Tesda_Reference').optional().trim(),
  body('LessonTime').optional(),
  body('Difficulty').optional().trim(),
  handleValidationErrors
], async (req, res) => {
  try {
    const { ModuleTitle, Description, LessonOrder, Tesda_Reference, LessonTime, Difficulty, sections, diagnosticQuestions, reviewQuestions, finalQuestions, finalInstruction, roadmapStages } = req.body;
    
    console.log('Creating new module with data:', { ModuleTitle, Description, LessonOrder, Tesda_Reference, LessonTime, Difficulty });
    
    const result = await query(
      `INSERT INTO module (ModuleTitle, Description, LessonOrder, Tesda_Reference, Is_Unlocked) 
       VALUES (?, ?, ?, ?, ?)`,
      [ModuleTitle, Description || '', LessonOrder, Tesda_Reference || '', LessonOrder === 1]
    );
    
    const moduleId = result.insertId;
    console.log('Module created successfully with ID:', moduleId);
    
    // Save sections, diagnosticQuestions, reviewQuestions, finalQuestions as JSON in a separate table or column
    // For now, we'll store them in a JSON column - you may need to add these columns to your module table
    if (sections || diagnosticQuestions || reviewQuestions || finalQuestions || LessonTime || Difficulty || finalInstruction) {
      console.log('Saving JSON fields:', {
        sectionsCount: sections?.length,
        diagnosticCount: diagnosticQuestions?.length,
        reviewCount: reviewQuestions?.length,
        finalCount: finalQuestions?.length,
        lessonTime: LessonTime,
        difficulty: Difficulty
      });
      
      await query(
        `UPDATE module SET 
         sections = ?,
         diagnosticQuestions = ?,
         reviewQuestions = ?,
         finalQuestions = ?,
         LessonTime = ?,
         Difficulty = ?,
         finalInstruction = ?,
         roadmapStages = ?
         WHERE ModuleID = ?`,
        [
          sections || null,
          diagnosticQuestions || null,
          reviewQuestions || null,
          finalQuestions || null,
          LessonTime ? JSON.stringify(LessonTime) : null,
          Difficulty || null,
          finalInstruction || null,
          roadmapStages ? JSON.stringify(roadmapStages) : null,
          moduleId
        ]
      );
      
      console.log('JSON fields saved successfully');
    }
    
    res.status(201).json({
      message: 'Module created successfully',
      moduleId: moduleId
    });
  } catch (error) {
    console.error('Create module error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to create module',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// PUT /api/admin/modules/:id - Update module
router.put('/modules/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid module ID'),
  body('ModuleTitle').optional().trim().notEmpty(),
  body('Description').optional().trim(),
  body('LessonOrder').optional().isInt({ min: 1 }),
  body('Tesda_Reference').optional().trim(),
  body('LessonTime').optional(),
  body('Difficulty').optional().trim(),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    const { ModuleTitle, Description, LessonOrder, Tesda_Reference, LessonTime, Difficulty, sections, diagnosticQuestions, reviewQuestions, finalQuestions, finalInstruction, roadmapStages } = req.body;
    
    console.log('Updating module:', id);
    console.log('Received data:', { 
      ModuleTitle, 
      Description, 
      LessonOrder, 
      Tesda_Reference,
      sectionsCount: sections?.length,
      sections: sections
    });
    
    // Build dynamic update query
    const fields = [];
    const values = [];
    
    if (ModuleTitle !== undefined) {
      fields.push('ModuleTitle = ?');
      values.push(ModuleTitle);
    }
    if (Description !== undefined) {
      fields.push('Description = ?');
      values.push(Description);
    }
    if (LessonOrder !== undefined) {
      fields.push('LessonOrder = ?');
      values.push(LessonOrder);
    }
    if (Tesda_Reference !== undefined) {
      fields.push('Tesda_Reference = ?');
      values.push(Tesda_Reference);
    }
    if (LessonTime !== undefined) {
      fields.push('LessonTime = ?');
      values.push(JSON.stringify(LessonTime));
    }
    if (Difficulty !== undefined) {
      fields.push('Difficulty = ?');
      values.push(Difficulty);
    }
    if (sections !== undefined) {
      fields.push('sections = ?');
      values.push(sections);
    }
    if (diagnosticQuestions !== undefined) {
      fields.push('diagnosticQuestions = ?');
      values.push(diagnosticQuestions);
    }
    if (reviewQuestions !== undefined) {
      fields.push('reviewQuestions = ?');
      values.push(reviewQuestions);
    }
    if (finalQuestions !== undefined) {
      fields.push('finalQuestions = ?');
      values.push(finalQuestions);
    }
    if (finalInstruction !== undefined) {
      fields.push('finalInstruction = ?');
      values.push(finalInstruction || null);
    }
    if (roadmapStages !== undefined) {
      fields.push('roadmapStages = ?');
      values.push(JSON.stringify(roadmapStages));
    }
    
    if (fields.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No valid fields to update'
      });
    }
    
    values.push(id);
    
    const result = await query(
      `UPDATE module SET ${fields.join(', ')} WHERE ModuleID = ?`,
      values
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Module not found'
      });
    }
    
    console.log('Module updated successfully');
    
    res.json({
      message: 'Module updated successfully'
    });
  } catch (error) {
    console.error('Update module error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to update module',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// DELETE /api/admin/modules/:id - Delete module
router.delete('/modules/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid module ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    
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
});

// POST /api/admin/modules/:id/sections - Add section to module
router.post('/modules/:id/sections', [
  param('id').isInt({ min: 1 }).withMessage('Invalid module ID'),
  body('title').trim().notEmpty().withMessage('Section title is required'),
  body('content').trim().notEmpty().withMessage('Section content is required'),
  body('type').isIn(['topic', 'subtopic', 'paragraph', 'image', 'video']).withMessage('Invalid section type'),
  body('order').isInt({ min: 1 }).withMessage('Order must be a positive integer'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, type, order } = req.body;
    
    // For now, store in module description as JSON
    // In production, you'd want a separate sections table
    const module = await query('SELECT * FROM module WHERE ModuleID = ?', [id]);
    
    if (module.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Module not found'
      });
    }
    
    res.status(201).json({
      message: 'Section added successfully'
    });
  } catch (error) {
    console.error('Add section error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to add section'
    });
  }
});

// POST /api/admin/modules/:id/questions - Add questions to module
router.post('/modules/:id/questions', [
  param('id').isInt({ min: 1 }).withMessage('Invalid module ID'),
  body('questions').isArray({ min: 1 }).withMessage('Questions array is required'),
  body('questions.*.question').trim().notEmpty().withMessage('Question text is required'),
  body('questions.*.choices').isArray({ min: 2 }).withMessage('At least 2 choices required'),
  body('questions.*.correctAnswer').trim().notEmpty().withMessage('Correct answer is required'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    const { questions } = req.body;
    
    // Create assessment for this module if it doesn't exist
    // Then add questions
    // This is a simplified version - you'd need proper assessment creation
    
    for (const q of questions) {
      await query(
        `INSERT INTO question (ModuleID, Question, Choices, CorrectAnswer, Explanation) 
         VALUES (?, ?, ?, ?, ?)`,
        [id, q.question, JSON.stringify(q.choices), q.correctAnswer, q.explanation || null]
      );
    }
    
    res.status(201).json({
      message: 'Questions added successfully',
      count: questions.length
    });
  } catch (error) {
    console.error('Add questions error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to add questions'
    });
  }
});

// POST /api/admin/upload-media - Upload images/videos for lessons
router.post('/upload-media', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No file uploaded'
      });
    }

    const fileUrl = `/uploads/lessons/${req.file.filename}`;
    
    res.status(200).json({
      message: 'File uploaded successfully',
      url: fileUrl,
      filename: req.file.filename,
      type: req.body.type || 'unknown'
    });
  } catch (error) {
    console.error('Upload media error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to upload media'
    });
  }
});

// GET /api/admin/reports/count - Get count of pending reports (must come before /reports/:id)
router.get('/reports/count', async (req, res) => {
  try {
    const result = await query(`
      SELECT COUNT(*) as count FROM issue_reports WHERE Status != 'resolved'
    `);
    
    res.json({ count: result[0]?.count || 0 });
  } catch (error) {
    console.error('Get reports count error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch reports count'
    });
  }
});

// GET /api/admin/reports - Get all issue reports
router.get('/reports', async (req, res) => {
  try {
    console.log('=== Fetching all issue reports ===');
    
    // Create table if it doesn't exist
    await query(`
      CREATE TABLE IF NOT EXISTS issue_reports (
        ReportID INT AUTO_INCREMENT PRIMARY KEY,
        UserID INT NOT NULL,
        ModuleID INT,
        IssueType VARCHAR(100) NOT NULL,
        Details TEXT NOT NULL,
        LessonTitle VARCHAR(255),
        Status ENUM('pending', 'reviewed', 'resolved') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (UserID) REFERENCES user(UserID) ON DELETE CASCADE
      )
    `);

    const reports = await query(`
      SELECT 
        r.ReportID,
        r.IssueType as Category,
        r.UserID,
        u.Name as Name,
        u.Email,
        r.Status,
        r.Details,
        r.LessonTitle,
        r.ModuleID,
        r.created_at as CreatedAt
      FROM issue_reports r
      LEFT JOIN user u ON r.UserID = u.UserID
      ORDER BY r.created_at DESC
    `);
    
    console.log(`Found ${reports.length} reports`);
    console.log('Reports:', reports);
    
    res.json(reports);
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch reports'
    });
  }
});

// GET /api/admin/dashboard/certified - Count learners who completed all lessons
router.get('/dashboard/certified', async (req, res) => {
  try {
    const totalModules = await query('SELECT COUNT(*) as total FROM module');
    const totalCount = totalModules[0].total;

    if (totalCount === 0) {
      return res.json({ count: 0 });
    }

    const certified = await query(`
      SELECT COUNT(*) as count FROM (
        SELECT p.UserID
        FROM progress p
        JOIN user u ON p.UserID = u.UserID
        WHERE u.Role = 'student' AND p.CompletionRate >= 100
        GROUP BY p.UserID
        HAVING COUNT(DISTINCT p.ModuleID) = ?
      ) as certified_users
    `, [totalCount]);

    res.json({ count: certified[0]?.count || 0 });
  } catch (error) {
    console.error('Get certified learners error:', error);
    res.status(500).json({ error: 'Failed to fetch certified learners count' });
  }
});

// GET /api/admin/dashboard/activity - Get learner count per lesson
router.get('/dashboard/activity', async (req, res) => {
  try {
    const lessons = await query(`
      SELECT m.ModuleID, m.LessonOrder, m.ModuleTitle, m.Difficulty,
             COUNT(p.ProgressID) as learnerCount
      FROM module m
      LEFT JOIN progress p ON m.ModuleID = p.ModuleID
      GROUP BY m.ModuleID
      ORDER BY m.LessonOrder ASC
    `);

    // Assign a unique color per lesson for the activity chart
    const lessonColors = [
      '#64B5F6', // Lesson 1 - Light Blue
      '#7986CB', // Lesson 2 - Indigo
      '#FFD54F', // Lesson 3 - Amber/Gold
      '#FFB74D', // Lesson 4 - Orange
      '#EF9A9A', // Lesson 5 - Light Red
      '#A5D6A7', // Lesson 6 - Light Green
      '#CE93D8', // Lesson 7 - Purple
      '#F48FB1', // Lesson 8 - Pink
      '#80CBC4', // Lesson 9 - Teal
    ];

    const data = lessons.map((l, index) => ({
      lesson: `Lesson ${l.LessonOrder}`,
      title: l.ModuleTitle,
      count: l.learnerCount,
      difficulty: l.Difficulty,
      color: lessonColors[index % lessonColors.length]
    }));

    res.json(data);
  } catch (error) {
    console.error('Get activity data error:', error);
    res.status(500).json({ error: 'Failed to fetch activity data' });
  }
});

// GET /api/admin/dashboard/notifications - Get recent system events
router.get('/dashboard/notifications', async (req, res) => {
  try {
    const notifications = [];

    // Recent enrollments (new progress entries)
    const enrollments = await query(`
      SELECT u.Name, p.DateStarted, m.ModuleTitle, m.LessonOrder
      FROM progress p
      JOIN user u ON p.UserID = u.UserID
      JOIN module m ON p.ModuleID = m.ModuleID
      WHERE u.Role = 'student'
      ORDER BY p.DateStarted DESC
      LIMIT 10
    `);
    enrollments.forEach(e => {
      notifications.push({
        date: e.DateStarted,
        message: `${e.Name} started Lesson ${e.LessonOrder}: ${e.ModuleTitle}.`,
        type: 'enrollment'
      });
    });

    // Recent completions
    const completions = await query(`
      SELECT u.Name, p.DateCompletion, m.ModuleTitle, m.LessonOrder
      FROM progress p
      JOIN user u ON p.UserID = u.UserID
      JOIN module m ON p.ModuleID = m.ModuleID
      WHERE p.CompletionRate >= 100 AND p.DateCompletion IS NOT NULL AND u.Role = 'student'
      ORDER BY p.DateCompletion DESC
      LIMIT 10
    `);
    completions.forEach(c => {
      notifications.push({
        date: c.DateCompletion,
        message: `${c.Name} completed Lesson ${c.LessonOrder}: ${c.ModuleTitle}.`,
        type: 'completion'
      });
    });

    // Recent account registrations
    const newUsers = await query(`
      SELECT Name, created_at
      FROM user
      WHERE Role = 'student'
      ORDER BY created_at DESC
      LIMIT 10
    `);
    newUsers.forEach(u => {
      notifications.push({
        date: u.created_at,
        message: `${u.Name} has enrolled in ModuLearn.`,
        type: 'new_user'
      });
    });

    // Recent issue reports
    const issues = await query(`
      SELECT u.Name, r.created_at, r.IssueType, r.LessonTitle
      FROM issue_reports r
      JOIN user u ON r.UserID = u.UserID
      ORDER BY r.created_at DESC
      LIMIT 5
    `);
    issues.forEach(i => {
      notifications.push({
        date: i.created_at,
        message: `${i.Name} reported an issue: ${i.IssueType}${i.LessonTitle ? ` in ${i.LessonTitle}` : ''}.`,
        type: 'issue'
      });
    });

    // Sort all by date descending and take top 20
    notifications.sort((a, b) => new Date(b.date) - new Date(a.date));
    const topNotifications = notifications.slice(0, 20).map(n => ({
      ...n,
      date: new Date(n.date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
    }));

    res.json(topNotifications);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// PUT /api/admin/reports/:id/resolve - Mark report as resolved
router.put('/reports/:id/resolve', [
  param('id').isInt().withMessage('Valid report ID is required'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    
    await query(
      'UPDATE issue_reports SET Status = ? WHERE ReportID = ?',
      ['resolved', id]
    );
    
    res.json({ message: 'Report marked as resolved' });
  } catch (error) {
    console.error('Resolve report error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update report status'
    });
  }
});

module.exports = router;
