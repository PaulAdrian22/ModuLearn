# MODULEARN

**A Web-Based Individualized Learning Platform on Computer Hardware Servicing Using Bayesian Knowledge Tracing Algorithm**

## Overview
MODULEARN is an adaptive learning platform designed to provide personalized learning experiences for Computer Hardware Servicing education. The platform uses Bayesian Knowledge Tracing (BKT) to model student knowledge and adapt the learning path based on individual performance.

## Key Features
- **Adaptive Learning**: Personalized learning paths based on student performance
- **Bayesian Knowledge Tracing**: Real-time assessment of student knowledge states
- **Computer Hardware Servicing Curriculum**: Comprehensive modules covering CHS competencies
- **Progress Tracking**: Detailed analytics for students and instructors
- **Interactive Assessments**: Quizzes and exercises with immediate feedback

## Technology Stack
- **Frontend**: HTML5, CSS3, JavaScript (React/Vue.js)
- **Backend**: Node.js with Express / Python with Django
- **Database**: MySQL / PostgreSQL / MongoDB
- **BKT Algorithm**: Custom implementation with probability calculations

## Project Structure
```
modulearn/
├── backend/          # Server-side application
├── frontend/         # Client-side application
├── database/         # Database schemas and migrations
├── docs/             # Documentation
├── tests/            # Test files
└── assets/           # Static assets (images, videos)
```

## Development Timeline
- Phase 1: Foundation & Planning
- Phase 2: Core Development
- Phase 3: User Interface
- Phase 4: Testing & Deployment

## Research Information
- **Title**: MODULEARN: A Web-Based Individualized Learning Platform on Computer Hardware Servicing Using Bayesian Knowledge Tracing Algorithm
- **Domain**: Educational Technology, Adaptive Learning Systems
- **Target Users**: Computer Hardware Servicing Students

## Getting Started
(To be updated as development progresses)

## Localhost Migration (New Device Testing)
- Quick setup (recommended): `powershell -ExecutionPolicy Bypass -File .\QUICK_SETUP_LOCALHOST.ps1 -AutoStart`
- Export portable package: `powershell -ExecutionPolicy Bypass -File .\EXPORT_LOCALHOST_PACKAGE.ps1`
- Full instructions: `LOCALHOST_MIGRATION_GUIDE.md`

## Deployment Paths
- Netlify frontend + Azure backend deployment: `docs/NETLIFY_DEPLOYMENT.md`
- Credit-optimized frontend deployment (GitHub Pages): `docs/GITHUB_PAGES_DEPLOYMENT.md`
- Azure backend + database deployment: `docs/AZURE_BACKEND_DEPLOYMENT.md`

## License
(To be determined)
