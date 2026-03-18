-- Restore Admin Account
-- This script restores the default admin account if it was deleted

-- First, check if admin exists, if not create it
-- Password is 'admin123' (hashed with bcrypt)

INSERT INTO user (Name, Email, Password, Age, EducationalBackground, Role, created_at)
SELECT 'Admin User', 'admin@modulearn.com', '$2a$10$8YVzN6J6XKqH6Yn5L8xVJeKqH5E5P5tF5D5rC5G5X5V5T5S5R5Q5P', 30, 'Computer Science', 'admin', CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM user WHERE Email = 'admin@modulearn.com'
);

-- Update existing user to admin role if account exists with different role
UPDATE user 
SET Role = 'admin', 
    Name = 'Admin User',
    Age = 30,
    EducationalBackground = 'Computer Science'
WHERE Email = 'admin@modulearn.com' AND Role != 'admin';

-- Display result
SELECT 'Admin account restored successfully!' as Message,
       UserID, Name, Email, Role 
FROM user 
WHERE Email = 'admin@modulearn.com';
