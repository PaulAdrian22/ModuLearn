# MODULEARN - Entity Relationship Diagram (ERD) Documentation

## Database Structure Overview

The MODULEARN database consists of 8 core tables designed to support individualized learning with Bayesian Knowledge Tracing for Computer Hardware Servicing education aligned with TESDA CHS NC II standards.

---

## Table Definitions

### 1. USER

**Purpose**: Store learner and admin account information

| Field Name | Data Type | Constraints | Description |
|------------|-----------|-------------|-------------|
| UserID | INT | PRIMARY KEY, AUTO_INCREMENT | Unique identifier for each user |
| Name | VARCHAR(100) | NOT NULL | Full name of the learner or admin |
| Email | VARCHAR(100) | UNIQUE, NOT NULL | Used for login and communication |
| Password | VARCHAR(255) | NOT NULL | Encrypted password for authentication |
| Age | INT | NULL | Learner's age for demographic data |
| EducationalBackground | VARCHAR(100) | NULL | Indicates the learner's education level |

**Relationships:**
- One USER can have multiple ASSESSMENT records (1:N)
- One USER can have multiple PROGRESS records (1:N)
- One USER can have multiple LEARNING_SKILL records (1:N)
- One USER can have multiple BKT_MODEL records (1:N)

---

### 2. MODULE

**Purpose**: Store learning modules aligned with TESDA CHS NC II competencies

| Field Name | Data Type | Constraints | Description |
|------------|-----------|-------------|-------------|
| ModuleID | INT | PRIMARY KEY, AUTO_INCREMENT | Unique identifier for each module |
| ModuleTitle | VARCHAR(200) | NOT NULL | Title of the lesson or chapter |
| Description | TEXT | NULL | Summary of module content |
| LessonOrder | INT | NOT NULL | Determines the sequence of lessons |
| Tesda_Reference | VARCHAR(100) | NULL | Aligns module with TESDA CHS NC II standards |
| Is_Unlocked | BOOLEAN | DEFAULT FALSE | Indicates whether module is available |

**Relationships:**
- One MODULE can have multiple QUESTION records (1:N)
- One MODULE can have multiple PROGRESS records (1:N)

**Sequential Unlocking Logic:**
- Modules unlock sequentially based on completion of previous module
- First module (LessonOrder = 1) is **always unlocked by default** for all users
- Lesson 1 cannot be locked - it serves as the entry point for all learners

---

### 3. ASSESSMENT

**Purpose**: Track assessment attempts and results

| Field Name | Data Type | Constraints | Description |
|------------|-----------|-------------|-------------|
| AssessmentID | INT | PRIMARY KEY, AUTO_INCREMENT | Unique identifier for each assessment |
| UserID | INT | FOREIGN KEY, NOT NULL | References the user who took the assessment |
| AssessmentType | ENUM | NOT NULL | Type: Pre-Test, Quiz, Post-Test |
| DateTaken | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Date when assessment was conducted |
| TotalScore | DECIMAL(5,2) | DEFAULT 0.00 | Learner's total score |
| ResultStatus | ENUM | DEFAULT 'In Progress' | Status: Pass, Fail, In Progress |

**Relationships:**
- Each ASSESSMENT belongs to one USER (N:1)
- One ASSESSMENT can have multiple USER_ANSWER records (1:N)
- One ASSESSMENT can have multiple LEARNING_SKILL evaluations (1:N)

---

### 4. QUESTION

**Purpose**: Store assessment questions linked to modules

| Field Name | Data Type | Constraints | Description |
|------------|-----------|-------------|-------------|
| QuestionID | INT | PRIMARY KEY, AUTO_INCREMENT | Unique identifier for each question |
| ModuleID | INT | FOREIGN KEY, NOT NULL | Links question to its module |
| QuestionText | TEXT | NOT NULL | The question statement or prompt |
| CorrectAnswer | TEXT | NOT NULL | The expected correct response |

**Relationships:**
- Each QUESTION belongs to one MODULE (N:1)
- One QUESTION can have multiple USER_ANSWER records (1:N)

---

### 5. USER_ANSWER

**Purpose**: Store individual responses to assessment questions

| Field Name | Data Type | Constraints | Description |
|------------|-----------|-------------|-------------|
| AnswerID | INT | PRIMARY KEY, AUTO_INCREMENT | Unique identifier for each answer |
| AssessmentID | INT | FOREIGN KEY, NOT NULL | References the assessment |
| QuestionID | INT | FOREIGN KEY, NOT NULL | References the question |
| UserAnswer | TEXT | NOT NULL | The actual response submitted |
| IsCorrect | BOOLEAN | NOT NULL | Indicates if response is correct |

**Relationships:**
- Links ASSESSMENT and QUESTION entities (N:1 to both)
- Enables performance tracking per question

**Purpose in BKT:**
- Provides evidence for updating knowledge state
- Tracks accuracy for skill mastery calculation

