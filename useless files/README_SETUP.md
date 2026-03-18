# 🚀 MODULEARN Setup Guide for Classmates

## Quick Start (3 Easy Steps!)

### ✅ Step 1: Install Node.js
1. Download Node.js from: https://nodejs.org
2. Install the **LTS version** (recommended)
3. Restart your computer after installation

### ✅ Step 2: Install Dependencies
1. Open PowerShell or Command Prompt
2. Navigate to the modulearn folder:
   ```bash
   cd path\to\modulearn
   ```
3. Install backend dependencies:
   ```bash
   cd backend
   npm install
   ```
4. Install frontend dependencies:
   ```bash
   cd ..\frontend
   npm install
   cd ..
   ```

### ✅ Step 3: Start the System

**Option A: Double-Click (Easiest!)**
- Just double-click `START_HERE.bat`
- Wait for browser to open
- Login and start learning!

**Option B: PowerShell**
```powershell
.\start-modulearn.ps1
```

**Option C: Command Prompt**
```cmd
START_HERE.bat
```

---

## 🎓 Login Credentials

### Admin Account
- **Email:** admin@modulearn.com
- **Password:** admin123

### Student Account  
- **Email:** student@modulearn.com
- **Password:** student123

---

## 🛑 How to Stop the Servers

**Option A: Double-Click**
- Double-click `STOP_HERE.bat`

**Option B: PowerShell**
```powershell
.\stop-modulearn.ps1
```

**Option C: Manual**
- Close both PowerShell windows (backend and frontend)

---

## 🌐 Access URLs

After starting:
- **Frontend (Student/Admin):** http://localhost:3000
- **Backend API:** http://localhost:5000
- **Health Check:** http://localhost:5000/api/health

---

## ⚠️ Troubleshooting

### "Port already in use" error
Run the stop script first:
```powershell
.\stop-modulearn.ps1
```
Then start again.

### "Node.js not found" error
- Make sure Node.js is installed
- Restart your computer
- Try running: `node --version` in terminal

### Backend won't start
1. Check if you have MySQL installed and running
2. Verify `.env` file exists in backend folder
3. Check backend window for specific error messages

### Frontend won't start
1. Make sure you ran `npm install` in frontend folder
2. Check if port 3000 is available
3. Try deleting `node_modules` and running `npm install` again

### Can't login
1. Make sure backend is running (check backend window)
2. Backend should show: "Server running on port 5000"
3. Try accessing: http://localhost:5000/api/health

---

## 📂 Folder Structure

```
modulearn/
├── backend/           # API server
│   ├── server.js     # Main backend file
│   └── package.json  # Backend dependencies
├── frontend/         # React app
│   └── package.json  # Frontend dependencies
├── START_HERE.bat    # 👈 Click this to start!
├── STOP_HERE.bat     # 👈 Click this to stop!
├── start-modulearn.ps1
├── stop-modulearn.ps1
└── README_SETUP.md   # This file
```

---

## 💡 Tips for Classmates

1. **First time setup takes longer** - Installing dependencies downloads many files
2. **Keep both windows open** - You need backend AND frontend running
3. **Don't close the PowerShell windows** while using the system
4. **Use the STOP script** before shutting down your laptop
5. **Check backend window** if you see login errors

---

## 🆘 Need Help?

If you encounter issues:
1. Read the error message in the PowerShell window
2. Check this README's Troubleshooting section
3. Make sure both backend and frontend are running
4. Contact Paula for assistance

---

## 📱 System Requirements

- **OS:** Windows 10/11
- **Node.js:** v14 or higher
- **RAM:** 4GB minimum (8GB recommended)
- **Browser:** Chrome, Edge, or Firefox (latest version)
- **MySQL:** Running database (for backend)

---

**Happy Learning! 🎉**
