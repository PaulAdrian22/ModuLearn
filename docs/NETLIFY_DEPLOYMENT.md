# Netlify Frontend + Azure Backend Deployment

This setup deploys the frontend on Netlify and keeps the backend API + database on Azure.

## Target Architecture

- Frontend: Netlify
- Backend API: Azure App Service
- Database: Azure Database for MySQL Flexible Server
- Upload storage: Azure Blob Storage (recommended)

## 1. Deploy Backend to Azure First

Complete backend deployment before deploying frontend:

- `docs/AZURE_BACKEND_DEPLOYMENT.md`

When backend is ready, note your API base URL:

- `https://<azure-webapp-name>.azurewebsites.net/api`

## 2. Connect Repository in Netlify

1. Open Netlify and click **Add new site** > **Import an existing project**.
2. Select your GitHub repository.
3. Netlify reads `netlify.toml` automatically.

## 3. Build Settings

If you set them manually, use:

- Build command: `npm ci --prefix frontend --no-audit --no-fund && npm run build --prefix frontend`
- Publish directory: `frontend/build`
- Node version: `20`

## 4. Netlify Environment Variables

Set these in Netlify site settings:

- `REACT_APP_API_URL=https://<azure-webapp-name>.azurewebsites.net/api`

Optional:

- `REACT_APP_NAME=MODULEARN`

Important:

- Trigger a new Netlify deploy after changing environment variables.

## 5. Azure Backend CORS for Netlify

In Azure App Service environment variables, set:

- `CORS_ORIGIN=https://<your-netlify-site>.netlify.app`

If you use a custom frontend domain, set `CORS_ORIGIN` to that exact origin.

## 6. Verify Deployment

- Frontend app: `https://<your-netlify-site>.netlify.app`
- Backend health: `https://<azure-webapp-name>.azurewebsites.net/api/health`
- Browser Network tab: API calls should go to the Azure domain.

## 7. Cost Notes

In this architecture, Netlify usage is mostly:

- Build minutes
- Bandwidth

Estimate monthly usage with:

```powershell
node scripts/netlify_credit_calculator.js --scenario=netlify-fullstack --deploys=30 --avg-build-minutes=4 --bandwidth-gb=80 --function-invocations=0
```

For a lower-credit frontend host option, see:

- `docs/GITHUB_PAGES_DEPLOYMENT.md`
