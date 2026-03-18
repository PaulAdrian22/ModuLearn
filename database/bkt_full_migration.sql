-- ============================================
-- BKT FULL MIGRATION
-- Bayesian Knowledge Tracing Algorithm Tables
-- Based on complete BKT specification
-- ============================================

-- ============================================
-- STEP 1: Extend QUESTION table
-- Add SkillTag and QuestionType columns
-- ============================================
ALTER TABLE question 
  ADD COLUMN SkillTag ENUM(
    'Memorization', 
    'Technical Comprehension', 
    'Analytical Thinking', 
    'Critical Thinking', 
    'Problem Solving'
  ) NULL AFTER CorrectAnswer;

ALTER TABLE question
  ADD COLUMN QuestionType ENUM('Easy', 'Situational') DEFAULT 'Easy' AFTER SkillTag;

-- Add index for skill-based queries (wrapped in procedures for idempotency)
CREATE INDEX idx_question_skill ON question(SkillTag);
CREATE INDEX idx_question_type ON question(QuestionType);

-- ============================================
-- STEP 2: Extend ASSESSMENT table
-- Add new assessment types and ModuleID
-- ============================================
ALTER TABLE assessment
  MODIFY COLUMN AssessmentType ENUM(
    'Pre-Test', 'Quiz', 'Post-Test',
    'Initial', 'Diagnostic', 'Review', 'Simulation', 'Final'
  ) NOT NULL;

-- Add ModuleID to track which lesson the assessment belongs to
ALTER TABLE assessment 
  ADD COLUMN ModuleID INT NULL AFTER UserID;

ALTER TABLE assessment
  ADD COLUMN RetakeCount INT DEFAULT 0 AFTER ResultStatus;

-- ============================================
-- STEP 3: Extend USER_ANSWER table
-- Add response time and skill tracking
-- ============================================
ALTER TABLE user_answer
  ADD COLUMN ResponseTime INT DEFAULT 0 AFTER IsCorrect;

ALTER TABLE user_answer
  ADD COLUMN SkillTag VARCHAR(100) NULL AFTER ResponseTime;

ALTER TABLE user_answer
  ADD COLUMN AttemptNumber INT DEFAULT 1 AFTER SkillTag;

-- ============================================
-- STEP 4: Extend BKT_MODEL table
-- Add more fields for detailed mastery tracking
-- ============================================
ALTER TABLE bkt_model
  MODIFY COLUMN PKnown DECIMAL(10,6) DEFAULT 0.010000,
  MODIFY COLUMN PLearn DECIMAL(10,6) DEFAULT 0.100000,
  MODIFY COLUMN PSlip DECIMAL(10,6) DEFAULT 0.400000,
  MODIFY COLUMN PGuess DECIMAL(10,6) DEFAULT 0.150000;

ALTER TABLE bkt_model
  ADD COLUMN BaseL DECIMAL(10,6) DEFAULT 0.010000 AFTER PGuess;

ALTER TABLE bkt_model
  ADD COLUMN CurrentL DECIMAL(10,6) DEFAULT 0.010000 AFTER BaseL;

ALTER TABLE bkt_model
  ADD COLUMN PostTestL DECIMAL(10,6) DEFAULT 0.000000 AFTER CurrentL;

-- ============================================
-- STEP 5: Create BKT_ITEM_RESPONSE table
-- Tracks each individual question interaction 
-- with full BKT state snapshots
-- ============================================
CREATE TABLE IF NOT EXISTS bkt_item_response (
  ResponseID INT AUTO_INCREMENT PRIMARY KEY,
  UserID INT NOT NULL,
  AssessmentID INT NULL,
  QuestionID INT NOT NULL,
  ModuleID INT NULL,
  SkillName VARCHAR(100) NOT NULL,
  AssessmentType ENUM('Initial', 'Diagnostic', 'Review', 'Simulation', 'Final') NOT NULL,
  IsCorrect BOOLEAN NOT NULL,
  ResponseTime INT DEFAULT 0,
  AttemptNumber INT DEFAULT 1,
  -- BKT state snapshot at this interaction
  BaseL_Before DECIMAL(10,6) NOT NULL,
  TransitionL DECIMAL(10,6) NOT NULL,
  PostTestL DECIMAL(10,6) NOT NULL,
  CurrentL_After DECIMAL(10,6) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (UserID) REFERENCES user(UserID) ON DELETE CASCADE,
  FOREIGN KEY (QuestionID) REFERENCES question(QuestionID) ON DELETE CASCADE,
  INDEX idx_user (UserID),
  INDEX idx_assessment (AssessmentID),
  INDEX idx_skill (SkillName),
  INDEX idx_user_assessment_type (UserID, AssessmentType, ModuleID)
);

