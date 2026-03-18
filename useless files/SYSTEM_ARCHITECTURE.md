# MODULEARN - System Architecture

## Architecture Overview
MODULEARN follows a three-tier architecture pattern with a clear separation between presentation, application logic, and data layers.

```
┌─────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                       │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐   │
│  │   Student   │  │ Instructor  │  │  Administrator   │   │
│  │  Interface  │  │  Interface  │  │    Interface     │   │
│  └─────────────┘  └─────────────┘  └──────────────────┘   │
│         │                 │                   │              │
│         └─────────────────┴───────────────────┘              │
│                           │                                  │
└───────────────────────────┼──────────────────────────────────┘
                            │
                    ┌───────▼───────┐
                    │  Web Browser  │
                    │  (Frontend)   │
                    └───────┬───────┘
                            │
                    HTTPS / REST API
                            │
┌───────────────────────────▼──────────────────────────────────┐
│                    APPLICATION LAYER                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Backend API Server                       │   │
│  │  ┌────────────┐  ┌──────────────┐  ┌─────────────┐  │   │
│  │  │    Auth    │  │   Content    │  │  Analytics  │  │   │
│  │  │  Service   │  │   Service    │  │   Service   │  │   │
│  │  └────────────┘  └──────────────┘  └─────────────┘  │   │
│  │  ┌────────────┐  ┌──────────────┐  ┌─────────────┐  │   │
│  │  │    User    │  │  Assessment  │  │   Progress  │  │   │
│  │  │  Service   │  │   Service    │  │   Service   │  │   │
│  │  └────────────┘  └──────────────┘  └─────────────┘  │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │      Bayesian Knowledge Tracing Engine       │   │   │
│  │  │  ┌──────────┐  ┌──────────┐  ┌───────────┐  │   │   │
│  │  │  │ P(L0)    │  │  P(T)    │  │   P(S)    │  │   │   │
│  │  │  │ Initial  │  │ Learning │  │   Slip    │  │   │   │
│  │  │  └──────────┘  └──────────┘  └───────────┘  │   │   │
│  │  │  ┌──────────┐  ┌──────────────────────────┐ │   │   │
│  │  │  │  P(G)    │  │  Knowledge State Update  │ │   │   │
│  │  │  │  Guess   │  │      Algorithm           │ │   │   │
│  │  │  └──────────┘  └──────────────────────────┘ │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────────────────────┬──────────────────────────────────┘
                            │
                    Database Queries
                            │
┌───────────────────────────▼──────────────────────────────────┐
│                       DATA LAYER                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Database Management System              │   │
│  │  ┌────────────┐  ┌──────────────┐  ┌─────────────┐  │   │
│  │  │   Users    │  │   Modules    │  │  Knowledge  │  │   │
│  │  │   Table    │  │    Table     │  │   States    │  │   │
│  │  └────────────┘  └──────────────┘  └─────────────┘  │   │
│  │  ┌────────────┐  ┌──────────────┐  ┌─────────────┐  │   │
│  │  │  Lessons   │  │ Assessments  │  │   Student   │  │   │
│  │  │   Table    │  │    Table     │  │  Progress   │  │   │
│  │  └────────────┘  └──────────────┘  └─────────────┘  │   │
│  │  ┌────────────┐  ┌──────────────┐  ┌─────────────┐  │   │
│  │  │ Questions  │  │   Responses  │  │ BKT Params  │  │   │
│  │  │   Table    │  │    Table     │  │    Table    │  │   │
│  │  └────────────┘  └──────────────┘  └─────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

## Component Descriptions

### 1. Presentation Layer (Frontend)

#### Technologies
- **Framework**: React.js or Vue.js
- **Styling**: Tailwind CSS / Bootstrap
- **State Management**: Redux / Vuex
- **HTTP Client**: Axios
- **Routing**: React Router / Vue Router

#### Components
- **Student Interface**
  - Dashboard component
  - Module viewer
  - Assessment interface
  - Progress tracker
  - Profile management

- **Instructor Interface**
  - Content management
  - Student monitoring
  - Analytics dashboard
  - Report generation

- **Administrator Interface**
  - User management
  - System configuration
  - BKT parameter tuning
  - System monitoring

### 2. Application Layer (Backend)

#### Technologies
- **Framework**: Node.js + Express OR Python + Django
- **Authentication**: JWT (JSON Web Tokens)
- **API**: RESTful architecture
- **Middleware**: CORS, Body Parser, Error Handlers

#### Services

##### Authentication Service
```
Functions:
- register(userData)
- login(credentials)
- logout(token)
- resetPassword(email)
- verifyToken(token)
```

##### User Service
```
Functions:
- getUserProfile(userId)
- updateUserProfile(userId, data)
- getUsersByRole(role)
- assignUserToClass(userId, classId)
```

##### Content Service
```
Functions:
- getModules()
- getModuleById(moduleId)
- createModule(moduleData)
- updateModule(moduleId, moduleData)
- deleteModule(moduleId)
- getLessons(moduleId)
- createLesson(lessonData)
```

##### Assessment Service
```
Functions:
- getQuestions(lessonId)
- createQuestion(questionData)
- submitAnswer(userId, questionId, answer)
- evaluateAnswer(questionId, answer)
```

##### Progress Service
```
Functions:
- getStudentProgress(userId)
- updateProgress(userId, lessonId, score)
- getProgressByModule(userId, moduleId)
- calculateCompletionRate(userId)
```

##### Analytics Service
```
Functions:
- getStudentAnalytics(userId)
- getClassAnalytics(classId)
- generateReport(parameters)
- exportData(format, filters)
```

##### BKT Engine
```
Functions:
- initializeKnowledgeState(userId, competencyId)
- updateKnowledgeState(userId, competencyId, isCorrect)
- getKnowledgeState(userId, competencyId)
- calculateMastery(userId, competencyId)
- recommendNextTopic(userId)

