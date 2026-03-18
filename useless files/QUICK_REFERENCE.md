# MODULEARN - Quick Reference Card

## 🚀 Quick Start Commands

### First Time Setup
```bash
# Backend
cd backend
npm install
copy .env.example .env
# Edit .env with your MySQL password

# Frontend
cd frontend
npm install

# Database
mysql -u root -p < database/schema.sql
```

### Run Application
```bash
# Terminal 1 - Backend
cd backend
npm start

# Terminal 2 - Frontend
cd frontend
npm start

# Then open: http://localhost:3000
```

## 🎨 Color Scheme

| Color | Hex | Usage |
|-------|-----|-------|
| Primary (Mint Green) | #33F5A3 | Buttons, highlights, progress |
| Background (Navy) | #083D77 | Main background |
| Secondary (Teal) | #1EC7C3 | Secondary elements |
| Success | #28C76F | Passed assessments |
| Warning | #FFC107 | In progress |
| Error | #EA5455 | Failed, errors |
| Info | #00CFE8 | Information |

## 📁 Project Structure

```
modulearn/
├── backend/
│   ├── controllers/     # 8 controllers (auth, user, module, etc.)
│   ├── routes/         # 8 route files
│   ├── middleware/     # auth & validators
│   ├── utils/          # BKT algorithm
│   ├── config/         # database config
│   ├── server.js       # Entry point
│   └── .env            # Environment variables
├── frontend/
│   ├── src/
│   │   ├── pages/      # Login, Register, Dashboard, ModuleView, Assessment, Progress, Profile
│   │   ├── components/ # Navbar, QuickAssessment
│   │   ├── App.js      # Routes & Auth
│   │   └── index.css   # Tailwind + custom styles
│   └── package.json
├── database/
│   └── schema.sql      # 8 tables DDL + sample data
└── docs/               # API docs, BKT algorithm docs
```

## 🔑 Key Features

### ✅ Implemented
- [x] User authentication (JWT)
- [x] Dashboard with module cards
- [x] Sequential module unlocking
- [x] Topic-based learning
- [x] Quick assessments with 30-min cooldown
- [x] Progress tracking
- [x] BKT knowledge estimation
- [x] 5 learning skills tracking
- [x] Profile management
- [x] Responsive design with Tailwind
- [x] Custom color scheme

### 🎯 Assessment Rules
- **Passing Score**: 75%
- **Cooldown Timer**: 30 minutes after failed attempt
- **Immediate Feedback**: Yes
- **Answer Review**: After submission
- **List Ordering**: Topics must be completed in order

## 📊 Database Tables (8 Total)

1. **USER** - User accounts & profiles
2. **MODULE** - Learning modules
3. **QUESTION** - Assessment questions
4. **ASSESSMENT** - Assessment instances
5. **USER_ANSWER** - User responses
6. **PROGRESS** - Module completion tracking
7. **BKT_MODEL** - Knowledge state parameters
8. **LEARNING_SKILL** - 5 skill categories

## 🔌 API Endpoints

```
Auth:        POST /api/auth/register, /login, /refresh-token
Users:       GET /api/users/profile, PUT /update, DELETE /delete/:id
Modules:     GET /api/modules, GET /:id
Progress:    GET /api/progress/stats/:userId, POST /start, PUT /update
BKT:         GET /api/bkt/user/:userId, POST /initialize, POST /update
Skills:      GET /api/skills/analytics/:userId, POST /evaluate
Assessments: POST /api/assessments/submit, POST /grade/:id
```

## 🛠️ Configuration

### Backend (.env)
```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=modulearn
PORT=5000
JWT_SECRET=your_secret_key
CLIENT_URL=http://localhost:3000
```

### Frontend (.env)
```env
REACT_APP_API_URL=http://localhost:5000/api
```

## 🧪 Test User Flow

1. Register account → Login
2. View Dashboard (Module 1 unlocked)
3. Click Module 1 → Read Topic 1
4. Take Quick Assessment
5. Pass (75%+) → Topic 2 unlocks
6. Complete all topics → Module 2 unlocks
7. View Progress page → See BKT stats
8. Edit Profile

## ⚙️ Customization Points

### Cooldown Timer
File: `frontend/src/components/QuickAssessment.js`
```javascript
const COOLDOWN_MINUTES = 30; // Change here
```

### Passing Score
Files: `QuickAssessment.js`, `Assessment.js`
```javascript
const passed = score >= 75; // Change threshold
```

### Colors
File: `frontend/tailwind.config.js`
```javascript
colors: {
  primary: { DEFAULT: '#33F5A3', ... },
  // Edit color values
}
```

## 🐛 Common Issues

| Issue | Solution |
|-------|----------|
| Port 5000 in use | Change PORT in backend/.env |
| DB connection error | Check MySQL credentials in .env |
| Module not found | Run `npm install` in backend/frontend |
| Tailwind errors | Normal, will resolve on build |
| CORS errors | Check CLIENT_URL in backend/.env |

## 📱 Pages

1. **Login** - User authentication
2. **Register** - New account creation
3. **Dashboard** - Module overview, stats
4. **ModuleView** - Topic content, quick assessments
5. **Assessment** - Full module assessments
6. **Progress** - Skills tracking, BKT visualization
7. **Profile** - Account management

## 🎓 Learning Skills (Bloom's Taxonomy)

1. Memorization
2. Analytical Thinking
3. Critical Thinking
4. Problem-Solving
5. Technical Comprehension

## 🔐 Security Features

- Bcrypt password hashing
- JWT token authentication
- Input validation (express-validator)
- CORS protection
- SQL injection prevention (prepared statements)
- Rate limiting

## 📈 BKT Parameters

- **PKnown**: Probability student knows skill
- **PLearn**: Probability of learning on each attempt
- **PSlip**: Probability of making a mistake despite knowing
- **PGuess**: Probability of guessing correctly

## 💡 Tips

- Modules unlock sequentially (must complete in order)
- Failed assessments have 30-min cooldown
- Progress auto-saves
- BKT updates with each answer
- All data persists in MySQL
- Responsive design works on mobile/tablet

## 📞 Getting Help

- Setup Guide: `SETUP_AND_RUN_GUIDE.md`
- API Docs: `docs/API_DOCUMENTATION.md`
- BKT Docs: `docs/BKT_ALGORITHM.md`
- System Architecture: `SYSTEM_ARCHITECTURE.md`

---
**MODULEARN** - Individualized Learning Platform for Computer Hardware Servicing
