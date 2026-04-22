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
- `.github/workflows/azure-cost-guardrails.yml` (manual cost tuning)
- `.github/workflows/azure-nonprod-schedule.yml` (scheduled stop/start)

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
- `REQUEST_LOG_MODE=errors-only`
- `UPLOAD_CACHE_MAX_AGE_SECONDS=86400`
- `DB_CONNECTION_LIMIT=5`
- `API_CACHE_TTL_SECONDS=120`
- `API_CACHE_MAX_ENTRIES=500`

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

Cost tip:

- Keep `REQUEST_LOG_MODE=errors-only` in production to reduce log ingestion costs.
- Increase `UPLOAD_CACHE_MAX_AGE_SECONDS` when upload files are immutable and versioned.
- Keep `DB_CONNECTION_LIMIT` small (for example `5`) on Burstable MySQL tiers.
- Use short API cache (`API_CACHE_TTL_SECONDS`) to reduce repeated read load.

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

Azure Blob integration supports these paths when `STORAGE_PROVIDER=azure`:

- profile-picture uploads
- admin lesson media uploads (`/api/admin/upload-media`)
- simulation seeding assets (`seed_simulation_activities.js`)

Legacy records and import-generated media can still be local until you migrate:

- lesson-import generated assets
- simulation seeded assets

Run migration from the `backend` folder:

```powershell
npm run migrate:media:azure:dry
npm run migrate:media:azure
```

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

## 9. Azure Credit Optimization Quick Wins

Apply these in order for highest impact:

1. Use the smallest reliable compute SKU first:
  - App Service Plan: start with B1 Linux.
  - MySQL Flexible Server: start with Burstable tier.
2. Stop non-production resources on a schedule:
  - Stop backend and dev database during off-hours/weekends.
  - Restart only during active testing windows.
3. Cap observability costs:
  - Set Application Insights daily cap and retention to minimum practical values.
4. Keep static frontend off Azure compute:
  - Host frontend on GitHub Pages or Netlify.
  - Keep Azure for API + database only.
5. Move all media uploads to Blob Storage:
  - Avoid serving large files from App Service local disk.
  - Use Blob URLs/CDN-friendly caching for lessons and simulation assets.
6. Keep traffic egress low:
  - Use image/video compression and modern formats before upload.
  - Keep response compression enabled on backend.

## 10. Automating Items 1-5

### Item 1: App settings defaults

Use workflow:

- `.github/workflows/azure-cost-guardrails.yml`

It applies:

- `NODE_ENV=production`
- `REQUEST_LOG_MODE=errors-only`
- `UPLOAD_CACHE_MAX_AGE_SECONDS=86400`
- `DB_CONNECTION_LIMIT=5`
- `API_CACHE_TTL_SECONDS=120`
- `API_CACHE_MAX_ENTRIES=500`

### Item 2: Smallest stable SKU

The same workflow can right-size compute:

- App Service Plan SKU (default `B1`)
- MySQL Flexible Server SKU (default `Standard_B1ms`, tier `Burstable`)

### Item 3: Non-production stop/start schedule

Use workflow:

- `.github/workflows/azure-nonprod-schedule.yml`

Set guardrail variable before enabling schedule:

- `AZURE_NONPROD_ENABLED=true`

### Item 4: Application Insights cap and retention

`azure-cost-guardrails.yml` configures:

- retention days
- daily cap (GB)

### Item 5: Migrate lesson/simulation media to Blob

Run from `backend`:

```powershell
npm run migrate:media:azure:dry
npm run migrate:media:azure
```

This updates media URLs in:

- `module.sections`
- `module.diagnosticQuestions`
- `module.reviewQuestions`
- `module.finalQuestions`
- `simulation.ZoneData`
- `simulation.Description`
- `simulation.Instructions`

### Required Repository Secrets and Variables for Automation

Secrets:

- `AZURE_CREDENTIALS`

Variables:

- `AZURE_RESOURCE_GROUP`
- `AZURE_WEBAPP_NAME`
- `AZURE_APP_SERVICE_PLAN`
- `AZURE_MYSQL_SERVER_NAME`
- `AZURE_APP_INSIGHTS_NAME`
- `AZURE_NONPROD_RESOURCE_GROUP`
- `AZURE_NONPROD_WEBAPP_NAME`
- `AZURE_NONPROD_MYSQL_SERVER_NAME`
- `AZURE_NONPROD_ENABLED`
