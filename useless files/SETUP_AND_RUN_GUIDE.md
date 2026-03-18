# MODULEARN - Complete Setup and Run Guide

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v16 or higher) - [Download here](https://nodejs.org/)
- **MySQL** (v8.0 or higher) - [Download here](https://dev.mysql.com/downloads/)
- **Git** (optional, for version control)

## Initial Setup

### 1. Database Setup

1. **Start MySQL Server**
   - Open MySQL Workbench or command line
   - Ensure MySQL server is running

2. **Create Database**
   ```sql
   CREATE DATABASE modulearn;
   ```

3. **Import Schema**
   - Open the file: `database/schema.sql`
   - Execute the entire script in MySQL Workbench or via command line:
   ```bash
   mysql -u root -p modulearn < database/schema.sql
   ```
   - This will create all 8 tables and insert sample data

4. **Verify Database**
   ```sql
   USE modulearn;
   SHOW TABLES;
   -- Should show: USER, ASSESSMENT, MODULE, QUESTION, USER_ANSWER, PROGRESS, BKT_MODEL, LEARNING_SKILL
   ```

### 2. Backend Setup

1. **Navigate to backend directory**
   ```bash
   cd backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```
   This installs: express, mysql2, bcryptjs, jsonwebtoken, cors, dotenv, express-validator

3. **Configure environment variables**
   - Copy `.env.example` to `.env`:
   ```bash
   copy .env.example .env
   ```
   
   - Edit `.env` file with your MySQL credentials:
   ```env
   # Database Configuration
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_mysql_password
   DB_NAME=modulearn
   DB_PORT=3306

   # Server Configuration
   PORT=5000
   NODE_ENV=development

   # JWT Secret (change this to a random string)
   JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
   JWT_EXPIRES_IN=7d
   JWT_REFRESH_EXPIRES_IN=30d

   # CORS Configuration
   CLIENT_URL=http://localhost:3000
   ```

4. **Test database connection**
   ```bash
   cd database
   node test_connection.js
   ```
   - Should show: "Database connected successfully"

### 3. Frontend Setup

1. **Navigate to frontend directory**
   ```bash
   cd ../frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```
   This installs: react, react-router-dom, axios, tailwindcss, autoprefixer, postcss

3. **Configure environment variables**
   - Create `.env` file in frontend folder:
   ```env
   REACT_APP_API_URL=http://localhost:5000/api
   ```

## Running the Application

### Method 1: Run Backend and Frontend Separately (Recommended for Development)

#### Terminal 1 - Backend Server
```bash
cd backend
npm start
```
Expected output:
```
Server running on port 5000
Database connected successfully
```

#### Terminal 2 - Frontend Development Server
```bash
cd frontend
npm start
```
Expected output:
```
Compiled successfully!
You can now view modulearn in the browser.
  Local:            http://localhost:3000
```

### Method 2: Run Both from Root Directory

Create `package.json` in root directory:
```json
{
  "name": "modulearn",
  "version": "1.0.0",
  "scripts": {
    "start:backend": "cd backend && npm start",
    "start:frontend": "cd frontend && npm start",
    "start": "concurrently \"npm run start:backend\" \"npm run start:frontend\"",
    "install:all": "cd backend && npm install && cd ../frontend && npm install"
  },
  "devDependencies": {
    "concurrently": "^8.0.0"
  }
}
```

Then run:
```bash
npm install
npm start
```

## Accessing the Application

1. **Open your browser** and navigate to: `http://localhost:3000`

2. **Register a new account**
   - Click "Register" 
   - Fill in:
     - Name
     - Email
     - Password
     - Age
     - Educational Background
   - Click "Create Account"

3. **Login**
   - Use your registered email and password
   - You'll be redirected to the Dashboard

4. **Start Learning**
   - View available modules on Dashboard
   - Click on Module 1 (Introduction to Computer Hardware Servicing)
   - Read through the topic content
   - Take quick assessments
   - Track your progress

## Application Features

### Student Features

1. **Dashboard**
   - View all learning modules
   - See completion progress
   - View statistics (completed modules, average score, skills mastered)
   - Locked/unlocked module status

2. **Module Learning**
   - Read topic content
   - Take quick assessments after each topic
   - Progress tracking
   - Sequential unlocking (must complete previous modules first)

3. **Quick Assessments**
   - Multiple choice questions
   - Immediate feedback
   - **30-minute cooldown timer** for retries (prevents immediate retakes)
   - Requires 75% to pass
   - Answer review after completion

4. **Progress Tracking**
   - Overall completion percentage
   - Module completion status
   - Learning skills profile (5 categories based on Bloom's Taxonomy):
     - Memorization
     - Analytical Thinking
     - Critical Thinking
     - Problem-Solving
     - Technical Comprehension
   - BKT knowledge states (AI-powered knowledge estimation)

5. **Profile Management**
   - View personal information
   - Edit profile details
   - Account deletion option

### Color Scheme
- **Primary**: #33F5A3 (Mint Green) - Main actions, highlights
- **Background**: #083D77 (Navy) - Main background
- **Secondary**: #1EC7C3 (Teal) - Secondary elements
- **Success**: #28C76F - Correct answers, completion
- **Warning**: #FFC107 - Warnings, in-progress
- **Error**: #EA5455 - Errors, failed assessments
- **Info**: #00CFE8 - Information messages

## Troubleshooting

### Backend Issues

**Port already in use**
```
Error: listen EADDRINUSE: address already in use :::5000
```
Solution: Change PORT in `.env` file or kill process using port 5000:
```bash
# Windows
netstat -ano | findstr :5000
taskkill /PID <process_id> /F
```

**Database connection error**
```
Error: ER_ACCESS_DENIED_ERROR
```
Solution: Check your MySQL credentials in `.env` file

**Cannot find module errors**
```
Error: Cannot find module 'express'
```
Solution: Run `npm install` in backend directory

### Frontend Issues

**Module not found errors**
```
Module not found: Can't resolve 'axios'
```
Solution: Run `npm install` in frontend directory

**Proxy errors**
```
[HPM] Error occurred while trying to proxy
```
Solution: Ensure backend server is running on port 5000

**Tailwind styles not applying**
```
CSS errors about @tailwind directive
```
Solution: These warnings are normal. Tailwind processes them during build.

### Database Issues

**Table doesn't exist**
```
Error: ER_NO_SUCH_TABLE: Table 'modulearn.USER' doesn't exist
```
Solution: Re-run the schema.sql file

**Duplicate entry error**
```
Error: ER_DUP_ENTRY: Duplicate entry
```
Solution: Clear and re-import database:
```sql
DROP DATABASE modulearn;
CREATE DATABASE modulearn;
-- Then re-run schema.sql
```

## API Endpoints Reference

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh-token` - Refresh JWT token
- `POST /api/auth/logout` - Logout user

### Users
- `GET /api/users/profile` - Get current user profile
- `PUT /api/users/update` - Update user profile
- `DELETE /api/users/delete/:id` - Delete user account

### Modules
- `GET /api/modules?userId=:id` - Get all modules with user progress
- `GET /api/modules/:id` - Get specific module details

### Progress
- `GET /api/progress/stats/:userId` - Get user progress statistics
- `POST /api/progress/start` - Start a module
- `PUT /api/progress/update` - Update module progress

### BKT (Bayesian Knowledge Tracing)
- `GET /api/bkt/user/:userId` - Get user's knowledge states
- `POST /api/bkt/initialize` - Initialize BKT for new user
- `POST /api/bkt/update` - Update knowledge state after answer

### Learning Skills
- `GET /api/skills/analytics/:userId` - Get user's skill analytics
- `POST /api/skills/evaluate` - Evaluate skills from assessment

### Assessments
- `POST /api/assessments/create` - Create new assessment
- `GET /api/assessments/:id` - Get assessment details
- `POST /api/assessments/submit` - Submit answer
- `POST /api/assessments/grade/:id` - Grade assessment

## Development Notes

### Adding New Modules

1. Add module content to `ModuleView.js` in the `moduleContent` object
2. Insert module record in `MODULE` table
3. Create questions for the module in `QUESTION` table
4. Content structure:
```javascript
moduleId: {
  title: 'Module Title',
  topics: [
    {
      title: 'Topic Title',
      content: 'Topic content text...',
      assessment: [
        {
          question: 'Question text?',
          options: ['Option A', 'Option B', 'Option C', 'Option D'],
          correctAnswer: 'Correct option text'
        }
      ]
    }
  ]
}
```

### Cooldown Timer Configuration

The cooldown timer for quiz retries is set in `QuickAssessment.js`:
```javascript
const COOLDOWN_MINUTES = 30; // Change this value
```

Default: 30 minutes. Users must wait this duration before retrying a failed assessment.

### Passing Score Configuration

Passing score is set to 75% in multiple components. To change:
- `QuickAssessment.js`: Line with `score >= 75`
- `Assessment.js`: Line with `results.score >= 75`

## Production Deployment

1. **Build Frontend**
   ```bash
   cd frontend
   npm run build
   ```

2. **Configure Backend for Production**
   - Set `NODE_ENV=production` in `.env`
   - Use strong JWT_SECRET
   - Configure proper CORS settings
   - Use environment-specific database credentials

3. **Serve Static Files**
   Add to `backend/server.js`:
   ```javascript
   app.use(express.static(path.join(__dirname, '../frontend/build')));
   app.get('*', (req, res) => {
     res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
   });
   ```

## Testing

Test the complete workflow:

1. ✓ Register new user account
2. ✓ Login with credentials
3. ✓ View dashboard with Module 1 unlocked
4. ✓ Open Module 1
5. ✓ Read Topic 1 content
6. ✓ Take Topic 1 quick assessment
7. ✓ Pass assessment (need 75%+)
8. ✓ Progress to Topic 2
9. ✓ Complete all topics in Module 1
10. ✓ Module 2 unlocks automatically
11. ✓ View progress page showing statistics
12. ✓ Check BKT knowledge tracking
13. ✓ Test cooldown timer on failed assessment retry

## Support

For issues or questions:
1. Check this guide's Troubleshooting section
2. Review API documentation in `docs/API_DOCUMENTATION.md`
3. Check BKT algorithm details in `docs/BKT_ALGORITHM.md`

## Quick Start Summary

```bash
# 1. Setup database
mysql -u root -p < database/schema.sql

# 2. Install backend
cd backend
npm install
copy .env.example .env
# Edit .env with your MySQL credentials

# 3. Install frontend
cd ../frontend
npm install

# 4. Run (in separate terminals)
cd backend && npm start
cd frontend && npm start

# 5. Open browser
# Navigate to http://localhost:3000
```

Enjoy using MODULEARN! 🚀
