-- Add profile_picture column to user table
ALTER TABLE user ADD COLUMN profile_picture VARCHAR(255) DEFAULT NULL AFTER EducationalBackground;
