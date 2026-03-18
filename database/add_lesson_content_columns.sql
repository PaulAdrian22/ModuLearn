-- Add columns for storing lesson content as JSON
-- Run this script to add sections and assessment questions storage

ALTER TABLE module 
ADD COLUMN sections JSON DEFAULT NULL COMMENT 'Lesson materials and content sections',
ADD COLUMN diagnosticQuestions JSON DEFAULT NULL COMMENT 'Diagnostic assessment questions',
ADD COLUMN reviewQuestions JSON DEFAULT NULL COMMENT 'Review assessment questions',  
ADD COLUMN finalQuestions JSON DEFAULT NULL COMMENT 'Final assessment questions';
