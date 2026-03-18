-- Reset module locks to ensure only Lesson 1 is unlocked
-- This ensures sequential progression through lessons

UPDATE module SET Is_Unlocked = FALSE;
UPDATE module SET Is_Unlocked = TRUE WHERE LessonOrder = 1;

-- Verify the locks
SELECT ModuleID, ModuleTitle, LessonOrder, Is_Unlocked 
FROM module 
ORDER BY LessonOrder;
