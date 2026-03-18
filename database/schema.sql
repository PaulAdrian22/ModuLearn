-- MODULEARN Database Schema
-- Database: modulearn_db
-- DBMS: MySQL / PostgreSQL compatible
-- Based on ERD provided for MODULEARN research project

-- ============================================
-- 1. USER TABLE
-- ============================================
CREATE TABLE user (
    UserID INT AUTO_INCREMENT PRIMARY KEY,
    Name VARCHAR(100) NOT NULL,
    Email VARCHAR(100) UNIQUE NOT NULL,
    Password VARCHAR(255) NOT NULL,
    Age INT,
    EducationalBackground VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    INDEX idx_email (Email)
);

-- ============================================
-- 2. MODULE TABLE
-- ============================================
CREATE TABLE module (
    ModuleID INT AUTO_INCREMENT PRIMARY KEY,
    ModuleTitle VARCHAR(200) NOT NULL,
    Description TEXT,
    LessonOrder INT NOT NULL,
    Tesda_Reference VARCHAR(100),
    Is_Unlocked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_lesson_order (LessonOrder)
);

-- ============================================
-- 3. ASSESSMENT TABLE
-- ============================================
CREATE TABLE assessment (
    AssessmentID INT AUTO_INCREMENT PRIMARY KEY,
    UserID INT NOT NULL,
    AssessmentType ENUM('Pre-Test', 'Quiz', 'Post-Test') NOT NULL,
    DateTaken TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    TotalScore DECIMAL(5,2) DEFAULT 0.00,
    ResultStatus ENUM('Pass', 'Fail', 'In Progress') DEFAULT 'In Progress',
    FOREIGN KEY (UserID) REFERENCES user(UserID) ON DELETE CASCADE,
    INDEX idx_user (UserID),
    INDEX idx_date (DateTaken)
);

-- ============================================
-- 4. QUESTION TABLE
-- ============================================
CREATE TABLE question (
    QuestionID INT AUTO_INCREMENT PRIMARY KEY,
    ModuleID INT NOT NULL,
    QuestionText TEXT NOT NULL,
    CorrectAnswer TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ModuleID) REFERENCES module(ModuleID) ON DELETE CASCADE,
    INDEX idx_module (ModuleID)
);

-- ============================================
-- 5. USER_ANSWER TABLE
-- ============================================
CREATE TABLE user_answer (
    AnswerID INT AUTO_INCREMENT PRIMARY KEY,
    AssessmentID INT NOT NULL,
    QuestionID INT NOT NULL,
    UserAnswer TEXT NOT NULL,
    IsCorrect BOOLEAN NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (AssessmentID) REFERENCES assessment(AssessmentID) ON DELETE CASCADE,
    FOREIGN KEY (QuestionID) REFERENCES question(QuestionID) ON DELETE CASCADE,
    INDEX idx_assessment (AssessmentID),
    INDEX idx_question (QuestionID)
);

-- ============================================
-- 6. PROGRESS TABLE
-- ============================================
CREATE TABLE progress (
    ProgressID INT AUTO_INCREMENT PRIMARY KEY,
    UserID INT NOT NULL,
    ModuleID INT NOT NULL,
    CompletionRate DECIMAL(5,2) DEFAULT 0.00,
    DateStarted TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    DateCompletion TIMESTAMP NULL,
    FOREIGN KEY (UserID) REFERENCES user(UserID) ON DELETE CASCADE,
    FOREIGN KEY (ModuleID) REFERENCES module(ModuleID) ON DELETE CASCADE,
    UNIQUE KEY unique_user_module (UserID, ModuleID),
    INDEX idx_user (UserID),
    INDEX idx_module (ModuleID)
);

-- ============================================
-- 7. BKT_MODEL TABLE
-- ============================================
CREATE TABLE bkt_model (
    BkID INT AUTO_INCREMENT PRIMARY KEY,
    UserID INT NOT NULL,
    SkillName VARCHAR(100) NOT NULL,
    PKnown DECIMAL(5,4) DEFAULT 0.1000,
    PLearn DECIMAL(5,4) DEFAULT 0.3000,
    PSlip DECIMAL(5,4) DEFAULT 0.1000,
    PGuess DECIMAL(5,4) DEFAULT 0.2500,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (UserID) REFERENCES user(UserID) ON DELETE CASCADE,
    UNIQUE KEY unique_user_skill (UserID, SkillName),
    INDEX idx_user (UserID),
    INDEX idx_skill (SkillName)
);