---

### 6. PROGRESS

**Purpose**: Track learner progress through modules

| Field Name | Data Type | Constraints | Description |
|------------|-----------|-------------|-------------|
| ProgressID | INT | PRIMARY KEY, AUTO_INCREMENT | Unique identifier for progress record |
| UserID | INT | FOREIGN KEY, NOT NULL | References the learner |
| ModuleID | INT | FOREIGN KEY, NOT NULL | References the module |
| CompletionRate | DECIMAL(5,2) | DEFAULT 0.00 | Percentage of module completion |
| DateStarted | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | When learner began the module |
| DateCompletion | TIMESTAMP | NULL | When learner completed the module |

**Unique Constraint:** (UserID, ModuleID) - One progress record per user per module

**Relationships:**
- Links USER and MODULE entities (N:1 to both)

**Sequential Unlocking Logic:**
- System checks CompletionRate to unlock next module
- Typically requires CompletionRate >= 80% or DateCompletion IS NOT NULL

---

### 7. BKT_MODEL

**Purpose**: Store Bayesian Knowledge Tracing parameters for adaptive learning

| Field Name | Data Type | Constraints | Description |
|------------|-----------|-------------|-------------|
| BkID | INT | PRIMARY KEY, AUTO_INCREMENT | Unique identifier for BKT record |
| UserID | INT | FOREIGN KEY, NOT NULL | References the learner |
| SkillName | VARCHAR(100) | NOT NULL | Name of the skill being tracked |
| PKnown | DECIMAL(5,4) | DEFAULT 0.1000 | Probability learner knows the skill |
| PLearn | DECIMAL(5,4) | DEFAULT 0.3000 | Probability of learning after attempt |
| PSlip | DECIMAL(5,4) | DEFAULT 0.1000 | Probability of incorrect despite knowing |
| PGuess | DECIMAL(5,4) | DEFAULT 0.2500 | Probability of correct by guessing |

**Unique Constraint:** (UserID, SkillName) - One BKT record per user per skill

**Relationships:**
- Each BKT_MODEL record belongs to one USER (N:1)

**BKT Algorithm Application:**
```
Initial State: PKnown = 0.1 (10% prior knowledge)

After Each Question:
1. Update PKnown based on answer correctness
2. Apply learning transition using PLearn
3. Check if PKnown >= 0.95 (mastery threshold)

Adaptive Logic:
- If PKnown >= 0.95: Skill mastered, recommend advanced content
- If PKnown < 0.50: Provide remedial content
- If 0.50 <= PKnown < 0.95: Continue regular progression
```

---

### 8. LEARNING_SKILL

**Purpose**: Track performance across different cognitive skill categories

| Field Name | Data Type | Constraints | Description |
|------------|-----------|-------------|-------------|
| SkillID | INT | PRIMARY KEY, AUTO_INCREMENT | Unique identifier for skill record |
| UserID | INT | FOREIGN KEY, NOT NULL | References the learner |
| AssessmentID | INT | FOREIGN KEY, NOT NULL | Links to the assessment |
| SkillCategory | ENUM | NOT NULL | Learning skill area |
| ScorePercentage | DECIMAL(5,2) | DEFAULT 0.00 | Learner's score in skill category |
| EvaluationDate | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Date of evaluation |

**Skill Categories:**
1. Memorization
2. Analytical Thinking
3. Critical Thinking
4. Problem-Solving
5. Technical Comprehension

**Relationships:**
- Links USER and ASSESSMENT entities (N:1 to both)

**Purpose:**
- Provides personalized feedback on learning strengths/weaknesses
- Supports analytics and reporting
- Enables targeted skill development recommendations

---

## Relationships Summary

### One-to-Many Relationships

```
USER (1) ----< (N) ASSESSMENT
USER (1) ----< (N) PROGRESS
USER (1) ----< (N) BKT_MODEL
USER (1) ----< (N) LEARNING_SKILL

MODULE (1) ----< (N) QUESTION
MODULE (1) ----< (N) PROGRESS

ASSESSMENT (1) ----< (N) USER_ANSWER
ASSESSMENT (1) ----< (N) LEARNING_SKILL

QUESTION (1) ----< (N) USER_ANSWER
```

### Key Linking Tables

- **USER_ANSWER**: Links ASSESSMENT and QUESTION
- **PROGRESS**: Links USER and MODULE
- **LEARNING_SKILL**: Links USER and ASSESSMENT

---

## ERD Visual Representation

