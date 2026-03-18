# MODULEARN API Documentation

Base URL: `http://localhost:5000/api`

## Authentication

All protected endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

---

## Authentication Endpoints

### Register User
**POST** `/auth/register`

Register a new user account.

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "age": 20,
  "educationalBackground": "High School Graduate"
}
```

**Response:** `201 Created`
```json
{
  "message": "Registration successful",
  "user": {
    "userId": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "age": 20,
    "educationalBackground": "High School Graduate"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Login
**POST** `/auth/login`

Authenticate and receive JWT token.

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:** `200 OK`
```json
{
  "message": "Login successful",
  "user": {
    "userId": 1,
    "name": "John Doe",
    "email": "john@example.com"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Verify Token
**GET** `/auth/verify`

Verify if current token is valid.

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK`
```json
{
  "valid": true,
  "user": {
    "userId": 1,
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

---

## Module Endpoints

### Get All Modules
**GET** `/modules`

Get list of all learning modules.

**Query Parameters:**
- `userId` (optional): Include user progress

**Response:** `200 OK`
```json
[
  {
    "ModuleID": 1,
    "ModuleTitle": "Introduction to Computer Hardware Servicing",
    "Description": "Foundation of CHS",
    "LessonOrder": 1,
    "Tesda_Reference": "TESDA-CHS-NC-II-Module-1",
    "Is_Unlocked": true,
    "CompletionRate": 75.50
  }
]
```

### Get Module by ID
**GET** `/modules/:id`

Get specific module details.

**Response:** `200 OK`
```json
{
  "ModuleID": 1,
  "ModuleTitle": "Introduction to Computer Hardware Servicing",
  "Description": "Foundation of CHS",
  "LessonOrder": 1,
  "Tesda_Reference": "TESDA-CHS-NC-II-Module-1",
  "Is_Unlocked": true
}
```

### Create Module
**POST** `/modules`

Create a new learning module (requires authentication).

**Request Body:**
```json
{
  "moduleTitle": "Network Configuration",
  "description": "Learn network setup and configuration",
  "lessonOrder": 7,
  "tesdaReference": "TESDA-CHS-NC-II-Module-7",
  "isUnlocked": false
}
```

### Get Module Questions
**GET** `/modules/:id/questions`

Get all questions for a specific module.

**Response:** `200 OK`
```json
[
  {
    "QuestionID": 1,
    "ModuleID": 1,
    "QuestionText": "What is Computer Hardware Servicing?",
    "CorrectAnswer": "Procedural workflow of installing, repairing, and maintaining hardware"
  }
]
```

---

## Question Endpoints

### Get All Questions
**GET** `/questions`

Get list of all questions.

**Query Parameters:**
- `moduleId` (optional): Filter by module

### Create Question
**POST** `/questions`

Create a new question (requires authentication).

**Request Body:**
```json
{
  "moduleId": 1,
  "questionText": "What does CHS stand for?",
  "correctAnswer": "Computer Hardware Servicing"
}
```

---

## Assessment Endpoints

### Create Assessment
**POST** `/assessments`

Start a new assessment (requires authentication).

**Request Body:**
```json
{
  "assessmentType": "Pre-Test"
}
```

**Response:** `201 Created`
```json
{
  "message": "Assessment started",
  "assessment": {
    "AssessmentID": 1,
    "UserID": 1,
    "AssessmentType": "Pre-Test",
    "ResultStatus": "In Progress"
  }
}
```

### Submit Answer
**POST** `/assessments/submit-answer`

Submit answer to a question (requires authentication).

**Request Body:**
```json
{
  "assessmentId": 1,
  "questionId": 5,
  "userAnswer": "Computer Hardware Servicing"
}
```

**Response:** `200 OK`
```json
{
  "message": "Answer submitted successfully",
  "isCorrect": true,
  "correctAnswer": null
}
```

### Complete Assessment
**POST** `/assessments/:id/complete`

Complete and grade assessment (requires authentication).

**Response:** `200 OK`
```json
{
  "message": "Assessment completed",
  "totalQuestions": 10,
  "correctAnswers": 8,
  "score": 80.00,
  "resultStatus": "Pass"
}
```

### Get My Assessments
**GET** `/assessments/my-assessments`

Get all user's assessments (requires authentication).

**Response:** `200 OK`
```json
[
  {
    "AssessmentID": 1,
    "AssessmentType": "Pre-Test",
    "DateTaken": "2025-11-14T10:30:00Z",
    "TotalScore": 80.00,
    "ResultStatus": "Pass"
  }
]
```

---

## Progress Endpoints

### Get User Progress
**GET** `/progress`

Get progress for all modules (requires authentication).

**Response:** `200 OK`
```json
[
  {
    "ProgressID": 1,
    "UserID": 1,
    "ModuleID": 1,
    "ModuleTitle": "Introduction to CHS",
    "CompletionRate": 75.50,
    "DateStarted": "2025-11-01T08:00:00Z",
    "DateCompletion": null
  }
]
```

### Start Module
**POST** `/progress/start`

Start a new module (requires authentication).

**Request Body:**
```json
{
  "moduleId": 1
}
```

### Update Progress
**PUT** `/progress/update`

Update module completion progress (requires authentication).

**Request Body:**
```json
{
  "moduleId": 1,
  "completionRate": 85.5
}
```

**Response:** `200 OK`
```json
{
  "message": "Progress updated successfully",
  "progress": {
    "ProgressID": 1,
    "CompletionRate": 85.50
  },
  "moduleCompleted": false
}
```

---

## BKT (Bayesian Knowledge Tracing) Endpoints

### Get Knowledge States
**GET** `/bkt/knowledge-states`

Get all user's knowledge states (requires authentication).

**Response:** `200 OK`
```json
[
  {
    "BkID": 1,
    "UserID": 1,
    "SkillName": "Hardware Identification",
    "PKnown": 0.7500,
    "PLearn": 0.3000,
    "PSlip": 0.1000,
    "PGuess": 0.2500
  }
]
```

### Initialize Skill Knowledge
**POST** `/bkt/initialize`

Initialize BKT tracking for a skill (requires authentication).

**Request Body:**
```json
{
  "skillName": "Hardware Identification"
}
```

### Update Knowledge
**POST** `/bkt/update`

Update knowledge state based on answer (requires authentication).

**Request Body:**
```json
{
  "skillName": "Hardware Identification",
  "isCorrect": true
}
```

**Response:** `200 OK`
```json
{
  "message": "Knowledge state updated",
  "skillName": "Hardware Identification",
  "previousPKnown": 0.7500,
  "newPKnown": 0.8250,
  "isMastered": false,
  "masteryThreshold": 0.9500
}
```

### Get Recommendation
**GET** `/bkt/recommendation`

Get recommended skill to practice next (requires authentication).

**Response:** `200 OK`
```json
{
  "recommendation": {
    "skillName": "Troubleshooting",
    "currentProficiency": 0.4500,
    "masteryThreshold": 0.9500,
    "reason": "This skill needs the most practice"
  }
}
```

---

## Learning Skill Endpoints

### Get Learning Skills
**GET** `/learning-skills`

Get all user's learning skill evaluations (requires authentication).

**Response:** `200 OK`
```json
[
  {
    "SkillID": 1,
    "UserID": 1,
    "AssessmentID": 1,
    "SkillCategory": "Technical Comprehension",
    "ScorePercentage": 85.50,
    "EvaluationDate": "2025-11-14T10:30:00Z"
  }
]
```

### Get Skills by Category
**GET** `/learning-skills/category/:category`

Get skills for specific category (requires authentication).

**Categories:**
- Memorization
- Analytical Thinking
- Critical Thinking
- Problem-Solving
- Technical Comprehension

### Create Skill Evaluation
**POST** `/learning-skills`

Create learning skill evaluation (requires authentication).

**Request Body:**
```json
{
  "assessmentId": 1,
  "skillCategory": "Technical Comprehension",
  "scorePercentage": 85.50
}
```

### Get Skill Analytics
**GET** `/learning-skills/analytics`

Get skill analytics by category (requires authentication).

**Response:** `200 OK`
```json
[
  {
    "skillCategory": "Technical Comprehension",
    "averageScore": "82.50",
    "evaluationCount": 5,
    "maxScore": "95.00",
    "minScore": "70.00",
    "proficiencyLevel": "Very Good"
  }
]
```

---

## User Endpoints

### Get Profile
**GET** `/users/profile`

Get current user profile (requires authentication).

**Response:** `200 OK`
```json
{
  "UserID": 1,
  "Name": "John Doe",
  "Email": "john@example.com",
  "Age": 20,
  "EducationalBackground": "High School Graduate"
}
```

### Update Profile
**PUT** `/users/profile`

Update user profile (requires authentication).

**Request Body:**
```json
{
  "name": "John Smith",
  "age": 21,
  "educationalBackground": "College Student"
}
```

### Change Password
**POST** `/users/change-password`

Change user password (requires authentication).

**Request Body:**
```json
{
  "currentPassword": "oldpassword123",
  "newPassword": "newpassword123"
}
```

### Get User Statistics
**GET** `/users/stats`

Get user learning statistics (requires authentication).

**Response:** `200 OK`
```json
{
  "modules": {
    "total": 7,
    "completed": 3
  },
  "assessments": {
    "total": 15,
    "passed": 12,
    "averageScore": "82.50"
  },
  "skills": {
    "total": 10,
    "mastered": 6
  }
}
```

---

## Error Responses

All endpoints may return these error responses:

### 400 Bad Request
```json
{
  "error": "Validation Error",
  "message": "Invalid input data",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ]
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "No token provided"
}
```

### 403 Forbidden
```json
{
  "error": "Forbidden",
  "message": "Access denied"
}
```

### 404 Not Found
```json
{
  "error": "Not Found",
  "message": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal Server Error",
  "message": "An unexpected error occurred"
}
```

---

## Rate Limiting

Currently no rate limiting implemented. Consider adding in production.

## Pagination

Not yet implemented. All list endpoints return full results.

## Testing the API

### Using cURL

```bash
# Register
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@test.com","password":"test123"}'

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123"}'

# Get modules (with token)
curl -X GET http://localhost:5000/api/modules \
  -H "Authorization: Bearer <your-token>"
```

### Using Postman

1. Import the API collection
2. Set environment variable `baseUrl` = `http://localhost:5000/api`
3. Set environment variable `token` after login
4. Use `{{baseUrl}}` and `{{token}}` in requests

---

## Development Notes

- All timestamps are in UTC
- Passwords are hashed using bcrypt
- JWT tokens expire in 24 hours (configurable)
- Database uses UTF-8 encoding
- All decimal values rounded to 2-4 decimal places
