// User Controller
// Handles user profile and management

const { query } = require('../config/database');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const {
  getMulterProfileDestination,
  uploadProfileImageFromPath,
  deleteProfileImage
} = require('../utils/uploadStorage');

let sharpLib = null;
const getSharp = () => {
  if (sharpLib !== null) {
    return sharpLib;
  }

  try {
    // Lazy-load sharp so API can still boot in runtimes where native binaries differ.
    sharpLib = require('sharp');
  } catch (error) {
    console.warn('sharp is not available, image resize will be skipped:', error.message);
    sharpLib = false;
  }

  return sharpLib;
};

let userProfileColumnsReady = false;
let activityColumnsReady = false;

const normalizePreferredLanguage = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();

  if (normalized === 'english') return 'English';
  if (normalized === 'taglish' || normalized === 'filipino' || normalized === 'tagalog') return 'Taglish';

  return 'English';
};

const stripHtmlToText = (value = '') => {
  return String(value || '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
};

const ensureUserProfileColumns = async () => {
  if (userProfileColumnsReady) return;

  const existingColumns = await query(
    `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'user'
        AND COLUMN_NAME IN ('preferred_language')`
  );

  const columnSet = new Set(existingColumns.map((column) => String(column.COLUMN_NAME || '')));

  if (!columnSet.has('preferred_language')) {
    await query(
      `ALTER TABLE user
       ADD COLUMN preferred_language VARCHAR(20) NOT NULL DEFAULT 'English' AFTER EducationalBackground`
    );
    console.log('Added preferred_language column to user table.');
  }

  userProfileColumnsReady = true;
};

const ensureActivityTrackingColumns = async () => {
  if (activityColumnsReady) return;

  const [progressColumns, assessmentColumns] = await Promise.all([
    query(
      `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'progress'
          AND COLUMN_NAME = 'ActiveSeconds'`
    ),
    query(
      `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'assessment'
          AND COLUMN_NAME = 'TimeSpentSeconds'`
    )
  ]);

  if (progressColumns.length === 0) {
    await query(
      `ALTER TABLE progress
       ADD COLUMN ActiveSeconds INT NOT NULL DEFAULT 0 AFTER CompletionRate`
    );
    console.log('Added ActiveSeconds column to progress table.');
  }

  if (assessmentColumns.length === 0) {
    await query(
      `ALTER TABLE assessment
       ADD COLUMN TimeSpentSeconds INT NOT NULL DEFAULT 0 AFTER TotalScore`
    );
    console.log('Added TimeSpentSeconds column to assessment table.');
  }

  activityColumnsReady = true;
};

// Get user profile
const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    await ensureUserProfileColumns();
    
    const users = await query(
      'SELECT UserID, Name, Email, Age, EducationalBackground, preferred_language AS preferredLanguage, profile_picture, avatar_type, default_avatar, created_at, last_login FROM user WHERE UserID = ?',
      [userId]
    );
    
    if (users.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found'
      });
    }
    
    res.json(users[0]);
    
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch user profile'
    });
  }
};

// Update user profile
const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    await ensureUserProfileColumns();

    const { name, email, age, educationalBackground, preferredLanguage } = req.body;

    const fields = [];
    const values = [];

    if (name !== undefined) {
      fields.push('Name = ?');
      values.push(String(name).trim());
    }

    if (email !== undefined) {
      fields.push('Email = ?');
      values.push(String(email).trim());
    }

    if (age !== undefined) {
      fields.push('Age = ?');
      values.push(age === null || age === '' ? null : Number(age));
    }

    if (educationalBackground !== undefined) {
      fields.push('EducationalBackground = ?');
      values.push(String(educationalBackground).trim() || null);
    }

    if (preferredLanguage !== undefined) {
      fields.push('preferred_language = ?');
      values.push(normalizePreferredLanguage(preferredLanguage));
    }

    if (fields.length === 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'No valid fields were provided to update'
      });
    }

    values.push(userId);

    await query(`UPDATE user SET ${fields.join(', ')} WHERE UserID = ?`, values);
    
    const updatedUser = await query(
      'SELECT UserID, Name, Email, Age, EducationalBackground, preferred_language AS preferredLanguage FROM user WHERE UserID = ?',
      [userId]
    );
    
    res.json({
      message: 'Profile updated successfully',
      user: updatedUser[0]
    });
    
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Email is already in use'
      });
    }

    console.error('Update user profile error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update profile'
    });
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { currentPassword, newPassword } = req.body;
    
    // Get current password hash
    const users = await query(
      'SELECT Password FROM user WHERE UserID = ?',
      [userId]
    );
    
    if (users.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found'
      });
    }
    
    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, users[0].Password);
    
    if (!isValid) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Current password is incorrect'
      });
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(
      newPassword,
      parseInt(process.env.BCRYPT_ROUNDS) || 10
    );
    
    // Update password
    await query(
      'UPDATE user SET Password = ? WHERE UserID = ?',
      [hashedPassword, userId]
    );
    
    res.json({
      message: 'Password changed successfully'
    });
    
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to change password'
    });
  }
};

