-- ============================================
-- FIX: Add DEFAULT values to simulation table
-- ============================================
-- Fixes ER_NO_DEFAULT_FOR_FIELD errors on deployed version
-- by adding DEFAULT values to NOT NULL columns

-- Check current schema
SHOW COLUMNS FROM simulation;

-- Add/Modify defaults for columns that may be NOT NULL without defaults
-- Using MODIFY COLUMN to add defaults if columns already exist

-- ModuleID: Change to have DEFAULT 0
ALTER TABLE simulation MODIFY COLUMN ModuleID INT DEFAULT 0;

-- Description: Add DEFAULT if it doesn't have one
ALTER TABLE simulation MODIFY COLUMN Description TEXT DEFAULT '';

-- Instructions: Add DEFAULT if it doesn't have one  
ALTER TABLE simulation MODIFY COLUMN Instructions TEXT DEFAULT '';

-- Verify schema was updated
SHOW COLUMNS FROM simulation WHERE Field IN ('ModuleID', 'Description', 'Instructions');

-- Fix any existing NULL values in these columns
UPDATE simulation SET ModuleID = 0 WHERE ModuleID IS NULL;
UPDATE simulation SET Description = '' WHERE Description IS NULL;
UPDATE simulation SET Instructions = '' WHERE Instructions IS NULL;

-- Create password_reset_requests table if it doesn't exist
CREATE TABLE IF NOT EXISTS password_reset_requests (
  RequestID INT AUTO_INCREMENT PRIMARY KEY,
  Username VARCHAR(100) NOT NULL,
  RequestedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  Resolved BOOLEAN NOT NULL DEFAULT FALSE
);

SELECT COUNT(*) as total_simulations FROM simulation;
SELECT COUNT(*) as null_moduleid FROM simulation WHERE ModuleID IS NULL;
SELECT COUNT(*) as null_description FROM simulation WHERE Description IS NULL;
SELECT COUNT(*) as null_instructions FROM simulation WHERE Instructions IS NULL;
