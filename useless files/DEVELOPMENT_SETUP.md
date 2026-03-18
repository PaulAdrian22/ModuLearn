# MODULEARN - Development Setup Guide

## Prerequisites

### Required Software
- **Node.js** (v16 or higher) - [Download](https://nodejs.org/)
- **Python** (v3.8 or higher) - [Download](https://www.python.org/) (if using Django backend)
- **Git** - [Download](https://git-scm.com/)
- **Database**: MySQL or PostgreSQL
  - MySQL: [Download](https://dev.mysql.com/downloads/)
  - PostgreSQL: [Download](https://www.postgresql.org/download/)
- **Code Editor**: VS Code (recommended)

### Optional Tools
- **Postman** - API testing
- **MySQL Workbench** / **pgAdmin** - Database management
- **GitHub Desktop** - Git GUI (optional)

## Initial Setup

### 1. Clone/Initialize Repository

If starting fresh:
```bash
cd "c:\Users\paula\Desktop\thesis\modulearn"
git init
git add .
git commit -m "Initial project setup"
```

If using GitHub:
```bash
git remote add origin <your-github-repo-url>
git branch -M main
git push -u origin main
```

### 2. Backend Setup

#### Option A: Node.js + Express

Navigate to backend folder:
```bash
cd backend
npm init -y
```

Install dependencies:
```bash
npm install express cors dotenv mysql2 sequelize bcryptjs jsonwebtoken
npm install --save-dev nodemon
```

Create folder structure:
```bash
mkdir config controllers models routes middleware utils
```

#### Option B: Python + Django

Navigate to backend folder:
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install django djangorestframework django-cors-headers mysqlclient PyJWT
pip freeze > requirements.txt
```

### 3. Frontend Setup

Navigate to frontend folder:
```bash
cd ..\frontend
```

#### Option A: React
```bash
npx create-react-app .
npm install axios react-router-dom @mui/material @emotion/react @emotion/styled chart.js react-chartjs-2
```

#### Option B: Vue
```bash
npm init vue@latest .
npm install
npm install axios vue-router vuex bootstrap chart.js vue-chartjs
```

### 4. Database Setup

#### MySQL Setup
1. Install MySQL Server
2. Create database:
```sql
CREATE DATABASE modulearn_db;
CREATE USER 'modulearn_user'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON modulearn_db.* TO 'modulearn_user'@'localhost';
FLUSH PRIVILEGES;
```

#### PostgreSQL Setup
1. Install PostgreSQL
2. Create database:
```sql
CREATE DATABASE modulearn_db;
CREATE USER modulearn_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE modulearn_db TO modulearn_user;
```

### 5. Environment Configuration

Create `.env` file in backend folder:

**For Node.js:**
```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_USER=modulearn_user
DB_PASSWORD=your_password
DB_NAME=modulearn_db
DB_PORT=3306

# JWT Configuration
JWT_SECRET=your_jwt_secret_key_here_make_it_long_and_random
JWT_EXPIRE=24h

# CORS
CORS_ORIGIN=http://localhost:3000

# BKT Default Parameters
BKT_DEFAULT_PL0=0.1
BKT_DEFAULT_PT=0.3
BKT_DEFAULT_PS=0.1
BKT_DEFAULT_PG=0.25
BKT_MASTERY_THRESHOLD=0.95
```

**For Django:**
```env
SECRET_KEY=your_django_secret_key_here
DEBUG=True
DATABASE_NAME=modulearn_db
DATABASE_USER=modulearn_user
DATABASE_PASSWORD=your_password
DATABASE_HOST=localhost
DATABASE_PORT=3306
```

Create `.env` file in frontend folder:
```env
REACT_APP_API_URL=http://localhost:5000/api
# or for Vue:
VITE_API_URL=http://localhost:5000/api
```

## Project Structure

### Backend (Node.js + Express)
```
backend/
├── config/
│   └── database.js          # Database connection
├── controllers/
│   ├── authController.js    # Authentication logic
│   ├── userController.js    # User management
│   ├── moduleController.js  # Module management
│   ├── assessmentController.js
│   └── bktController.js     # BKT algorithm
├── models/
│   ├── User.js
│   ├── Module.js
│   ├── Lesson.js
│   ├── Question.js
│   └── KnowledgeState.js
├── routes/
│   ├── authRoutes.js
│   ├── userRoutes.js
│   ├── moduleRoutes.js
│   ├── assessmentRoutes.js
│   └── bktRoutes.js
├── middleware/
│   ├── auth.js              # JWT verification
│   └── errorHandler.js
├── utils/
│   └── bktAlgorithm.js      # BKT calculations
├── .env
├── server.js                # Entry point
└── package.json
```

### Frontend (React)
```
frontend/
├── public/
├── src/
│   ├── components/
│   │   ├── Auth/
│   │   │   ├── Login.jsx
│   │   │   └── Register.jsx
│   │   ├── Student/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── ModuleViewer.jsx
│   │   │   ├── Assessment.jsx
│   │   │   └── Progress.jsx
│   │   ├── Instructor/
│   │   │   ├── ContentManager.jsx
│   │   │   └── Analytics.jsx
│   │   └── Common/
│   │       ├── Navbar.jsx
│   │       └── Sidebar.jsx
│   ├── services/
│   │   ├── api.js           # Axios configuration
│   │   ├── authService.js
│   │   ├── moduleService.js
│   │   └── bktService.js
│   ├── contexts/
│   │   └── AuthContext.jsx  # Global state
│   ├── utils/
│   │   └── helpers.js
│   ├── App.jsx
│   ├── index.js
│   └── App.css
├── .env
└── package.json
```

### Database
```
database/
├── schema.sql               # Database schema
├── migrations/              # Database migrations
│   ├── 001_create_users.sql
│   ├── 002_create_modules.sql
│   └── ...
└── seeds/                   # Sample data
    └── sample_data.sql
```

## Running the Application

### Start Backend (Node.js)
```bash
cd backend
npm run dev
# Server runs on http://localhost:5000
```

### Start Backend (Django)
```bash
cd backend
venv\Scripts\activate
python manage.py runserver
# Server runs on http://localhost:8000
```

### Start Frontend (React)
```bash
cd frontend
npm start
# App runs on http://localhost:3000
```

### Start Frontend (Vue)
```bash
cd frontend
npm run dev
# App runs on http://localhost:5173
```

## Next Steps

1. ✅ Project structure created
2. ⏳ Install dependencies
3. ⏳ Set up database
4. ⏳ Configure environment variables
5. ⏳ Create database schema
6. ⏳ Implement authentication
7. ⏳ Build BKT algorithm
8. ⏳ Develop API endpoints
9. ⏳ Create frontend components
10. ⏳ Test and debug

## Useful Commands

### Git Commands
```bash
git status                   # Check status
git add .                    # Stage all changes
git commit -m "message"      # Commit changes
git push                     # Push to remote
```

### npm Commands
```bash
npm install                  # Install dependencies
npm run dev                  # Start development server
npm test                     # Run tests
npm run build               # Build for production
```

### Database Commands (MySQL)
```bash
mysql -u root -p            # Login to MySQL
mysql -u modulearn_user -p modulearn_db < database/schema.sql
```

## Troubleshooting

### Common Issues

**Port already in use:**
```bash
# Windows - Kill process on port 5000
netstat -ano | findstr :5000
taskkill /PID <PID> /F
```

**Database connection error:**
- Check database credentials in `.env`
- Ensure MySQL/PostgreSQL service is running
- Verify database exists

**Module not found:**
```bash
npm install              # Reinstall dependencies
npm cache clean --force  # Clear npm cache
```

## Resources

- [Express.js Documentation](https://expressjs.com/)
- [React Documentation](https://react.dev/)
- [Django Documentation](https://docs.djangoproject.com/)
- [MySQL Documentation](https://dev.mysql.com/doc/)
- [Sequelize ORM](https://sequelize.org/)

## Support

For issues or questions during development, refer to:
- Project documentation in `/docs` folder
- README.md for overview
- SYSTEM_ARCHITECTURE.md for technical details
