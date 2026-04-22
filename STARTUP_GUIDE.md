# ModuLearn System Startup Guide

## Quick Start (Easiest Method)

**For Windows Users:**
1. Double-click `START_SYSTEM.bat`
2. Wait for system checks to complete
3. System will automatically open in your browser

---

## Manual Startup Instructions

### Prerequisites Checklist

Before starting the system, ensure you have:

- [x] **Node.js** (v16.0.0 or higher) - [Download here](https://nodejs.org)
- [x] **npm** (comes with Node.js)
- [x] **MySQL/XAMPP** running on port 3306
- [x] Database `modulearn_db` created and configured
- [x] All project files in the `modulearn` folder

### Method 1: Using Startup Scripts (Recommended)

#### Windows PowerShell:
```powershell
# Enhanced version with full system checks
.\start-modulearn-enhanced.ps1

# OR original simple version
.\start-modulearn.ps1
```

#### Windows Batch File:
```cmd
# Double-click this file
START_SYSTEM.bat
```

### Method 2: Manual Startup

#### Step 1: Start MySQL
- Open XAMPP Control Panel
- Click "Start" for MySQL
- Verify it's running on port 3306

#### Step 2: Start Backend Server
```powershell
cd backend
npm start
```

Expected output:
```
Server running on port 5000
Connected to MySQL database
```

#### Step 3: Start Frontend Server (in new terminal)
```powershell
cd frontend
npm start
```

Expected output:
```
Compiled successfully!
Local: http://localhost:3000
```

---

## What the Enhanced Startup Script Does

The `start-modulearn-enhanced.ps1` script performs 9 comprehensive steps:

### 1️⃣ **Check Node.js Installation**
- Verifies Node.js is installed
- Checks version meets minimum requirement (v16.0.0+)
- Verifies npm is available

### 2️⃣ **Verify Project Structure**
- Checks for required folders: `backend`, `frontend`, `database`
- Verifies critical files exist: `server.js`, `package.json`

### 3️⃣ **Check Environment Configuration**
- Looks for `.env` files in backend and frontend
- Warns if environment files are missing

### 4️⃣ **Check MySQL Database**
- Verifies MySQL is running on port 3306
- Prompts user if database is not detected
- Allows continuation or cancellation

### 5️⃣ **Check/Install Dependencies**
- Checks if `node_modules` exists in backend
- Checks if `node_modules` exists in frontend
- Automatically runs `npm install` if needed
- Shows installation progress

### 6️⃣ **Check Upload Directories**
- Verifies `backend/uploads` directory exists
- Creates `backend/uploads/profiles` if missing
- Ensures file upload functionality will work

### 7️⃣ **Clean Up Ports**
- Kills any existing processes on port 5000 (backend)
- Kills any existing processes on port 3000 (frontend)
- Ensures ports are available for new instances

### 8️⃣ **Start Backend Server**
- Launches backend in a separate PowerShell window
- Displays API endpoints
- Waits for backend to be ready (up to 15 seconds)
- Confirms backend is running

### 9️⃣ **Start Frontend Server**
- Displays system summary with all URLs
- Shows login credentials
- Starts frontend in current window
- Opens browser automatically

---

## System Information After Startup

### URLs:
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:5000/api
- **Health Check:** http://localhost:5000/api/health

### Default Credentials:

#### Admin Account:
- Email: `admin@modulearn.com`
- Password: `admin123`

#### Test Student Account:
- Email: `student@modulearn.com`
- Password: `student123`

---

## Troubleshooting Common Issues

### Issue 1: "Node.js is not installed"
**Solution:**
1. Download Node.js from https://nodejs.org
2. Install the LTS (Long Term Support) version
3. Restart your computer
4. Run the startup script again

### Issue 2: "MySQL service not detected"
**Solution:**
1. Open XAMPP Control Panel
2. Start MySQL service
3. Verify it's running (should show green "Running" status)
4. Run the startup script again

### Issue 3: "Port 5000 is already in use"
**Solution:**
- The startup script automatically clears ports
- If problem persists, manually run:
  ```powershell
  .\stop-modulearn.ps1
  ```
- Then start again

### Issue 4: "Failed to install dependencies"
**Solution:**
1. Check your internet connection
2. Manually install:
   ```powershell
   cd backend
   npm install
   
   cd ../frontend
   npm install
   ```
3. Check for error messages and resolve

### Issue 5: Backend starts but frontend won't start
**Solution:**
1. Check the backend window for errors
2. Verify database connection in backend
3. Try stopping and restarting:
   ```powershell
   .\stop-modulearn.ps1
   .\start-modulearn-enhanced.ps1
   ```

### Issue 6: "Cannot connect to database"
**Solution:**
1. Verify MySQL is running
2. Check `backend/.env` file has correct database credentials:
   ```
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=
   DB_NAME=modulearn_db
   ```
3. Verify database `modulearn_db` exists
4. Run database schema if needed:
   ```sql
   mysql -u root -p modulearn_db < database/schema.sql
   ```

---

## Stopping the System

### Method 1: Using Stop Script
```powershell
.\stop-modulearn.ps1
```

### Method 2: Close Windows
- Close the backend PowerShell window
- Close the frontend PowerShell window (or press Ctrl+C)

### Method 3: Press Ctrl+C
- In backend window: Press Ctrl+C
- In frontend window: Press Ctrl+C

---

## Development Mode

### Running with Auto-Reload

#### Backend (with nodemon):
```powershell
cd backend
npm run dev
```

#### Frontend (already has hot-reload):
```powershell
cd frontend
npm start
```

---

## First Time Setup Checklist

If this is your first time running the system:

1. ✅ Install Node.js
2. ✅ Install MySQL/XAMPP
3. ✅ Create database `modulearn_db`
4. ✅ Run database schema:
   ```powershell
   mysql -u root -p modulearn_db < database/schema.sql
   ```
5. ✅ Create backend `.env` file (copy from `.env.example` if available)
6. ✅ Run initial data setup:
   ```powershell
   cd backend
   node create_admin.js
   ```
7. ✅ Run the startup script:
   ```powershell
   .\start-modulearn-enhanced.ps1
   ```

---

## Testing the Installation

After startup, verify everything is working:

### 1. Backend Health Check
Open browser: http://localhost:5000/api/health

Expected response:
```json
{
  "status": "OK",
  "message": "MODULEARN API is running",
  "timestamp": "2026-01-26T..."
}
```

### 2. Frontend Loads
Browser should automatically open: http://localhost:3000

### 3. Login Works
- Try logging in with admin credentials
- Verify dashboard loads

### 4. Database Connection
- Check backend window for "Connected to MySQL database" message

---

## Production Deployment

For production deployment, see:
- `INSTALLATION.md` - Full installation guide
- `DEPLOYMENT_GUIDE.md` - Production deployment steps
- `SYSTEM_ARCHITECTURE.md` - System architecture details

---

## Additional Resources

- **Setup Guide:** `SETUP_AND_RUN_GUIDE.md`
- **API Documentation (Archived):** `useless files/docs/API_DOCUMENTATION.md`
- **Quick Reference:** `QUICK_REFERENCE.md`
- **Thesis Alignment:** `useless files/THESIS_ALIGNMENT_ANALYSIS.md`
- **Admin Guide:** `ADMIN_SETUP_GUIDE.md`

---

## Support

If you encounter issues not covered in this guide:

1. Check the `TROUBLESHOOTING.md` file
2. Review error messages in both terminal windows
3. Check database logs
4. Verify all prerequisites are met

---

**Last Updated:** January 26, 2026  
**Version:** 2.0  
**Compatible with:** ModuLearn v1.0
