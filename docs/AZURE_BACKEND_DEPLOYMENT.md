# Azure Backend + Database Deployment Guide

This guide deploys MODULEARN backend to Azure while frontend can stay on GitHub Pages or Netlify.

## Target Architecture

- Frontend: GitHub Pages or Netlify
- Backend API: Azure App Service (Linux, Node.js)
- Database: Azure Database for MySQL Flexible Server
- Uploads: Azure Blob Storage (profile pictures already scaffolded in code)

## 1. Create Azure Resources

Create these resources in one region:

1. Resource Group
2. App Service Plan (Linux)
3. Web App (Node 20)
4. Azure Database for MySQL Flexible Server
5. Storage Account + Blob Container

Recommended container name: `modulearn-assets`

## 2. Deploy Backend from GitHub Actions

Workflow file:

- `.github/workflows/deploy-azure-backend.yml`

Required GitHub repository settings:

- Repository Variable: `AZURE_WEBAPP_NAME`
- Repository Secret: `AZURE_WEBAPP_PUBLISH_PROFILE`

How to get publish profile:

- Azure Portal > Web App > Get publish profile
- Save XML content into `AZURE_WEBAPP_PUBLISH_PROFILE` secret

## 3. Configure Azure App Settings (Backend)

Set these in Azure Web App > Environment variables:

### Required App Settings

- `NODE_ENV=production`
- `PORT=8080` (App Service may inject PORT automatically; this value is safe)
- `DB_HOST=<azure-mysql-host>`
- `DB_USER=<azure-mysql-user>`
- `DB_PASSWORD=<azure-mysql-password>`
- `DB_NAME=<azure-mysql-database>`
- `DB_PORT=3306`
- `JWT_SECRET=<long-random-secret>`
- `JWT_REFRESH_SECRET=<long-random-refresh-secret>`
- `CORS_ORIGIN=<frontend-origin>`

Example `CORS_ORIGIN`:

- `https://<username>.github.io`
- or `https://<netlify-site>.netlify.app`

### Upload Storage Settings (Azure Blob)

- `STORAGE_PROVIDER=azure`
- `AZURE_STORAGE_CONTAINER_NAME=modulearn-assets`
- one of:
  - `AZURE_STORAGE_CONNECTION_STRING=<connection-string>`
  - or both `AZURE_STORAGE_ACCOUNT_NAME` + `AZURE_STORAGE_ACCOUNT_KEY`
- Optional: `AZURE_STORAGE_PUBLIC_BASE_URL=https://<account>.blob.core.windows.net/<container>`

## 4. Prepare MySQL Schema on Azure

Run at minimum:

1. `database/schema.sql`
2. Required migrations used in your app features:
   - `database/add_admin_role.sql`
   - `database/add_avatar_system.sql`
   - `database/add_lesson_content_columns.sql`
   - `database/add_lesson_time_difficulty.sql`
   - `database/add_simulation_table.sql`
   - `database/bkt_full_migration.sql`
   - `database/ensure_lesson_1_unlocked.sql`

You can use:

- Azure MySQL Query Editor
- MySQL Workbench
- existing script: `backend/bootstrap_remote_db.js`

## 5. Point Frontend to Azure API

Set frontend API URL in your frontend deployment:

- `REACT_APP_API_URL=https://<azure-webapp-name>.azurewebsites.net/api`

For GitHub Pages workflow, set repository secret:

- `REACT_APP_API_URL`

## 6. Verify

- Health endpoint:
  - `https://<azure-webapp-name>.azurewebsites.net/api/health`
- Login and profile update from frontend
- Upload profile image and confirm URL is Blob-hosted if `STORAGE_PROVIDER=azure`

## 7. Current Upload Scope

Azure Blob integration is scaffolded for profile-picture uploads.

Still local-file based unless you migrate separately:

- lesson-import generated assets
- simulation seeded assets

These can be migrated next using the same storage utility pattern.

## 8. Trial Viability Calculator

Use script:

```powershell
node scripts/azure_trial_calculator.js --scenario=standard
```

Other quick scenarios:

```powershell
node scripts/azure_trial_calculator.js --scenario=lean
node scripts/azure_trial_calculator.js --scenario=heavy
```

Simulate day-31 continuity after trial by enabling pay-as-you-go:

```powershell
node scripts/azure_trial_calculator.js --scenario=standard --payg=true
```

Important behavior reminder:

- Azure free trial credits expire after 30 days.
- Without upgrading to pay-as-you-go, resources stop after the trial window.