// Get user statistics
const getUserStats = async (req, res) => {
  try {
    const userId = req.user.userId;
    await ensureActivityTrackingColumns();

    const [
      totalModules,
      moduleProgress,
      assessmentStats,
      bktStats,
      lessonTimeStats,
      assessmentTimeStats,
      simulationTimeStats
    ] = await Promise.all([
      query(
        `SELECT COUNT(DISTINCT m.LessonOrder) as total
           FROM module m`
      ),
      query(
        `SELECT
            COUNT(*) as started,
            SUM(CASE WHEN lessonProgress.CompletionRate >= 100 THEN 1 ELSE 0 END) as completed,
            AVG(lessonProgress.CompletionRate) as avgProgress
         FROM (
           SELECT
             m.LessonOrder,
             MAX(COALESCE(p.CompletionRate, 0)) as CompletionRate
           FROM progress p
           JOIN module m ON p.ModuleID = m.ModuleID
           WHERE p.UserID = ?
           GROUP BY m.LessonOrder
         ) lessonProgress`,
        [userId]
      ),
      query(
        `SELECT COUNT(*) as total,
                AVG(a.TotalScore) as avgScore,
                SUM(CASE WHEN a.ResultStatus = 'Pass' THEN 1 ELSE 0 END) as passed
           FROM assessment a
          WHERE a.UserID = ?`,
        [userId]
      ),
      query(
        'SELECT COUNT(*) as total, SUM(CASE WHEN PKnown >= 0.95 THEN 1 ELSE 0 END) as mastered FROM bkt_model WHERE UserID = ?',
        [userId]
      ),
      query(
        `SELECT COALESCE(SUM(GREATEST(COALESCE(p.ActiveSeconds, 0), 0)), 0) as lessonSeconds
           FROM progress p
          WHERE p.UserID = ?`,
        [userId]
      ),
      query(
        `SELECT COALESCE(
                  SUM(
                    CASE
                      WHEN COALESCE(a.TimeSpentSeconds, 0) > 0 THEN a.TimeSpentSeconds
                      ELSE COALESCE(ua.totalResponseSeconds, 0)
                    END
                  ),
                  0
                ) as assessmentSeconds
           FROM assessment a
           LEFT JOIN (
             SELECT AssessmentID, COALESCE(SUM(GREATEST(COALESCE(ResponseTime, 0), 0)), 0) as totalResponseSeconds
               FROM user_answer
              GROUP BY AssessmentID
           ) ua ON ua.AssessmentID = a.AssessmentID
          WHERE a.UserID = ?`,
        [userId]
      ),
      query(
        `SELECT COALESCE(SUM(GREATEST(COALESCE(sp.TimeSpent, 0), 0)), 0) as simulationSeconds
           FROM simulation_progress sp
          WHERE sp.UserID = ?`,
        [userId]
      )
    ]);

    const lessonSeconds = Math.max(0, Number(lessonTimeStats[0]?.lessonSeconds || 0));
    const assessmentSeconds = Math.max(0, Number(assessmentTimeStats[0]?.assessmentSeconds || 0));
    const simulationSeconds = Math.max(0, Number(simulationTimeStats[0]?.simulationSeconds || 0));
    const totalTimeSpentMinutes = Math.floor((lessonSeconds + assessmentSeconds + simulationSeconds) / 60);
    
    const started = moduleProgress[0].started || 0;
    const avgProgress = started > 0 ? parseFloat(moduleProgress[0].avgProgress || 0) : 0;
    
    res.json({
      modules: {
        total: totalModules[0].total || 0,
        completed: parseInt(moduleProgress[0].completed) || 0
      },
      assessments: {
        total: assessmentStats[0].total || 0,
        passed: assessmentStats[0].passed || 0,
        averageScore: parseFloat(assessmentStats[0].avgScore || 0).toFixed(2)
      },
      skills: {
        total: bktStats[0].total || 0,
        mastered: parseInt(bktStats[0].mastered) || 0
      },
      averageProgress: Math.round(avgProgress),
      timeSpentMinutes: totalTimeSpentMinutes
    });
    
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch user statistics'
    });
  }
};

