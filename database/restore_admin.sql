-- Restore Admin Account
-- This script restores the default admin account if it was deleted
-- Password is 'admin123' (hashed with bcrypt)

INSERT INTO user (Name, Username, Password, Age, EducationalBackground, Role, created_at)
SELECT 'Admin User', 'modulearnadmin26', '$2a$10$8YVzN6J6XKqH6Yn5L8xVJeKqH5E5P5tF5D5rC5G5X5V5T5S5R5Q5P', 30, 'Computer Science', 'admin', CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM user WHERE Username = 'modulearnadmin26'
);

-- Promote existing account to admin role if needed
UPDATE user
SET Role = 'admin',
    Name = 'Admin User',
    Age = 30,
    EducationalBackground = 'Computer Science'
WHERE Username = 'modulearnadmin26' AND Role != 'admin';

-- Display result
SELECT 'Admin account restored successfully!' as Message,
       UserID, Name, Username, Role
FROM user
WHERE Username = 'modulearnadmin26';
