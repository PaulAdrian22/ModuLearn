-- Add admin role functionality to user table
-- Run this migration to add role support

-- Add Role column to user table
ALTER TABLE user ADD COLUMN Role ENUM('student', 'admin') DEFAULT 'student' NOT NULL;

-- Update existing users to be students
UPDATE user SET Role = 'student' WHERE Role IS NULL;

-- Create an admin user (you can change the email/password)
-- Password: admin123 (hashed with bcrypt)
INSERT INTO user (Name, Email, Password, Role, Age, EducationalBackground) 
VALUES ('Admin User', 'admin@modulearn.com', '$2b$10$YourHashedPasswordHere', 'admin', 30, 'Computer Science')
ON DUPLICATE KEY UPDATE Role = 'admin';
