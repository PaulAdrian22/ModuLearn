# Netlify Deployment Guide

This project is configured to deploy frontend and backend API on a single Netlify site.

## What Was Added

- `netlify.toml` for build, functions directory, and redirects.
- `netlify/functions/api.js` to run Express API as a Netlify Function.
- Frontend API URL config in `frontend/src/config/api.js`.

## 1. Connect Repository

1. Open Netlify and click **Add new site** > **Import an existing project**.
2. Select your GitHub repository.
3. Netlify detects `netlify.toml` automatically.

## 2. Build Settings

If prompted manually, use:

- Build command: `npm install --prefix backend && npm install --prefix frontend && npm install --prefix netlify/functions && npm run build --prefix frontend`
- Publish directory: `frontend/build`
- Functions directory: `netlify/functions`
- Node version: `24`

## 3. Environment Variables (Required)

Set these in Netlify Site settings > Environment variables:

- `NODE_ENV=production`
- `DB_HOST=<your-db-host>`
- `DB_USER=<your-db-user>`
- `DB_PASSWORD=<your-db-password>`
- `DB_NAME=<your-db-name>`
- `DB_PORT=<your-db-port>`
- `JWT_SECRET=<your-jwt-secret>`
- `JWT_REFRESH_SECRET=<your-refresh-secret>`
- `CORS_ORIGIN=https://<your-netlify-site>.netlify.app`
- `REACT_APP_API_URL=/.netlify/functions/api/api`

## 4. Test URLs After Deploy

- Frontend app: `https://<your-netlify-site>.netlify.app`
- API health: `https://<your-netlify-site>.netlify.app/api/health`

## Important Limitation

Current file uploads use local disk storage in `backend/uploads`. Netlify Functions have ephemeral filesystem behavior, so uploaded files are not durable for production.

For production-safe uploads, move files to external storage (Cloudinary, AWS S3, or Supabase Storage).
