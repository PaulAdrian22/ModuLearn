# 🚀 MODULEARN - Quick Start Guide for Fresh Installation
**For laptops that have just been reset**

## 📌 Installation Order

### 1️⃣ Install Prerequisites
```
✓ Node.js v20.x (LTS) - https://nodejs.org/
✓ MySQL 8.0+         - https://dev.mysql.com/downloads/installer/
```

**After installing, RESTART YOUR TERMINAL!**

---

### 2️⃣ Run Setup Script
```powershell
.\SETUP_FRESH_INSTALL.ps1
```

**What it does:**
- ✓ Verifies Node.js and npm
- ✓ Checks MySQL service
- ✓ Installs backend dependencies (~50 packages)
- ✓ Installs frontend dependencies (~1500 packages)
- ✓ Creates backend/.env configuration file

**Time:** ~5-10 minutes depending on internet speed

---

### 3️⃣ Setup Database
```powershell
.\SETUP_DATABASE.ps1
```

**What it does:**
- ✓ Creates modulearn_db database
- ✓ Imports schema (tables, sample data)
- ✓ Unlocks Lesson 1 by default
- ✓ Updates backend/.env with credentials

**You'll need:** Your MySQL root password

---

### 4️⃣ Start the System
```powershell
.\START_SYSTEM.bat
```

**Opens:**
- Backend:  http://localhost:5000
- Frontend: http://localhost:3000

**Default Admin Login:**
- Email: admin@modulearn.com
- Password: admin123

---

## 🔍 Verification Tests

### Test 1: Check Node.js
```powershell
node --version   # Should show v20.x.x
npm --version    # Should show 10.x.x
```

### Test 2: Check MySQL
```powershell
mysql -u root -p -e "SHOW DATABASES;"
# Should list modulearn_db
```

### Test 3: Check Backend Dependencies
```powershell
cd backend
npm list --depth=0
# Should show ~38 packages
```

### Test 4: Check Frontend Dependencies
```powershell
cd frontend
npm list --depth=0
# Should show ~17 packages
```

### Test 5: Test Database Connection
```powershell
cd backend
node ../database/test_connection.js
# Should show: Database Connection: PASSED
```

---

## ❌ Troubleshooting

### Issue: "node is not recognized"
**Solution:** Node.js not installed or terminal not restarted
1. Install Node.js from https://nodejs.org/
2. **Close and reopen your terminal**
3. Try again

### Issue: "MySQL not found"
**Solution:** MySQL not installed or service not running
1. Install MySQL from https://dev.mysql.com/downloads/installer/
2. Check service: `Get-Service -Name "*mysql*"`
3. Start service: `Start-Service MySQL80`

### Issue: "npm install failed"
**Solution:** Network or permission issues
1. Run terminal as Administrator
2. Clear npm cache: `npm cache clean --force`
3. Delete node_modules and try again

### Issue: "Database connection failed"
**Solution:** Wrong credentials or MySQL not running
1. Check MySQL service is running
2. Verify credentials in backend/.env
3. Test connection: `mysql -u root -p`

### Issue: "Port 3000 already in use"
**Solution:** Another app using the port
1. Find process: `netstat -ano | findstr :3000`
2. Kill process: `taskkill /PID <pid> /F`
3. Or change port in frontend/package.json

---

## 📂 Project Structure
```
modulearn/
├── backend/           # Node.js + Express API
│   ├── node_modules/  # Dependencies (installed)
│   ├── .env          # Configuration (created)
│   └── server.js     # Entry point
├── frontend/         # React application
│   ├── node_modules/ # Dependencies (installed)
│   ├── src/          # Source code
│   └── public/       # Static files
├── database/         # SQL schemas and scripts
│   ├── schema.sql    # Main database schema
│   └── *.sql         # Migration scripts
├── SETUP_FRESH_INSTALL.ps1  # Main setup script
├── SETUP_DATABASE.ps1       # Database setup script
└── START_SYSTEM.bat         # System launcher
```

---

## 🎯 System Requirements Met
✓ Node.js >= 16.0.0
✓ npm >= 8.0.0
✓ MySQL >= 5.7
✓ ~2GB free disk space
✓ Internet connection (for npm packages)

---

## 📞 Need Help?
1. Check INSTALLATION.md for detailed steps
2. Check STARTUP_GUIDE.md for running the system
3. Review error logs in terminal
4. Verify all prerequisites are installed

---

**Last Updated:** February 16, 2026
