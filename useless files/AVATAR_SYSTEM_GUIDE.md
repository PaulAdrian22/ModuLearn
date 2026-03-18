# Avatar System Setup Guide

This guide will help you set up the new avatar system with default icons and custom uploads.

## Database Migration

Run the following SQL migration to add the avatar fields to your database:

```bash
# From the project root directory
mysql -u root -p modulearn_db < database/add_avatar_system.sql
```

Or manually execute the SQL:

```sql
-- Add avatar_type column to track whether user has default or custom avatar
ALTER TABLE user ADD COLUMN IF NOT EXISTS avatar_type ENUM('default', 'custom') DEFAULT 'default' AFTER profile_picture;

-- Add default_avatar column to store the default avatar selection
ALTER TABLE user ADD COLUMN IF NOT EXISTS default_avatar VARCHAR(50) DEFAULT 'avatar1.svg' AFTER avatar_type;
```

## Features Implemented

### 1. Default Avatars
- 8 colorful default avatar icons available in `/frontend/public/images/avatars/`
- Users can choose from these avatars in their profile settings
- Colors: Blue, Pink, Green, Orange, Cyan, Purple, Red, Teal

### 2. Custom Avatar Upload
- Users can upload their own profile pictures (JPG/PNG, max 10MB)
- Uploaded files are stored in `/backend/uploads/profiles/`
- Old custom uploads are automatically cleaned up when switching avatars

### 3. Avatar Component
- Reusable React component at `/frontend/src/components/Avatar.js`
- Supports multiple sizes: sm, md, lg, xl, 2xl
- Falls back to user initials if no avatar is set
- Handles both default and custom avatars seamlessly

### 4. Integration Points
The Avatar component is now used in:
- **Navbar** - Shows user avatar across all pages
- **Dashboard** - Displays large avatar in welcome section
- **Profile Page** - Avatar selection modal with preview
- **Admin Learners List** - Shows avatars in table and detail modal

## API Endpoints

### Select Default Avatar
```
POST /api/users/select-avatar
Body: { "avatarName": "avatar1.svg" }
Headers: Authorization Bearer token
```

### Upload Custom Avatar
```
POST /api/users/upload-picture
Body: multipart/form-data with 'profilePicture' field
Headers: Authorization Bearer token
```

### Delete Avatar
```
DELETE /api/users/delete-picture
Headers: Authorization Bearer token
```
(Resets to default avatar1.svg)

## Usage

### For Users:
1. Go to Profile/Settings page
2. Click on "Change Avatar" section
3. Choose from default avatars or upload your own
4. Changes appear immediately across all pages

### For Developers:
To use the Avatar component in your pages:

```jsx
import Avatar from '../components/Avatar';

// In your component:
<Avatar user={userObject} size="md" />
```

The user object should have these fields:
- `Name` or `name` - User's display name (for initials fallback)
- `avatar_type` - 'default' or 'custom'
- `default_avatar` - filename like 'avatar1.svg' (for default avatars)
- `profile_picture` - path to custom upload (for custom avatars)

## Testing

1. **Test Default Avatars:**
   - Login as a user
   - Go to Profile page
   - Click "Change Avatar"
   - Select different default avatars
   - Verify changes appear in Navbar and Dashboard

2. **Test Custom Upload:**
   - Upload a custom image (JPG/PNG < 10MB)
   - Check that it displays correctly
   - Verify old custom images are deleted

3. **Test Fallback:**
   - Create a new user with no avatar
   - Verify initials display correctly

## Troubleshooting

### Avatars not displaying:
- Check that avatar files exist in `/frontend/public/images/avatars/`
- Verify database columns exist: `avatar_type`, `default_avatar`
- Check browser console for 404 errors

### Upload fails:
- Verify `uploads/profiles/` directory exists and is writable
- Check file size is under 10MB
- Ensure file is JPG or PNG format

### Changes don't reflect:
- Clear browser cache
- Check that profile data is being refetched after updates
- Verify API endpoints are returning updated user data with avatar fields

## Notes

- Default avatars are SVG files for scalability
- Custom uploads are stored with unique filenames to prevent conflicts
- Avatar component handles image load errors gracefully
- All avatar changes propagate automatically across the application