// Get detailed learning progress summary for Skills & Mastery page
const getLearningProgressSummary = async (req, res) => {
  try {
    const userId = req.user.userId;
    await ensureActivityTrackingColumns();

    const [
      lessonTotals,
      progressTotals,
      assessmentByType,
      moduleAssessmentStats,
      masteryStats,
      assessmentTimeTotals,
      simulationTimeTotals
    ] = await Promise.all([
      query(
        `SELECT COUNT(DISTINCT LessonOrder) as totalLessons
           FROM module`
      ),
      query(
        `SELECT
          COUNT(*) as startedLessons,
          SUM(CASE WHEN lessonProgress.CompletionRate >= 100 THEN 1 ELSE 0 END) as completedLessons,
          COALESCE(SUM(lessonProgress.CompletionRate), 0) as totalCompletionRate,
          AVG(lessonProgress.CompletionRate) as avgCompletionRate,
          COALESCE(SUM(lessonProgress.ActiveSeconds), 0) as lessonActiveSeconds
         FROM (
           SELECT
             m.LessonOrder,
             MAX(COALESCE(p.CompletionRate, 0)) as CompletionRate,
             COALESCE(SUM(GREATEST(COALESCE(p.ActiveSeconds, 0), 0)), 0) as ActiveSeconds
           FROM progress p
           JOIN module m ON p.ModuleID = m.ModuleID
           WHERE p.UserID = ?
           GROUP BY m.LessonOrder
         ) lessonProgress`,
        [userId]
      ),
      query(
        `SELECT LOWER(a.AssessmentType) as assessmentType, COUNT(*) as totalTaken, AVG(a.TotalScore) as averageScore
         FROM assessment a
         WHERE a.UserID = ?
         GROUP BY LOWER(a.AssessmentType)`,
        [userId]
      ),
      query(
        `SELECT m.LessonOrder, MAX(m.ModuleTitle) as ModuleTitle, AVG(a.TotalScore) as averageScore
         FROM assessment a
         JOIN module m ON m.ModuleID = a.ModuleID
         WHERE a.UserID = ? AND a.ModuleID IS NOT NULL
         GROUP BY m.LessonOrder`,
        [userId]
      ),
      query(
        'SELECT AVG(PKnown) as avgKnown FROM bkt_model WHERE UserID = ?',
        [userId]
      ),
      query(
        `SELECT COALESCE(
                  SUM(
                    CASE
                      WHEN COALESCE(a.TimeSpentSeconds, 0) > 0 THEN a.TimeSpentSeconds
                      ELSE COALESCE(ua.totalResponseSeconds, 0)
                    END
                  ),
                  0
                ) as assessmentSeconds
           FROM assessment a
           LEFT JOIN (
             SELECT AssessmentID, COALESCE(SUM(GREATEST(COALESCE(ResponseTime, 0), 0)), 0) as totalResponseSeconds
               FROM user_answer
              GROUP BY AssessmentID
           ) ua ON ua.AssessmentID = a.AssessmentID
          WHERE a.UserID = ?`,
        [userId]
      ),
      query(
        `SELECT COALESCE(SUM(GREATEST(COALESCE(sp.TimeSpent, 0), 0)), 0) as simulationSeconds
           FROM simulation_progress sp
          WHERE sp.UserID = ?`,
        [userId]
      )
    ]);

    const totalLessons = parseInt(lessonTotals[0]?.totalLessons || 0, 10);
    const startedLessons = parseInt(progressTotals[0]?.startedLessons || 0, 10);
    const completedLessons = parseInt(progressTotals[0]?.completedLessons || 0, 10);
    const totalCompletionRate = parseFloat(progressTotals[0]?.totalCompletionRate || 0);
    const avgCompletionRate = parseFloat(progressTotals[0]?.avgCompletionRate || 0);
    const lessonActiveSeconds = Math.max(0, parseInt(progressTotals[0]?.lessonActiveSeconds || 0, 10));
    const assessmentSeconds = Math.max(0, parseInt(assessmentTimeTotals[0]?.assessmentSeconds || 0, 10));
    const simulationSeconds = Math.max(0, parseInt(simulationTimeTotals[0]?.simulationSeconds || 0, 10));
    const lessonActiveMinutes = Math.floor(lessonActiveSeconds / 60);
    const totalLearningMinutes = Math.floor((lessonActiveSeconds + assessmentSeconds + simulationSeconds) / 60);
    const averageTimePerLessonMinutes = startedLessons > 0 ? Math.round(lessonActiveMinutes / startedLessons) : 0;
    const progressPercent = totalLessons > 0 ? Math.round(totalCompletionRate / totalLessons) : 0;
    const masteryLevelPercent = Math.round((parseFloat(masteryStats[0]?.avgKnown || 0) || 0) * 100);

    const reviewTypeSet = new Set(['review', 'quiz']);
    const finalTypeSet = new Set(['final', 'post-test']);

    let totalReviewAssessmentsTaken = 0;
    let reviewWeightedScoreTotal = 0;
    let totalFinalAssessmentsTaken = 0;
    let finalWeightedScoreTotal = 0;

    assessmentByType.forEach((row) => {
      const type = String(row.assessmentType || '').toLowerCase();
      const totalTaken = parseInt(row.totalTaken || 0, 10);
      const averageScore = parseFloat(row.averageScore || 0);

      if (reviewTypeSet.has(type)) {
        totalReviewAssessmentsTaken += totalTaken;
        reviewWeightedScoreTotal += averageScore * totalTaken;
      }

      if (finalTypeSet.has(type)) {
        totalFinalAssessmentsTaken += totalTaken;
        finalWeightedScoreTotal += averageScore * totalTaken;
      }
    });

    const averageReviewAssessmentScore = totalReviewAssessmentsTaken > 0
      ? Number((reviewWeightedScoreTotal / totalReviewAssessmentsTaken).toFixed(0))
      : 0;

    const averageFinalAssessmentScore = totalFinalAssessmentsTaken > 0
      ? Number((finalWeightedScoreTotal / totalFinalAssessmentsTaken).toFixed(0))
      : 0;

    const rankedModules = moduleAssessmentStats
      .map((m) => ({
        ...m,
        averageScore: parseFloat(m.averageScore || 0)
      }))
      .filter((m) => Number.isFinite(m.averageScore));

    rankedModules.sort((a, b) => a.averageScore - b.averageScore);

    const buildLessonSummaryLabel = (lessonOrder, moduleTitle) => {
      const cleanTitle = stripHtmlToText(moduleTitle) || 'Untitled Lesson';
      return `Lesson ${lessonOrder}: ${cleanTitle}`;
    };

    const mostChallengedLesson = rankedModules.length
      ? buildLessonSummaryLabel(rankedModules[0].LessonOrder, rankedModules[0].ModuleTitle)
      : null;

    const wellGraspedLesson = rankedModules.length
      ? buildLessonSummaryLabel(
          rankedModules[rankedModules.length - 1].LessonOrder,
          rankedModules[rankedModules.length - 1].ModuleTitle
        )
      : null;

    let lessonLevel = 'Introductory Level';
    if (avgCompletionRate >= 67) {
      lessonLevel = 'Advanced Level';
    } else if (avgCompletionRate >= 34) {
      lessonLevel = 'Intermediate Level';
    }

    res.json({
      learningPathProgress: {
        completedLessons,
        totalLessons,
        progressPercent
      },
      lessonPerformance: {
        learningTimeMinutes: totalLearningMinutes,
        averageTimePerLessonMinutes,
        lessonLevel,
        mostChallengedLesson,
        wellGraspedLesson,
        masteryLevelPercent
      },
      assessment: {
        totalReviewAssessmentsTaken,
        averageReviewAssessmentScore,
        totalFinalAssessmentsTaken,
        averageFinalAssessmentScore
      }
    });
  } catch (error) {
    console.error('Get learning progress summary error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch learning progress summary'
    });
  }
};

