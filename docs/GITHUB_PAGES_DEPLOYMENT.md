# GitHub Pages Deployment (Credit-Optimized)

Use this when you want the lowest Netlify credit usage.

## Important Constraint

GitHub Pages can host static frontend files only.

It cannot host:
- Node.js/Express backend
- MySQL/PostgreSQL database
- server-side API routes

Use any external backend platform for API + database, then point frontend to that API URL.

## Recommended Architecture

- Frontend: GitHub Pages
- Backend API: any Node host (Azure App Service, Render, Fly.io, VPS, etc.)
- Database: managed database provider
- Netlify: optional (can be zero usage in this setup)

## Files Added for This Setup

- Workflow: `.github/workflows/deploy-github-pages.yml`
- Frontend API config supports GitHub Pages host and env override.

## Setup Steps

1. Push this repository to GitHub.
2. In repository settings, enable GitHub Pages source as **GitHub Actions**.
3. Add repository secret:
   - `REACT_APP_API_URL=https://<your-backend-domain>/api`
4. Push to `main` (or run workflow manually).

If you choose Azure for backend + database, use:

- `docs/AZURE_BACKEND_DEPLOYMENT.md`

The workflow will:
- build `frontend`
- deploy to GitHub Pages
- create a `404.html` SPA fallback for client-side routes

## Verify

- Frontend URL: `https://<github-username>.github.io/<repo-name>/`
- Open browser devtools and confirm API calls go to `REACT_APP_API_URL`.

## Netlify Credit Calculator

Use:

```powershell
node scripts/netlify_credit_calculator.js --scenario=netlify-fullstack --deploys=30 --avg-build-minutes=4 --bandwidth-gb=80 --function-invocations=100000
```

Compare against zero-Netlify frontend scenario:

```powershell
node scripts/netlify_credit_calculator.js --scenario=github-pages-frontend
```