-- ============================================
-- STEP 6: Create BKT_ASSESSMENT_MASTERY table
-- Stores mastery computed per assessment type 
-- per lesson per skill
-- ============================================
CREATE TABLE IF NOT EXISTS bkt_assessment_mastery (
  AssessmentMasteryID INT AUTO_INCREMENT PRIMARY KEY,
  UserID INT NOT NULL,
  ModuleID INT NULL,
  SkillName VARCHAR(100) NOT NULL,
  AssessmentType ENUM('Initial', 'Review', 'Simulation', 'Final') NOT NULL,
  -- The final PostTestL value after processing all items in this assessment
  MasteryValue DECIMAL(10,6) DEFAULT 0.000000,
  QuestionsAnswered INT DEFAULT 0,
  QuestionsCorrect INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (UserID) REFERENCES user(UserID) ON DELETE CASCADE,
  UNIQUE KEY unique_user_module_skill_type (UserID, ModuleID, SkillName, AssessmentType),
  INDEX idx_user (UserID),
  INDEX idx_module (ModuleID)
);

-- ============================================
-- STEP 7: Create BKT_LESSON_MASTERY table
-- Tracks per-lesson, per-skill mastery
-- MLesson = max(ReviewL, SimulationL, FinalL)
-- WMLesson = W_lesson * MLesson
-- ============================================
CREATE TABLE IF NOT EXISTS bkt_lesson_mastery (
  LessonMasteryID INT AUTO_INCREMENT PRIMARY KEY,
  UserID INT NOT NULL,
  ModuleID INT NOT NULL,
  SkillName VARCHAR(100) NOT NULL,
  -- Per-assessment mastery values for this lesson
  ReviewL DECIMAL(10,6) DEFAULT 0.000000,
  SimulationL DECIMAL(10,6) DEFAULT 0.000000,
  FinalL DECIMAL(10,6) DEFAULT 0.000000,
  -- Computed lesson mastery
  MLesson DECIMAL(10,6) DEFAULT 0.000000,
  -- Weight and weighted mastery
  WLesson DECIMAL(10,6) DEFAULT 0.000000,
  WMLesson DECIMAL(10,6) DEFAULT 0.000000,
  -- Retake tracking
  RetakeCount INT DEFAULT 0,
  IsPassed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (UserID) REFERENCES user(UserID) ON DELETE CASCADE,
  FOREIGN KEY (ModuleID) REFERENCES module(ModuleID) ON DELETE CASCADE,
  UNIQUE KEY unique_user_module_skill (UserID, ModuleID, SkillName),
  INDEX idx_user (UserID),
  INDEX idx_module (ModuleID)
);

-- ============================================
-- STEP 8: Create BKT_OVERALL_MASTERY table
-- Tracks overall mastery per user per skill
-- OverallM = WMInitial + TMLesson
-- ============================================
CREATE TABLE IF NOT EXISTS bkt_overall_mastery (
  OverallMasteryID INT AUTO_INCREMENT PRIMARY KEY,
  UserID INT NOT NULL,
  SkillName VARCHAR(100) NOT NULL,
  -- Initial Assessment values
  InitialL DECIMAL(10,6) DEFAULT 0.000000,
  WMInitial DECIMAL(10,6) DEFAULT 0.000000,
  RemainingL DECIMAL(10,6) DEFAULT 1.000000,
  -- Lesson mastery accumulation
  TMLesson DECIMAL(10,6) DEFAULT 0.000000,
  -- Overall mastery = WMInitial + TMLesson
  OverallMastery DECIMAL(10,6) DEFAULT 0.000000,
  IsMastered BOOLEAN DEFAULT FALSE,
  -- Overall mastery percent: (m / n) * 100
  TotalQuestionsMastered INT DEFAULT 0,
  TotalQuestions INT DEFAULT 0,
  OverallMasteryPercent DECIMAL(5,2) DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (UserID) REFERENCES user(UserID) ON DELETE CASCADE,
  UNIQUE KEY unique_user_skill (UserID, SkillName),
  INDEX idx_user (UserID),
  INDEX idx_mastered (IsMastered)
);

-- ============================================
-- STEP 9: Create BKT_DIAGNOSTIC_RESULT table
-- Tracks diagnostic results per lesson
-- Correct answers remove equivalent questions
-- ============================================
CREATE TABLE IF NOT EXISTS bkt_diagnostic_result (
  DiagnosticID INT AUTO_INCREMENT PRIMARY KEY,
  UserID INT NOT NULL,
  ModuleID INT NOT NULL,
  QuestionID INT NOT NULL,
  SkillName VARCHAR(100) NOT NULL,
  IsCorrect BOOLEAN NOT NULL,
  -- If correct, equivalent question is removed from lesson
  RemoveFromLesson BOOLEAN DEFAULT FALSE,
  -- The equivalent question ID to remove/retain
  EquivalentQuestionID INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (UserID) REFERENCES user(UserID) ON DELETE CASCADE,
  FOREIGN KEY (ModuleID) REFERENCES module(ModuleID) ON DELETE CASCADE,
  FOREIGN KEY (QuestionID) REFERENCES question(QuestionID) ON DELETE CASCADE,
  INDEX idx_user_module (UserID, ModuleID)
);

