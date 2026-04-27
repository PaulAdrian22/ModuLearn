# MODULEARN Localhost Migration Guide

This guide prepares a transferable package so another device can run MODULEARN on localhost.

## 1) On Source Device (this workspace)

1. Open PowerShell at project root.
2. Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\EXPORT_LOCALHOST_PACKAGE.ps1
```

3. Find the generated zip in:
- .\portable_exports\modulearn-localhost-portable-YYYYMMDD-HHMMSS.zip

## 2) On Target Device

1. Extract the zip to a folder, for example:
- C:\Users\<username>\Desktop\modulearn-portable

2. Open PowerShell in the extracted root folder.

3. Fastest option (recommended):

```powershell
powershell -ExecutionPolicy Bypass -File .\QUICK_SETUP_LOCALHOST.ps1 -AutoStart
```

This will:
- verify Node/npm
- prepare backend/frontend .env for localhost
- install missing backend/frontend dependencies
- run database bootstrap (with your MySQL credentials)
- auto-start the system

4. Manual option (if you prefer step-by-step):

```powershell
powershell -ExecutionPolicy Bypass -File .\SETUP_FRESH_INSTALL.ps1
```

5. Run database setup:

```powershell
powershell -ExecutionPolicy Bypass -File .\SETUP_DATABASE.ps1
```

6. Start the system:

```bat
START_SYSTEM.bat
```

## 3) Local URLs

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

## 4) Default Test Accounts

- Admin: admin@modulearn.com / admin123
- Student: student@modulearn.com / student123

## 5) Required Software on Target Device

- Node.js 18+ (LTS recommended)
- npm 8+
- MySQL 8+
- Windows PowerShell 5.1+

Note:
- `QUICK_SETUP_LOCALHOST.ps1` attempts to detect mysql CLI from PATH and common MySQL install folders.
- If MySQL is not installed/detected, it exits with a clear message (unless you pass `-SkipDatabase`).

## 6) Notes

- The export script removes local-only/generated folders such as node_modules and build.
- The export script removes exact .env files for safety.
- Keep backend/.env.example and frontend/.env.production.example as templates.

## 7) Troubleshooting

- If npm install fails: delete any partial node_modules and rerun SETUP_FRESH_INSTALL.ps1.
- If backend cannot connect to DB: verify backend/.env values for DB_USER and DB_PASSWORD.
- If ports are busy: run stop-modulearn.ps1, then start again.
- If you want setup without DB bootstrap: run `powershell -ExecutionPolicy Bypass -File .\QUICK_SETUP_LOCALHOST.ps1 -SkipDatabase`.