// Upload profile picture
const uploadProfilePicture = async (req, res) => {
  let processedFilePath = '';

  try {
    const userId = req.user.userId;
    
    if (!req.file) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'No file uploaded'
      });
    }

    // Get old profile picture
    const users = await query(
      'SELECT profile_picture FROM user WHERE UserID = ?',
      [userId]
    );

    const oldPicture = users[0]?.profile_picture;

    let profilePicturePath = '';
    processedFilePath = req.file.path;
    const sharp = getSharp();

    if (sharp) {
      // Resize image to 600x600px when sharp is available.
      const resizedFilename = `${userId}_${Date.now()}.jpg`;
      const resizedPath = path.join(getMulterProfileDestination(), resizedFilename);

      await sharp(req.file.path)
        .resize(600, 600, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: 90 })
        .toFile(resizedPath);

      // Delete the original uploaded file after resize.
      fs.unlinkSync(req.file.path);
      processedFilePath = resizedPath;
    }

    profilePicturePath = await uploadProfileImageFromPath(processedFilePath, { userId });

    // Update database with new profile picture path and set avatar_type to 'custom'
    
    await query(
      'UPDATE user SET profile_picture = ?, avatar_type = ? WHERE UserID = ?',
      [profilePicturePath, 'custom', userId]
    );

    // Delete old profile picture if it exists and is a custom upload
    await deleteProfileImage(oldPicture);

    res.json({
      message: 'Profile picture uploaded successfully',
      profile_picture: profilePicturePath,
      avatar_type: 'custom'
    });

  } catch (error) {
    console.error('Upload profile picture error:', error);
    
    // Clean up uploaded files if there's an error.
    const filesToCleanup = new Set();
    if (req.file?.path) filesToCleanup.add(req.file.path);
    if (processedFilePath) filesToCleanup.add(processedFilePath);

    for (const filePath of filesToCleanup) {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to upload profile picture'
    });
  }
};