Algorithm:
P(L_n) = P(L_n-1 | evidence)
P(L_n | correct) = [P(L_n-1) * (1 - P(S))] / [P(L_n-1) * (1 - P(S)) + (1 - P(L_n-1)) * P(G)]
P(L_n | incorrect) = [P(L_n-1) * P(S)] / [P(L_n-1) * P(S) + (1 - P(L_n-1)) * (1 - P(G))]
P(L_n+1) = P(L_n) + (1 - P(L_n)) * P(T)
```

### 3. Data Layer

#### Database Schema

##### Users Table
```sql
- user_id (PK)
- username
- email
- password_hash
- role (student/instructor/admin)
- first_name
- last_name
- created_at
- last_login
- is_active
```

##### Modules Table
```sql
- module_id (PK)
- module_name
- description
- order_index
- created_by (FK)
- created_at
- updated_at
```

##### Lessons Table
```sql
- lesson_id (PK)
- module_id (FK)
- lesson_title
- content
- order_index
- duration_minutes
- prerequisite_lesson_id (FK, nullable)
```

##### Competencies Table
```sql
- competency_id (PK)
- competency_name
- description
- module_id (FK)
```

##### Questions Table
```sql
- question_id (PK)
- lesson_id (FK)
- competency_id (FK)
- question_text
- question_type
- difficulty_level
- correct_answer
- explanation
- options (JSON)
```

##### Student_Responses Table
```sql
- response_id (PK)
- user_id (FK)
- question_id (FK)
- answer_given
- is_correct
- response_time_seconds
- timestamp
```

##### Knowledge_States Table
```sql
- knowledge_state_id (PK)
- user_id (FK)
- competency_id (FK)
- probability_known (P(L))
- last_updated
- attempts_count
- correct_count
```

##### BKT_Parameters Table
```sql
- parameter_id (PK)
- competency_id (FK)
- p_l0 (initial knowledge)
- p_t (transition/learning)
- p_s (slip)
- p_g (guess)
- mastery_threshold
```

##### Student_Progress Table
```sql
- progress_id (PK)
- user_id (FK)
- lesson_id (FK)
- status (not_started/in_progress/completed)
- score
- time_spent_minutes
- completion_date
- last_accessed
```

## API Endpoints

### Authentication
```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/reset-password
GET    /api/auth/verify-token
```

### Modules & Lessons
```
GET    /api/modules
GET    /api/modules/:id
POST   /api/modules
PUT    /api/modules/:id
DELETE /api/modules/:id
GET    /api/modules/:id/lessons
POST   /api/lessons
GET    /api/lessons/:id
PUT    /api/lessons/:id
```

### Assessments
```
GET    /api/lessons/:id/questions
POST   /api/questions
PUT    /api/questions/:id
POST   /api/assessments/submit
GET    /api/assessments/:id/results
```

### BKT & Learning Path
```
GET    /api/bkt/knowledge-state/:userId/:competencyId
POST   /api/bkt/update-knowledge
GET    /api/bkt/recommend-next/:userId
GET    /api/bkt/mastery/:userId
```

### Progress & Analytics
```
GET    /api/progress/student/:userId
GET    /api/progress/module/:userId/:moduleId
GET    /api/analytics/student/:userId
GET    /api/analytics/class/:classId
POST   /api/analytics/generate-report
```

### User Management
```
GET    /api/users/:id
PUT    /api/users/:id
GET    /api/users/role/:role
POST   /api/users/assign-class
```

## Security Measures

1. **Authentication**: JWT-based token authentication
2. **Authorization**: Role-based access control (RBAC)
3. **Data Validation**: Input sanitization and validation
4. **Encryption**: HTTPS for all communications
5. **Password Security**: Bcrypt hashing with salt
6. **SQL Injection Prevention**: Parameterized queries
7. **XSS Protection**: Output encoding
8. **CSRF Protection**: Token-based validation

## Performance Optimization

1. **Caching**: Redis for session and frequently accessed data
2. **Database Indexing**: On foreign keys and frequently queried fields
3. **Lazy Loading**: Load content on demand
4. **Pagination**: Limit data transfer per request
5. **CDN**: For static assets (images, videos)
6. **Code Splitting**: Frontend bundle optimization
7. **Database Connection Pooling**: Reuse database connections

## Scalability Considerations

1. **Modular Design**: Independent services for easy scaling
2. **Stateless API**: Enable horizontal scaling
3. **Database Optimization**: Proper indexing and query optimization
4. **Load Balancing**: Distribute traffic across servers
5. **Microservices Ready**: Architecture supports future decomposition

## Deployment Architecture

```
┌────────────────┐
│   DNS Server   │
└───────┬────────┘
        │
┌───────▼────────┐
│ Load Balancer  │
└───────┬────────┘
        │
    ┌───┴───┐
    │       │
┌───▼───┐ ┌─▼─────┐
│ Web   │ │  Web  │
│Server1│ │Server2│
└───┬───┘ └───┬───┘
    │         │
    └────┬────┘
         │
┌────────▼─────────┐
│  Database Server │
└──────────────────┘
```

## Technology Stack Summary

| Layer        | Technology Options                    |
|--------------|--------------------------------------|
| Frontend     | React.js / Vue.js                    |
| Backend      | Node.js + Express / Django           |
| Database     | MySQL / PostgreSQL                   |
| Authentication| JWT                                 |
| API Style    | RESTful                              |
| Hosting      | AWS / Heroku / DigitalOcean / Azure  |
| Version Control| Git + GitHub                        |

## Development Workflow

1. **Version Control**: Git branching strategy (main, develop, feature branches)
2. **Code Review**: Pull request reviews before merging
3. **Testing**: Unit tests, integration tests, E2E tests
4. **CI/CD**: Automated testing and deployment pipeline
5. **Documentation**: Inline code comments and API documentation
