-- Add avatar fields to user table
-- This supports both default avatars and custom uploaded pictures

-- Add avatar_type column to track whether user has default or custom avatar
ALTER TABLE user ADD COLUMN IF NOT EXISTS avatar_type ENUM('default', 'custom') DEFAULT 'default' AFTER profile_picture;

-- Add default_avatar column to store the default avatar selection (avatar1.svg, avatar2.svg, etc.)
ALTER TABLE user ADD COLUMN IF NOT EXISTS default_avatar VARCHAR(50) DEFAULT 'avatar1.svg' AFTER avatar_type;

-- Note: profile_picture column should already exist from previous migrations
-- If not, uncomment the following line:
-- ALTER TABLE user ADD COLUMN IF NOT EXISTS profile_picture VARCHAR(255) DEFAULT NULL AFTER EducationalBackground;
