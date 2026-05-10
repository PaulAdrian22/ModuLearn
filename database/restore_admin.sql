-- Restore Admin Account
-- This script restores the default admin account if it was deleted

-- First, check if admin exists, if not create it
-- Password is 'admin123' (hashed with bcrypt)

INSERT INTO user (Name, Username, Password, Age, EducationalBackground, Role, created_at)
SELECT 'Admin User', 'admin', '$2a$10$8YVzN6J6XKqH6Yn5L8xVJeKqH5E5P5tF5D5rC5G5X5V5T5S5R5Q5P', 30, 'Computer Science', 'admin', CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM user WHERE Username = 'admin'
);

-- Update existing user to admin role if account exists with different role
UPDATE user
SET Role = 'admin',
    Name = 'Admin User',
    Age = 30,
    EducationalBackground = 'Computer Science'
WHERE Username = 'admin' AND Role != 'admin';

-- Display result
SELECT 'Admin account restored successfully!' as Message,
       UserID, Name, Username, Role
FROM user
WHERE Username = 'admin';