```
┌─────────────┐
│    USER     │
│  (UserID)   │
└──────┬──────┘
       │
       ├──────────────┬──────────────┬──────────────┐
       │              │              │              │
       ▼              ▼              ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌──────────────┐
│ ASSESSMENT  │ │  PROGRESS   │ │  BKT_MODEL  │ │LEARNING_SKILL│
│(AssessmentID)│ │(ProgressID) │ │   (BkID)    │ │  (SkillID)   │
└──────┬──────┘ └──────┬──────┘ └─────────────┘ └──────┬───────┘
       │               │                                │
       │               ▼                                │
       │        ┌─────────────┐                         │
       │        │   MODULE    │◄────────┐               │
       │        │ (ModuleID)  │         │               │
       │        └──────┬──────┘         │               │
       │               │                │               │
       │               ▼                │               │
       │        ┌─────────────┐         │               │
       │        │  QUESTION   │         │               │
       │        │(QuestionID) │         │               │
       │        └──────┬──────┘         │               │
       │               │                │               │
       │               │                │               │
       └───────┬───────┘                │               │
               │                        │               │
               ▼                        │               │
        ┌─────────────┐                 │               │
        │USER_ANSWER  │                 │               │
        │ (AnswerID)  │─────────────────┘               │
        └─────────────┘                                 │
               │                                        │
               └────────────────────────────────────────┘
```

---

## Database Constraints & Rules

### Primary Keys
- All tables have auto-incrementing integer primary keys
- Naming convention: TableName + "ID"

### Foreign Keys
- CASCADE deletion for dependent records
- Maintains referential integrity

### Unique Constraints
- `user.Email` - One email per user
- `progress.(UserID, ModuleID)` - One progress record per user per module
- `bkt_model.(UserID, SkillName)` - One BKT record per user per skill

### Indexes
- Foreign keys automatically indexed
- Email field indexed for faster login queries
- DateTaken indexed for assessment retrieval

---

## Sample Data Flow

### User Takes Assessment Flow:

```
1. User logs in → USER table verification
2. User selects module → MODULE table lookup (check Is_Unlocked)
3. System loads questions → QUESTION table retrieval
4. User submits answers → INSERT into USER_ANSWER
5. System calculates score → UPDATE ASSESSMENT.TotalScore
6. BKT algorithm updates → UPDATE BKT_MODEL.PKnown
7. Learning skills evaluated → INSERT into LEARNING_SKILL
8. Progress updated → UPDATE PROGRESS.CompletionRate
9. Next module unlocked → UPDATE MODULE.Is_Unlocked (if applicable)
```

---

## Key Features Enabled by ERD

1. **Individualized Learning**
   - BKT_MODEL tracks individual skill mastery
   - PROGRESS tracks personal pace through modules

2. **Sequential Unlocking**
   - MODULE.Is_Unlocked controlled by PROGRESS.CompletionRate
   - Ensures prerequisite mastery before advancement

3. **Adaptive Assessment**
   - USER_ANSWER provides evidence for BKT updates
   - LEARNING_SKILL identifies strengths/weaknesses

4. **TESDA Alignment**
   - MODULE.Tesda_Reference maps to official standards
   - Ensures curriculum compliance

5. **Performance Analytics**
   - Multiple tracking points: scores, skills, progress
   - Supports comprehensive reporting

---

## Database Views

### v_user_progress_summary
Shows overall progress for each user across all modules

### v_assessment_performance
Displays assessment scores and answer accuracy

### v_learning_skill_analysis
Analyzes performance across skill categories

### v_bkt_knowledge_state
Shows current knowledge state and proficiency levels

---

## Implementation Notes

### For Developers:

1. **Use prepared statements** to prevent SQL injection
2. **Hash passwords** using bcrypt before storing
3. **Validate email format** before insertion
4. **Check module unlock status** before allowing access
5. **Update BKT parameters** after every assessment response
6. **Calculate CompletionRate** based on questions answered correctly

### Sequential Module Unlocking Logic:

```sql
-- Check if user can unlock next module
SELECT m.ModuleID, m.Is_Unlocked
FROM module m
LEFT JOIN progress p ON m.ModuleID = p.ModuleID AND p.UserID = ?
WHERE m.LessonOrder = (
    SELECT MIN(LessonOrder) 
    FROM module 
    WHERE Is_Unlocked = FALSE
)
AND (p.CompletionRate >= 80 OR p.DateCompletion IS NOT NULL);
```

---

## ERD Compliance with Research Requirements

This ERD supports the MODULEARN research objectives:

1. **Bayesian Knowledge Tracing**: BKT_MODEL table implements algorithm
2. **Individualized Learning**: User-specific tracking across all tables
3. **Computer Hardware Servicing**: MODULE.Tesda_Reference alignment
4. **Web-Based Platform**: Relational structure supports web application
5. **Assessment & Feedback**: Comprehensive tracking through multiple tables
6. **Progress Monitoring**: PROGRESS and LEARNING_SKILL tables

---

## Future Enhancements (Optional)

- **FEEDBACK** table for instructor comments
- **NOTIFICATION** table for system alerts
- **ACTIVITY_LOG** table for detailed user actions
- **CERTIFICATE** table for completion certificates
- **MEDIA** table for storing video/image references
