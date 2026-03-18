# Admin Lesson Page - Troubleshooting Guide

## Current Issue
- **User/Learner page**: Shows all 7 lessons successfully ✅
- **Admin page**: Shows "Failed to load lessons" (0 lessons total) ❌

## What We Fixed
1. ✅ Fixed backend query to use `question` table instead of non-existent `assessment.ModuleID`
2. ✅ Query works when tested directly in terminal
3. ✅ Updated frontend to display `questionCount` instead of `assessmentCount`

## Why Admin Page Still Shows Error

The admin endpoint `/api/admin/modules` requires:
1. **Authentication** - Admin must be logged in
2. **Admin role** - User must have `role = 'admin'`
3. **Backend server must be restarted** - To apply the code changes

## How to Fix

### Step 1: Restart Backend Server
```powershell
# Stop the current backend server (Ctrl+C in the terminal running it)
# Then restart it:
cd "c:\Users\paula\Desktop\thesis\modulearn\backend"
node server.js
```

### Step 2: Check Browser Console
1. Open browser Developer Tools (F12)
2. Go to Console tab
3. Look for any errors when loading Admin Lessons page
4. Check Network tab for failed `/api/admin/modules` request

### Step 3: Verify Admin Authentication
The admin routes require both:
- `authenticate` middleware (valid JWT token)
- `requireAdmin` middleware (user.role === 'admin')

If you see 401 or 403 errors, the admin user might not be properly authenticated.

## Expected Result After Fix

Admin page should show the same 7 lessons as the user page:
- Lesson 1: Install and Configure Computer Systems (3 questions)
- Lesson 1: dffsf (0 questions)
- Lesson 1: computer assembly (0 questions)
- Lesson 2: Set-up Computer Networks (0 questions)
- Lesson 3: Set-up Computer Servers (0 questions)
- Lesson 3: try (0 questions)
- Lesson 4: Maintain and Repair Computer Systems (0 questions)

## Recommended Next Steps

After confirming it works, you should:
1. **Delete duplicate test lessons** (dffsf, computer assembly, try)
2. **Renumber lessons** to have unique sequential orders (1, 2, 3, 4)
3. **Add questions** to lessons that have 0 questions

## Quick Test Command

Test the admin endpoint directly:
```bash
# In backend directory
node test-module-endpoints.js
```

This will show you exactly what data each endpoint returns.
