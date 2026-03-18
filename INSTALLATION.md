# MODULEARN Installation Guide

Complete step-by-step installation instructions for setting up the MODULEARN platform.

## Table of Contents
1. [System Requirements](#system-requirements)
2. [Database Setup](#database-setup)
3. [Backend Setup](#backend-setup)
4. [Frontend Setup](#frontend-setup)
5. [Running the Application](#running-the-application)
6. [Verification](#verification)
7. [Troubleshooting](#troubleshooting)

---

## System Requirements

### Required Software
- **Node.js**: Version 16.x or higher ([Download](https://nodejs.org/))
- **MySQL**: Version 5.7 or higher ([Download](https://dev.mysql.com/downloads/))
- **Git**: Latest version ([Download](https://git-scm.com/))
- **Code Editor**: VS Code recommended ([Download](https://code.visualstudio.com/))

### Recommended Tools
- **MySQL Workbench**: For database management
- **Postman**: For API testing
- **Chrome/Firefox**: For testing the web interface

### System Specifications
- **RAM**: Minimum 4GB (8GB recommended)
- **Storage**: 2GB free space
- **OS**: Windows 10/11, macOS 10.15+, or Linux

---

## Database Setup

### Step 1: Install MySQL Server

1. Download and install MySQL Server
2. During installation, set a root password (remember this!)
3. Start MySQL service:
   ```powershell
   net start MySQL80
   ```

### Step 2: Create Database

Open PowerShell and connect to MySQL:
```powershell
mysql -u root -p
```

Execute these SQL commands:
```sql
CREATE DATABASE modulearn_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'modulearn_user'@'localhost' IDENTIFIED BY 'ModulearnSecurePass2025!';
GRANT ALL PRIVILEGES ON modulearn_db.* TO 'modulearn_user'@'localhost';
FLUSH PRIVILEGES;
USE modulearn_db;
```

### Step 3: Import Database Schema

Exit MySQL (type `exit`), then run:
```powershell
cd "c:\Users\paula\Desktop\thesis\modulearn"
mysql -u modulearn_user -p modulearn_db < database\schema.sql
```

Enter password: `ModulearnSecurePass2025!`

### Step 4: Verify Database

```powershell
mysql -u modulearn_user -p modulearn_db -e "SHOW TABLES;"
```

You should see 8 tables listed.

---

## Backend Setup

### Step 1: Navigate to Backend Directory

```powershell
cd "c:\Users\paula\Desktop\thesis\modulearn\backend"
```

### Step 2: Install Dependencies

```powershell
npm install
```

This will install:
- express (web framework)
- mysql2 (database driver)
- dotenv (environment variables)
- bcryptjs (password hashing)
- jsonwebtoken (authentication)
- cors (cross-origin requests)
- And more...

### Step 3: Configure Environment Variables

Copy the example environment file:
```powershell
Copy-Item .env.example .env
```

Edit `.env` file with your actual values:
```env
PORT=5000
NODE_ENV=development
DB_HOST=localhost
DB_USER=modulearn_user
DB_PASSWORD=ModulearnSecurePass2025!
DB_NAME=modulearn_db
DB_PORT=3306
JWT_SECRET=modulearn_jwt_secret_key_change_in_production_123456789
JWT_EXPIRE=24h
CORS_ORIGIN=http://localhost:3000
```

### Step 4: Test Database Connection

```powershell
npm run db:test
```

Expected output: "Database Connection: PASSED"

---

## Frontend Setup

### Step 1: Navigate to Frontend Directory

```powershell
cd ..\frontend
```

### Step 2: Initialize React Application

```powershell
npx create-react-app .
```

Wait for installation to complete (this may take a few minutes).

### Step 3: Install Additional Dependencies

```powershell
npm install axios react-router-dom @mui/material @emotion/react @emotion/styled chart.js react-chartjs-2
```

### Step 4: Configure API URL

Create `.env` file in frontend directory:
```env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_NAME=MODULEARN
```

---

## Running the Application

### Terminal 1: Start Backend Server

```powershell
cd "c:\Users\paula\Desktop\thesis\modulearn\backend"
npm run dev
```

Expected output:
```
Server running on port 5000
Database connected successfully
```

### Terminal 2: Start Frontend Development Server

```powershell
cd "c:\Users\paula\Desktop\thesis\modulearn\frontend"
npm start
```

Browser should automatically open to `http://localhost:3000`

---

## Verification

### 1. Check Backend API

Open browser and navigate to:
```
http://localhost:5000/api/health
```

Expected response:
```json
{
  "status": "OK",
  "database": "Connected"
}
```

### 2. Check Database Connection

In backend terminal, you should see:
```
Database connected successfully
Server running on port 5000
```

### 3. Check Frontend

Browser should display the React default page at `http://localhost:3000`

### 4. Run Full System Test

```powershell
# In backend directory
npm run db:test
```

All tests should pass.

---

## Troubleshooting

### Issue: MySQL Access Denied

**Error:** `Access denied for user 'modulearn_user'@'localhost'`

**Solution:**
```sql
-- Login as root
mysql -u root -p

-- Reset user password
DROP USER IF EXISTS 'modulearn_user'@'localhost';
CREATE USER 'modulearn_user'@'localhost' IDENTIFIED BY 'ModulearnSecurePass2025!';
GRANT ALL PRIVILEGES ON modulearn_db.* TO 'modulearn_user'@'localhost';
FLUSH PRIVILEGES;
```

### Issue: Port Already in Use

**Error:** `Port 5000 is already in use`

**Solution:**
```powershell
# Find process using port 5000
netstat -ano | findstr :5000

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F

# Or change port in backend/.env
PORT=5001
```

### Issue: Cannot Connect to Database

**Error:** `ECONNREFUSED` or `ER_ACCESS_DENIED_ERROR`

**Solution:**
1. Verify MySQL is running:
   ```powershell
   sc query MySQL80
   ```

2. If not running, start it:
   ```powershell
   net start MySQL80
   ```

3. Check credentials in `.env` file match database user

### Issue: npm Install Fails

**Error:** Various npm errors during installation

**Solution:**
```powershell
# Clear npm cache
npm cache clean --force

# Delete node_modules and package-lock.json
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json

# Reinstall
npm install
```

### Issue: Schema Import Fails

**Error:** SQL syntax errors during import

**Solution:**
```powershell
# Verify MySQL version
mysql --version

# If version is 5.x, you might need to adjust AUTO_INCREMENT syntax
# Manually execute schema.sql in MySQL Workbench
```

### Issue: React App Won't Start

**Error:** `react-scripts: command not found`

**Solution:**
```powershell
# Reinstall create-react-app
npm install react-scripts --save

# Or start fresh
cd ..
Remove-Item -Recurse -Force frontend
mkdir frontend
cd frontend
npx create-react-app .
```

---

## Quick Start Commands

### First Time Setup:
```powershell
# 1. Create database
mysql -u root -p < database\create_db.sql

# 2. Import schema
mysql -u modulearn_user -p modulearn_db < database\schema.sql

# 3. Install backend
cd backend
npm install
Copy-Item .env.example .env
npm run db:test

# 4. Install frontend
cd ..\frontend
npx create-react-app .
npm install axios react-router-dom
```

### Daily Development:
```powershell
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm start
```

---

## Next Steps After Installation

1. Verify all components are running
2. Access the application at `http://localhost:3000`
3. Check API endpoints at `http://localhost:5000/api`
4. Review logs for any errors
5. Proceed to backend development (Step 3)

---

## Additional Resources

- **MySQL Documentation**: https://dev.mysql.com/doc/
- **Node.js Documentation**: https://nodejs.org/docs/
- **Express Documentation**: https://expressjs.com/
- **React Documentation**: https://react.dev/

---

## Support

For installation issues:
1. Check the troubleshooting section above
2. Review error messages carefully
3. Verify all prerequisites are installed
4. Check that all services are running
5. Refer to documentation files in `/docs` folder

---

## Installation Checklist

- [ ] MySQL Server installed and running
- [ ] Database `modulearn_db` created
- [ ] User `modulearn_user` created with privileges
- [ ] Database schema imported successfully
- [ ] Node.js installed (version 16+)
- [ ] Backend dependencies installed
- [ ] Backend `.env` configured
- [ ] Database connection test passed
- [ ] Frontend created with Create React App
- [ ] Frontend dependencies installed
- [ ] Backend server starts without errors
- [ ] Frontend development server starts
- [ ] Can access frontend at localhost:3000
- [ ] Can access backend API at localhost:5000

Once all items are checked, installation is complete!