// Delete profile picture
const deleteProfilePicture = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get current profile picture
    const users = await query(
      'SELECT profile_picture, avatar_type FROM user WHERE UserID = ?',
      [userId]
    );

    const profilePicture = users[0]?.profile_picture;
    const avatarType = users[0]?.avatar_type;

    if (!profilePicture) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'No profile picture to delete'
      });
    }

    // Delete file only if it's a custom upload.
    if (avatarType === 'custom') {
      await deleteProfileImage(profilePicture);
    }

    // Reset to default avatar
    await query(
      'UPDATE user SET profile_picture = NULL, avatar_type = ?, default_avatar = ? WHERE UserID = ?',
      ['default', 'avatar1.svg', userId]
    );

    res.json({
      message: 'Profile picture deleted successfully'
    });

  } catch (error) {
    console.error('Delete profile picture error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete profile picture'
    });
  }
};

// Select default avatar
const selectDefaultAvatar = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { avatarName } = req.body;

    // Validate avatar name
    const validAvatars = ['avatar1.png', 'avatar2.png', 'avatar3.png', 'avatar4.png', 
                          'avatar5.png', 'avatar6.png', 'avatar7.png', 'avatar8.png'];
    
    if (!avatarName || !validAvatars.includes(avatarName)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid avatar selection'
      });
    }

    // Get current profile picture to delete if it's a custom upload
    const users = await query(
      'SELECT profile_picture, avatar_type FROM user WHERE UserID = ?',
      [userId]
    );

    const oldPicture = users[0]?.profile_picture;
    const oldAvatarType = users[0]?.avatar_type;

    // Delete old custom profile picture if exists.
    if (oldAvatarType === 'custom' && oldPicture) {
      await deleteProfileImage(oldPicture);
    }

    // Update user to use default avatar
    await query(
      'UPDATE user SET avatar_type = ?, default_avatar = ?, profile_picture = NULL WHERE UserID = ?',
      ['default', avatarName, userId]
    );

    res.json({
      message: 'Avatar updated successfully',
      avatar_type: 'default',
      default_avatar: avatarName
    });

  } catch (error) {
    console.error('Select default avatar error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to select avatar'
    });
  }
};