-- ============================================
-- 8. LEARNING_SKILL TABLE
-- ============================================
CREATE TABLE learning_skill (
    SkillID INT AUTO_INCREMENT PRIMARY KEY,
    UserID INT NOT NULL,
    AssessmentID INT NOT NULL,
    SkillCategory ENUM('Memorization', 'Analytical Thinking', 'Critical Thinking', 'Problem-Solving', 'Technical Comprehension') NOT NULL,
    ScorePercentage DECIMAL(5,2) DEFAULT 0.00,
    EvaluationDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (UserID) REFERENCES user(UserID) ON DELETE CASCADE,
    FOREIGN KEY (AssessmentID) REFERENCES assessment(AssessmentID) ON DELETE CASCADE,
    INDEX idx_user (UserID),
    INDEX idx_assessment (AssessmentID),
    INDEX idx_skill_category (SkillCategory)
);



-- ============================================
-- SAMPLE DATA INSERTS
-- ============================================

-- Insert sample admin user (password should be hashed in production)
INSERT INTO user (Name, Email, Password, Age, EducationalBackground) 
VALUES ('Administrator', 'admin@modulearn.com', '$2a$10$example_hash_here', 30, 'Masters Degree');

-- Insert sample modules (TESDA CHS NC II aligned)
INSERT INTO module (ModuleTitle, Description, LessonOrder, Tesda_Reference, Is_Unlocked) VALUES
('Install and Configure Computer Systems', 'Learn to assemble and configure computer systems', 1, 'TESDA-CHS-NC-II-Module-1', TRUE),
('Set-up Computer Networks', 'Configure network connections and settings', 2, 'TESDA-CHS-NC-II-Module-2', FALSE),
('Set-up Computer Servers', 'Install and configure server systems', 3, 'TESDA-CHS-NC-II-Module-3', FALSE),
('Maintain and Repair Computer Systems', 'Diagnose and repair hardware issues', 4, 'TESDA-CHS-NC-II-Module-4', FALSE);

-- Insert sample questions for Module 1
INSERT INTO question (ModuleID, QuestionText, CorrectAnswer) VALUES
(1, 'What is the main circuit board of a computer called?', 'Motherboard'),
(1, 'Which component is considered the brain of the computer?', 'CPU'),
(1, 'What type of memory is volatile and loses data when power is off?', 'RAM');

-- ============================================
-- VIEWS (Optional but useful)
-- ============================================

-- View: User Progress Summary
CREATE VIEW v_user_progress_summary AS
SELECT 
    u.UserID,
    u.Name,
    u.Email,
    m.ModuleID,
    m.ModuleTitle,
    p.CompletionRate,
    p.DateStarted,
    p.DateCompletion
FROM user u
LEFT JOIN progress p ON u.UserID = p.UserID
LEFT JOIN module m ON p.ModuleID = m.ModuleID;

-- View: Assessment Performance
CREATE VIEW v_assessment_performance AS
SELECT 
    u.UserID,
    u.Name,
    a.AssessmentID,
    a.AssessmentType,
    a.DateTaken,
    a.TotalScore,
    a.ResultStatus,
    COUNT(ua.AnswerID) as total_questions,
    SUM(CASE WHEN ua.IsCorrect = TRUE THEN 1 ELSE 0 END) as correct_answers
FROM user u
LEFT JOIN assessment a ON u.UserID = a.UserID
LEFT JOIN user_answer ua ON a.AssessmentID = ua.AssessmentID
GROUP BY u.UserID, a.AssessmentID;

-- View: Learning Skill Analysis
CREATE VIEW v_learning_skill_analysis AS
SELECT 
    u.UserID,
    u.Name,
    ls.SkillCategory,
    AVG(ls.ScorePercentage) as average_score,
    COUNT(ls.SkillID) as evaluation_count,
    MAX(ls.EvaluationDate) as last_evaluation
FROM user u
LEFT JOIN learning_skill ls ON u.UserID = ls.UserID
GROUP BY u.UserID, ls.SkillCategory;

-- View: BKT Knowledge State
CREATE VIEW v_bkt_knowledge_state AS
SELECT 
    u.UserID,
    u.Name,
    bkt.SkillName,
    bkt.PKnown,
    bkt.PLearn,
    bkt.PSlip,
    bkt.PGuess,
    CASE 
        WHEN bkt.PKnown >= 0.95 THEN 'Mastered'
        WHEN bkt.PKnown >= 0.70 THEN 'Advanced'
        WHEN bkt.PKnown >= 0.50 THEN 'Intermediate'
        ELSE 'Beginner'
    END as proficiency_level
FROM user u
LEFT JOIN bkt_model bkt ON u.UserID = bkt.UserID;

-- ============================================
-- END OF SCHEMA
-- ============================================
