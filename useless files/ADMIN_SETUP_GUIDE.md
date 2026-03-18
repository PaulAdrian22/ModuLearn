# Admin System Setup Guide

## Overview
The admin system allows authorized users to manage lessons, create content, and add assessments to the ModuLearn platform.

## Features Implemented

### 1. Role-Based Access Control
- **Student Role**: Default for all new users
- **Admin Role**: Can access admin panel and manage lessons

### 2. Admin Capabilities
- View all lessons with statistics
- Create new lessons with custom content
- Edit existing lessons
- Delete lessons
- Add structured content sections
- Create assessments (coming soon)

### 3. UI Components
- **Admin Lessons Page**: List view of all lessons with management options
- **Add/Edit Lesson Page**: Multi-step form for creating/editing lessons
  - Step 1: Lesson Details (title, description, difficulty, time)
  - Step 2: Content Sections (topics, subtopics, paragraphs, media)
  - Step 3: Assessment Creation (placeholder for future development)

## Setup Instructions

### 1. Database Migration

Run the migration script to add the Role column to the user table:

\`\`\`bash
# Connect to your MySQL database
mysql -u your_username -p modulearn_db

# Run the migration
source database/add_admin_role.sql
\`\`\`

Or manually run:

\`\`\`sql
ALTER TABLE user ADD COLUMN Role ENUM('student', 'admin') DEFAULT 'student' NOT NULL;
UPDATE user SET Role = 'student' WHERE Role IS NULL;
\`\`\`

### 2. Create an Admin User

**Option A: Via SQL**

\`\`\`sql
-- First, hash your password using bcrypt (use an online tool or Node.js script)
-- Then insert or update a user

UPDATE user 
SET Role = 'admin' 
WHERE Email = 'your-email@example.com';
\`\`\`

**Option B: Via Registration + Manual Update**

1. Register a normal account through the app
2. Update the role in database:
   \`\`\`sql
   UPDATE user SET Role = 'admin' WHERE Email = 'your-email@example.com';
   \`\`\`

**Option C: Create Script**

Create a file `backend/create_admin.js`:

\`\`\`javascript
const bcrypt = require('bcryptjs');
const { query } = require('./config/database');

const createAdmin = async () => {
  const email = 'admin@modulearn.com';
  const password = 'admin123'; // Change this!
  const name = 'Admin User';
  
  const hashedPassword = await bcrypt.hash(password, 10);
  
  try {
    await query(
      'INSERT INTO user (Name, Email, Password, Role) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE Role = ?',
      [name, email, hashedPassword, 'admin', 'admin']
    );
    console.log('Admin user created successfully!');
    console.log('Email:', email);
    console.log('Password:', password);
  } catch (error) {
    console.error('Error creating admin:', error);
  }
  process.exit(0);
};

createAdmin();
\`\`\`

Run it:
\`\`\`bash
cd backend
node create_admin.js
\`\`\`

### 3. Restart the Backend Server

\`\`\`bash
cd backend
npm start
\`\`\`

### 4. Login as Admin

1. Go to http://localhost:3000/login
2. Login with your admin credentials
3. You should now see an "Admin" tab in the navigation bar

## Using the Admin Panel

### Accessing Admin Features

1. **Login**: Use admin credentials
2. **Navigate**: Click the "Admin" tab in the navbar
3. **Manage Lessons**: You'll see the admin dashboard

### Creating a New Lesson

1. Click **"+ Add Lesson"** button
2. **Step 1 - Details**:
   - Enter lesson title
   - Set lesson time (hours and minutes)
   - Add description
   - Select difficulty level (Easy/Challenging/Advanced/Supplementary)
3. **Step 2 - Content**:
   - Click "Add Section" to add content blocks
   - Choose from the Materials panel:
     - Topic Title
     - Subtopic Title
     - Paragraph
     - Image
     - Video
     - Review - Multiple Choice
     - Review - Drag and Drop
     - References
   - Fill in content for each section
   - Reorder sections by dragging (if implemented)
   - Delete sections using the ✕ button
4. **Step 3 - Assessment**:
   - Currently a placeholder
   - Future: Add questions and answers
5. **Save**: Click "Upload Lesson" to create the lesson

### Editing a Lesson

1. From the admin lessons list, click **"✏️ Edit"** on any lesson
2. Modify any fields
3. Click **"Update Lesson"** to save changes

### Deleting a Lesson

1. Click **"🗑️ Delete"** on any lesson
2. Confirm the deletion
3. Lesson will be permanently removed

## API Endpoints

### Admin Routes
All admin routes require authentication and admin role.

- `GET /api/admin/modules` - Get all modules (admin view)
- `POST /api/admin/modules` - Create new module
- `PUT /api/admin/modules/:id` - Update module
- `DELETE /api/admin/modules/:id` - Delete module
- `POST /api/admin/modules/:id/sections` - Add section to module
- `POST /api/admin/modules/:id/questions` - Add questions to module

## Security

- All admin routes are protected by `requireAdmin` middleware
- JWT tokens include role information
- Frontend checks user role before showing admin menu
- Unauthorized access attempts redirect to dashboard

## Future Enhancements

### Planned Features
- [ ] Assessment question builder
- [ ] Image/video upload functionality
- [ ] Drag-and-drop section reordering
- [ ] Rich text editor for content
- [ ] Preview lesson before publishing
- [ ] Lesson versioning
- [ ] Student analytics per lesson
- [ ] Bulk import lessons from CSV/JSON
- [ ] Lesson templates
- [ ] Content library/reusable blocks

### Database Improvements Needed
Consider creating these tables for better content management:

\`\`\`sql
-- Lesson Sections Table
CREATE TABLE lesson_section (
  SectionID INT AUTO_INCREMENT PRIMARY KEY,
  ModuleID INT NOT NULL,
  SectionType ENUM('topic', 'subtopic', 'paragraph', 'image', 'video', 'quiz') NOT NULL,
  Title VARCHAR(255),
  Content TEXT,
  MediaURL VARCHAR(500),
  OrderIndex INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ModuleID) REFERENCES module(ModuleID) ON DELETE CASCADE
);

-- Lesson Media Table
CREATE TABLE lesson_media (
  MediaID INT AUTO_INCREMENT PRIMARY KEY,
  ModuleID INT NOT NULL,
  MediaType ENUM('image', 'video', 'document') NOT NULL,
  FileName VARCHAR(255) NOT NULL,
  FilePath VARCHAR(500) NOT NULL,
  FileSize INT,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ModuleID) REFERENCES module(ModuleID) ON DELETE CASCADE
);
\`\`\`

## Troubleshooting

### Issue: Admin menu not showing
**Solution**: 
1. Check user role in database: `SELECT * FROM user WHERE Email = 'your-email';`
2. Verify JWT token includes role (check browser console)
3. Clear localStorage and login again

### Issue: 403 Forbidden on admin routes
**Solution**:
1. Ensure you're logged in as admin
2. Check backend logs for authentication errors
3. Verify `requireAdmin` middleware is working

### Issue: Can't create lessons
**Solution**:
1. Check backend console for errors
2. Verify database connection
3. Check that module table has correct schema

## Support

For issues or questions, refer to:
- Main documentation: `README.md`
- Setup guide: `SETUP_AND_RUN_GUIDE.md`
- System architecture: `SYSTEM_ARCHITECTURE.md`