// Get all users (admin only)
const getAllUsers = async (req, res) => {
  try {
    // First, check if Role column exists
    let users;
    try {
      users = await query(
        'SELECT UserID, Name, Email, Age, EducationalBackground, Role, profile_picture, avatar_type, default_avatar, created_at, last_login FROM user ORDER BY created_at DESC'
      );
    } catch (err) {
      // If Role column doesn't exist, query without it
      console.log('Role column might not exist, querying without it');
      users = await query(
        'SELECT UserID, Name, Email, Age, EducationalBackground, profile_picture, avatar_type, default_avatar, created_at, last_login FROM user ORDER BY created_at DESC'
      );
      // Add Role as 'student' by default
      users = users.map(user => ({ ...user, Role: 'student' }));
    }
    
    console.log(`Found ${users.length} users`);
    res.json(users);
    
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch users',
      details: error.message
    });
  }
};

// Get detailed user info (admin only)
const getUserDetails = async (req, res) => {
  try {
    const { id } = req.params;
    await ensureActivityTrackingColumns();

    const roleColumn = await query("SHOW COLUMNS FROM user LIKE 'Role'");
    const hasRoleColumn = roleColumn.length > 0;

    const users = await query(
      hasRoleColumn
        ? 'SELECT UserID, Name, Email, Age, EducationalBackground, Role, profile_picture, avatar_type, default_avatar, created_at, last_login FROM user WHERE UserID = ?'
        : "SELECT UserID, Name, Email, Age, EducationalBackground, 'student' as Role, profile_picture, avatar_type, default_avatar, created_at, last_login FROM user WHERE UserID = ?",
      [id]
    );
    
    if (users.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found'
      });
    }
    
    const [assessmentModuleColumn, assessmentRetakeColumn] = await Promise.all([
      query("SHOW COLUMNS FROM assessment LIKE 'ModuleID'"),
      query("SHOW COLUMNS FROM assessment LIKE 'RetakeCount'")
    ]);

    const hasAssessmentModuleColumn = assessmentModuleColumn.length > 0;
    const hasAssessmentRetakeColumn = assessmentRetakeColumn.length > 0;

    const assessmentQuery = hasAssessmentModuleColumn
      ? `SELECT m.LessonOrder, LOWER(a.AssessmentType) as assessmentType,
                TotalScore, ${hasAssessmentRetakeColumn ? 'RetakeCount' : '0 as RetakeCount'}
         FROM assessment a
         JOIN module m ON m.ModuleID = a.ModuleID
         WHERE a.UserID = ? AND a.ModuleID IS NOT NULL`
      : null;

    const [allModules, progressRows, assessmentRows] = await Promise.all([
      query(
        `SELECT
            MIN(ModuleID) as ModuleID,
            LessonOrder,
            MAX(ModuleTitle) as ModuleTitle
         FROM module
         GROUP BY LessonOrder
         ORDER BY LessonOrder ASC`,
        []
      ),
      query(
        `SELECT
            m.LessonOrder,
            MAX(COALESCE(p.CompletionRate, 0)) as CompletionRate,
            FLOOR(SUM(GREATEST(COALESCE(p.ActiveSeconds, 0), 0)) / 60) as minutesSpent
         FROM progress p
         JOIN module m ON m.ModuleID = p.ModuleID
         WHERE p.UserID = ?
         GROUP BY m.LessonOrder`,
        [id]
      ),
      assessmentQuery ? query(assessmentQuery, [id]) : Promise.resolve([])
    ]);

    const progressByModule = {};
    progressRows.forEach((row) => {
      progressByModule[row.LessonOrder] = {
        completionRate: Number(row.CompletionRate || 0),
        minutesSpent: Number(row.minutesSpent || 0)
      };
    });

    const assessmentsByModule = {};
    assessmentRows.forEach((row) => {
      const lessonOrder = row.LessonOrder;
      if (!assessmentsByModule[lessonOrder]) assessmentsByModule[lessonOrder] = [];
      assessmentsByModule[lessonOrder].push({
        assessmentType: String(row.assessmentType || '').toLowerCase(),
        totalScore: Number(row.TotalScore || 0),
        retakeCount: Number(row.RetakeCount || 0),
      });
    });

    const lessonMetrics = allModules.map((module) => {
      const progress = progressByModule[module.LessonOrder] || { completionRate: 0, minutesSpent: 0 };
      const moduleAssessments = assessmentsByModule[module.LessonOrder] || [];

      const reviewAssessments = moduleAssessments.filter((a) => ['review', 'quiz'].includes(a.assessmentType));
      const finalAssessments = moduleAssessments.filter((a) => ['final', 'post-test'].includes(a.assessmentType));

      const totalRetakes = moduleAssessments.reduce((sum, a) => sum + a.retakeCount, 0);
      const totalAssessmentErrors = moduleAssessments.reduce((sum, a) => sum + Math.max(0, 100 - a.totalScore), 0);
      const totalReviewErrors = reviewAssessments.reduce((sum, a) => sum + Math.max(0, 100 - a.totalScore), 0);

      const reviewAvg = reviewAssessments.length
        ? reviewAssessments.reduce((sum, a) => sum + a.totalScore, 0) / reviewAssessments.length
        : 0;

      const finalAvg = finalAssessments.length
        ? finalAssessments.reduce((sum, a) => sum + a.totalScore, 0) / finalAssessments.length
        : 0;

      return {
        moduleId: module.ModuleID,
        lessonOrder: module.LessonOrder,
        lessonLabel: `Lesson ${module.LessonOrder}`,
        lessonTitle: module.ModuleTitle,
        lessonProgress: Math.round(progress.completionRate),
        lessonCompletionRate: Math.round(progress.completionRate),
        lessonRetakeCount: totalRetakes,
        lessonsMastered: progress.completionRate >= 100 ? 1 : 0,
        timeSpentPerLesson: progress.minutesSpent,
        totalAssessmentErrors: Math.round(totalAssessmentErrors),
        finalAssessmentScores: Math.round(finalAvg),
        totalReviewErrors: Math.round(totalReviewErrors),
        challengeTrend: Math.round(finalAvg - reviewAvg)
      };
    });

    const enrolledLessons = progressRows.length;
    const completedModules = lessonMetrics.filter((m) => m.lessonsMastered === 1).length;

    const userDetails = {
      ...users[0],
      passwordMasked: '********',
      summary: {
        lessonsEnrolled: enrolledLessons,
        accountCreation: users[0].created_at,
        certificates: completedModules,
        lastActive: users[0].last_login,
      },
      lessonMetrics
    };
    
    res.json(userDetails);
    
  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch user details'
    });
  }
};

