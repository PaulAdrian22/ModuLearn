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
- **Frontend**: React 18 + Tailwind CSS, deployed on Vercel (PWA-installable, offline-capable for previously-loaded lessons)
- **Database + Auth + Storage**: Supabase (Postgres with RLS, Supabase Auth, Storage buckets)
- **BKT Engine**: Python with [pyBKT](https://github.com/CAHLR/pyBKT), deployed on Modal (serverless)
- **Edge Functions**: Deno/TypeScript on Supabase (knowledge-states, final-history, admin-delete-user, learner-metrics)

## Project Structure
```
modulearn/
├── frontend/             # React app (services/api/, hooks/, constants/, contexts/)
├── supabase/
│   ├── migrations/       # SQL schema migrations applied in order
│   ├── functions/        # Deno Edge Functions
│   └── seed.sql          # Baseline seed data
├── python_services/      # Modal app + pyBKT BKT engine + tests
├── scripts/              # One-off migration / sync scripts
└── lessons/              # Source lesson content (re-imported via editor)
```

## Research Information
- **Title**: MODULEARN: A Web-Based Individualized Learning Platform on Computer Hardware Servicing Using Bayesian Knowledge Tracing Algorithm
- **Domain**: Educational Technology, Adaptive Learning Systems
- **Target Users**: TESDA Computer Hardware Servicing NC II students

## Getting Started

- **First-time deploy**: see [DEPLOY.md](DEPLOY.md). Step-by-step from zero (no Supabase/Vercel/Modal accounts) to a live production URL in ~30 minutes.
- **Long-term operation**: see [SUSTAINABILITY.md](SUSTAINABILITY.md). Cost trajectory, backup recipe, monitoring setup, succession plan.

## License
(To be determined)