-- ============================================
-- STEP 10: Create BKT_TIME_RULE table
-- Tracks time-based rules for Review/Final
-- ============================================
CREATE TABLE IF NOT EXISTS bkt_time_rule (
  TimeRuleID INT AUTO_INCREMENT PRIMARY KEY,
  UserID INT NOT NULL,
  QuestionID INT NOT NULL,
  ModuleID INT NOT NULL,
  AssessmentType ENUM('Review', 'Final') NOT NULL,
  ResponseTime INT NOT NULL DEFAULT 0,
  AttemptNumber INT DEFAULT 1,
  IsCorrect BOOLEAN NOT NULL,
  QuestionType ENUM('Easy', 'Situational') NOT NULL,
  -- For Review: determines version in Final Assessment
  FinalVersionType ENUM('Easy', 'Situational') NULL,
  -- For Final: determines if question needs to be answered again on retake
  NeedToAnswerAgain BOOLEAN DEFAULT TRUE,
  -- For Review: whether student needs to redo lesson discussion
  NeedsRedoDiscussion BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (UserID) REFERENCES user(UserID) ON DELETE CASCADE,
  FOREIGN KEY (QuestionID) REFERENCES question(QuestionID) ON DELETE CASCADE,
  INDEX idx_user_module (UserID, ModuleID),
  INDEX idx_assessment_type (AssessmentType)
);

-- ============================================
-- STEP 11: Create BKT_SESSION table
-- Tracks active assessment sessions
-- ============================================
CREATE TABLE IF NOT EXISTS bkt_session (
  SessionID INT AUTO_INCREMENT PRIMARY KEY,
  UserID INT NOT NULL,
  AssessmentID INT NULL,
  AssessmentType ENUM('Initial', 'Diagnostic', 'Review', 'Simulation', 'Final') NOT NULL,
  ModuleID INT NULL,
  Status ENUM('Active', 'Completed', 'Abandoned') DEFAULT 'Active',
  -- Snapshot of skill states at session start (JSON)
  SkillStatesStart JSON NULL,
  -- Snapshot of skill states at session end (JSON) 
  SkillStatesEnd JSON NULL,
  -- Questions assigned to this session (JSON array of QuestionIDs)
  AssignedQuestions JSON NULL,
  -- Questions answered so far
  QuestionsAnswered INT DEFAULT 0,
  TotalQuestions INT DEFAULT 0,
  StartedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CompletedAt TIMESTAMP NULL,
  FOREIGN KEY (UserID) REFERENCES user(UserID) ON DELETE CASCADE,
  INDEX idx_user_status (UserID, Status),
  INDEX idx_assessment_type (AssessmentType)
);

-- ============================================
-- UPDATED VIEWS
-- ============================================

-- Drop existing BKT view and recreate
DROP VIEW IF EXISTS v_bkt_knowledge_state;

CREATE VIEW v_bkt_knowledge_state AS
SELECT 
    u.UserID,
    u.Name,
    bkt.SkillName,
    bkt.PKnown,
    bkt.CurrentL,
    bkt.PLearn,
    bkt.PSlip,
    bkt.PGuess,
    om.WMInitial,
    om.TMLesson,
    om.OverallMastery,
    om.OverallMasteryPercent,
    om.IsMastered,
    CASE 
        WHEN om.OverallMastery >= 0.85 THEN 'Mastered'
        WHEN om.OverallMastery >= 0.70 THEN 'Advanced'
        WHEN om.OverallMastery >= 0.50 THEN 'Intermediate'
        WHEN om.OverallMastery >= 0.30 THEN 'Beginner'
        ELSE 'Novice'
    END as proficiency_level
FROM user u
LEFT JOIN bkt_model bkt ON u.UserID = bkt.UserID
LEFT JOIN bkt_overall_mastery om ON u.UserID = om.UserID AND bkt.SkillName = om.SkillName;

-- View: Lesson Mastery Summary
CREATE OR REPLACE VIEW v_lesson_mastery_summary AS
SELECT 
    u.UserID,
    u.Name,
    m.ModuleID,
    m.ModuleTitle,
    m.LessonOrder,
    lm.SkillName,
    lm.ReviewL,
    lm.SimulationL,
    lm.FinalL,
    lm.MLesson,
    lm.WMLesson,
    lm.IsPassed,
    lm.RetakeCount
FROM user u
JOIN bkt_lesson_mastery lm ON u.UserID = lm.UserID
JOIN module m ON lm.ModuleID = m.ModuleID
ORDER BY u.UserID, m.LessonOrder, lm.SkillName;

-- ============================================
-- END OF BKT MIGRATION
-- ============================================
