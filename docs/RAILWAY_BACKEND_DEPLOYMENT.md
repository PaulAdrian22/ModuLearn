# Railway Backend Deployment (Option 2)

Deploy backend API and MySQL on Railway, while keeping frontend on Netlify.

## Architecture

- Frontend: Netlify
- Backend API: Railway Web Service (Node/Express)
- Database: Railway MySQL service

## 1. Create Railway Project

1. Go to Railway dashboard.
2. Create a new project.
3. Add service: MySQL.
4. Add service: GitHub Repo deployment for this repository.

## 2. Configure Backend Service

In Railway backend service settings:

- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`

Railway will assign a public domain to the backend service.

## 3. Set Backend Environment Variables

Set these in backend service Variables:

- `NODE_ENV=production`
- `PORT=${{PORT}}` (or leave unset; Railway injects PORT)
- `DB_HOST=${{MySQL.MYSQLHOST}}`
- `DB_USER=${{MySQL.MYSQLUSER}}`
- `DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}`
- `DB_NAME=${{MySQL.MYSQLDATABASE}}`
- `DB_PORT=${{MySQL.MYSQLPORT}}`
- `JWT_SECRET=<long-random-secret>`
- `JWT_REFRESH_SECRET=<another-long-random-secret>`
- `CORS_ORIGIN=https://<your-netlify-site>.netlify.app`

Optional:
- `JWT_EXPIRE=24h`
- `JWT_REFRESH_EXPIRE=7d`

## 4. Run Database Schema and Migrations

After backend is up, run SQL schema on Railway MySQL.

Minimum required:
1. `database/schema.sql`
2. Any required migration files used by your features:
   - `database/add_admin_role.sql`
   - `database/add_avatar_system.sql`
   - `database/add_lesson_content_columns.sql`
   - `database/add_lesson_time_difficulty.sql`
   - `database/add_simulation_table.sql`
   - `database/bkt_full_migration.sql`
   - `database/ensure_lesson_1_unlocked.sql`

You can execute these using Railway MySQL query editor or external client (MySQL Workbench).

## 5. Point Netlify Frontend to Railway API

In Netlify site environment variables:

- `REACT_APP_API_URL=https://<your-railway-backend-domain>/api`

Then trigger a fresh redeploy on Netlify.

## 6. Verify Deployment

Backend checks:
- `https://<your-railway-backend-domain>/api/health`

Frontend checks:
- Open Netlify app and test login.
- Browser Network tab should show login calls to Railway URL, not Netlify Functions URL.

## 7. Common Login Failure Causes

- `CORS_ORIGIN` does not exactly match Netlify domain.
- Database schema not fully applied.
- Missing `JWT_SECRET` / `JWT_REFRESH_SECRET`.
- Netlify still using old env vars (redeploy required).

## 8. Important Storage Note

Current uploads use local filesystem (`backend/uploads`).
On Railway, local files are not durable across redeploys/restarts.

For production durability, move uploads to external object storage:
- Cloudinary
- AWS S3
- Supabase Storage
