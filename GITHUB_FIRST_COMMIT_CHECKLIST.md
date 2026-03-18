# GitHub First Commit Checklist

Use this guide to publish this project from:

`C:\Users\devpl\Desktop\modulearn - deploy`

## 1. Pre-Commit Checklist

- [ ] Confirm root contains only essential folders and files.
- [ ] Confirm non-essential docs are in `useless files/`.
- [ ] Confirm `.gitignore` exists and includes:
  - `node_modules/`
  - `.env` variants
  - logs and build output
- [ ] Confirm no secrets are hardcoded in tracked files.
- [ ] Confirm backend and frontend install/build locally.

## 2. Create GitHub Repository

Create an empty GitHub repository (recommended name: `modulearn`).

Do not add README, `.gitignore`, or license from GitHub UI if you want a clean first push.

## 3. First Commit and Push (PowerShell)

Run from project root:

```powershell
git init
git branch -M main
git add .
git status
git commit -m "Initial commit: organized ModuLearn deployment structure"
```

Connect to your GitHub repo:

```powershell
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

## 4. If Remote Already Exists

Check existing remotes:

```powershell
git remote -v
```

If `origin` is wrong, replace it:

```powershell
git remote set-url origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

## 5. Recommended Next Steps After Push

- Add a license file (`MIT` or your preferred license).
- Add branch protection on `main`.
- Add repository topics and short description.
- Add GitHub Actions for backend/frontend checks.
- Add release tags after stable milestones.

## 6. Quick Safety Checks

Before pushing, run this quick scan for sensitive data patterns:

```powershell
Get-ChildItem -Recurse -File | Select-String -Pattern "password|secret|api[_-]?key|token" -CaseSensitive:$false
```

If any real secrets appear in tracked files, remove them before commit.
