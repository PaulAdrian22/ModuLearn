-- Ensure Lesson 1 is always unlocked by default
-- This script ensures that the first lesson (LessonOrder = 1) is always accessible to all users

UPDATE module SET Is_Unlocked = TRUE WHERE LessonOrder = 1;

-- Verify the update
SELECT ModuleID, ModuleTitle, LessonOrder, Is_Unlocked 
FROM module 
WHERE LessonOrder = 1;
