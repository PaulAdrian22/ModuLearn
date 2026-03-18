-- Add LessonTime and Difficulty columns to module table
-- Run this script to add lesson time and difficulty fields

ALTER TABLE module 
ADD COLUMN LessonTime JSON DEFAULT NULL COMMENT 'Lesson duration in hours and minutes',
ADD COLUMN Difficulty VARCHAR(50) DEFAULT 'Easy' COMMENT 'Lesson difficulty level';