// Delete user account
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const requesterId = req.user.userId;
    const requesterRole = req.user.role;
    
    // Check if user is admin or deleting their own account
    if (requesterRole !== 'admin' && requesterId !== parseInt(id)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to delete this account'
      });
    }
    
    // Get user details to check if they're an admin
    const users = await query(
      'SELECT UserID, Email, Role, profile_picture FROM user WHERE UserID = ?',
      [id]
    );
    
    if (users.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found'
      });
    }
    
    const userToDelete = users[0];
    
    // Prevent deletion of admin accounts
    if (userToDelete.Role === 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Admin accounts cannot be deleted for security reasons'
      });
    }
    
    // Delete profile picture file if exists
    const profilePicture = userToDelete.profile_picture;
    if (profilePicture) {
      const filePath = path.join(__dirname, '..', profilePicture);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    // Delete user (cascades will handle related records: assessment, progress, bkt_model, learning_skill)
    await query('DELETE FROM user WHERE UserID = ?', [id]);
    
    res.json({
      message: 'User account deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete user account'
    });
  }
};

// Report an issue
const reportIssue = async (req, res) => {
  try {
    console.log('=== Report Issue Request ===');
    console.log('User ID from token:', req.user?.userId);
    console.log('Request body:', req.body);
    
    const userId = req.user.userId;
    const { moduleId, issueType, details, lessonTitle } = req.body;

    console.log('Parsed values:', { userId, moduleId, issueType, details, lessonTitle });

    // Create issue_reports table if it doesn't exist
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

    console.log('Table created/verified');

    // Insert the report
    const result = await query(
      'INSERT INTO issue_reports (UserID, ModuleID, IssueType, Details, LessonTitle) VALUES (?, ?, ?, ?, ?)',
      [userId, moduleId || null, issueType, details, lessonTitle || null]
    );

    console.log('Report inserted successfully:', result);

    res.status(201).json({
      message: 'Issue reported successfully'
    });

  } catch (error) {
    console.error('Report issue error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to submit issue report'
    });
  }
};

module.exports = {
  getUserProfile,
  updateUserProfile,
  changePassword,
  getUserStats,
  getLearningProgressSummary,
  uploadProfilePicture,
  deleteProfilePicture,
  selectDefaultAvatar,
  getAllUsers,
  getUserDetails,
  deleteUser,
  reportIssue
};
