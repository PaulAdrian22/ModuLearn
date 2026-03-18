# MODULEARN - Project Requirements Document

## 1. Executive Summary
MODULEARN is a web-based platform designed to deliver individualized learning experiences for Computer Hardware Servicing (CHS) education through the implementation of Bayesian Knowledge Tracing algorithm.

## 2. Functional Requirements

### 2.1 User Management
- **User Registration & Authentication**
  - Student registration with email verification
  - Instructor/Admin login system
  - Role-based access control (Student, Instructor, Admin)
  - Password recovery mechanism

### 2.2 Learning Content Management
- **Module Management**
  - Create, Read, Update, Delete (CRUD) operations for modules
  - Hierarchical structure: Modules → Lessons → Topics
  - Support for multimedia content (text, images, videos, PDFs)
  - Content versioning and updates
  
- **Assessment Management**
  - Create various question types (Multiple Choice, True/False, Practical Tasks)
  - Map questions to specific competencies
  - Define difficulty levels
  - Configure correct answers and explanations

### 2.3 Bayesian Knowledge Tracing (BKT)
- **Core Parameters**
  - P(L0): Initial knowledge probability
  - P(T): Probability of learning/transitioning from unknown to known
  - P(S): Probability of slip (knowing but answering incorrectly)
  - P(G): Probability of guess (not knowing but answering correctly)

- **Functionality**
  - Track knowledge state for each skill/competency
  - Update probabilities after each student response
  - Calculate mastery thresholds (typically 0.95)
  - Maintain historical knowledge state data

### 2.4 Adaptive Learning
- **Personalization Engine**
  - Recommend next topic based on current knowledge state
  - Adjust content difficulty dynamically
  - Skip mastered topics
  - Provide remedial content for struggling areas
  - Generate individualized learning paths

### 2.5 Student Interface
- **Dashboard**
  - View enrolled courses/modules
  - Display overall progress
  - Show recommended next steps
  - Access learning history
  
- **Learning Experience**
  - Sequential content delivery
  - Interactive assessments
  - Immediate feedback on responses
  - Hints and explanations
  - Bookmark and note-taking features

### 2.6 Progress Tracking & Analytics
- **Student Analytics**
  - Knowledge state visualization
  - Progress per module/competency
  - Time spent on learning
  - Assessment scores and trends
  - Mastery levels
  
- **Instructor Analytics**
  - Class-wide performance overview
  - Individual student progress
  - Identify struggling students
  - Topic difficulty analysis
  - Generate reports (PDF/Excel)

### 2.7 Administrative Functions
- **User Management**
  - Manage student and instructor accounts
  - Assign students to classes/groups
  - Monitor system usage
  
- **Content Administration**
  - Approve/review content submissions
  - Manage course catalogs
  - Configure BKT parameters
  - System settings and configuration

## 3. Non-Functional Requirements

### 3.1 Performance
- Page load time < 3 seconds
- Support 100+ concurrent users
- Real-time BKT calculations < 500ms
- Database query optimization

### 3.2 Security
- HTTPS encryption
- SQL injection prevention
- XSS (Cross-Site Scripting) protection
- CSRF (Cross-Site Request Forgery) tokens
- Secure password hashing (bcrypt/Argon2)
- Session management and timeout

### 3.3 Usability
- Responsive design (mobile, tablet, desktop)
- Intuitive user interface
- Accessibility compliance (WCAG 2.1)
- Multi-browser support (Chrome, Firefox, Safari, Edge)

### 3.4 Reliability
- 99% uptime target
- Automated database backups
- Error logging and monitoring
- Graceful error handling

### 3.5 Scalability
- Modular architecture for easy expansion
- Database optimization for growth
- Horizontal scaling capability

## 4. Computer Hardware Servicing Content Areas

### Module 1: Installation and Configuration
- Computer assembly
- BIOS/UEFI setup
- Operating system installation
- Driver installation

### Module 2: Diagnosis and Troubleshooting
- Hardware diagnostics
- Common hardware problems
- Troubleshooting methodology
- Repair vs. replace decisions

### Module 3: Preventive Maintenance
- Cleaning procedures
- System updates
- Performance optimization
- Safety protocols

### Module 4: Networking Basics
- Network configuration
- Cable management
- Basic networking troubleshooting

### Module 5: Professional Practice
- Customer service
- Documentation
- Safety and ESD precautions
- Tool usage

## 5. Technical Specifications

### 5.1 Frontend
- Framework: React.js or Vue.js
- State Management: Redux/Vuex
- UI Library: Bootstrap/Material-UI/Tailwind CSS
- Charts: Chart.js or D3.js

### 5.2 Backend
- Framework: Node.js (Express) or Python (Django/Flask)
- API: RESTful architecture
- Authentication: JWT (JSON Web Tokens)
- File Upload: Multer/similar library

### 5.3 Database
- Relational: MySQL or PostgreSQL
- NoSQL Option: MongoDB (for flexible content storage)
- ORM: Sequelize (Node.js) or Django ORM (Python)

### 5.4 BKT Implementation
- Custom algorithm implementation
- Efficient probability calculations
- Data persistence for knowledge states
- Historical tracking

## 6. Development Environment
- Version Control: Git/GitHub
- Code Editor: VS Code
- API Testing: Postman
- Database Management: phpMyAdmin/pgAdmin/MongoDB Compass

## 7. Success Metrics
- Student engagement rates
- Knowledge retention improvement
- Time to competency mastery
- User satisfaction scores
- System performance metrics

## 8. Constraints & Assumptions
- Internet connectivity required
- Modern web browser needed
- Basic computer literacy assumed
- Content will be in English (initially)

## 9. Future Enhancements
- Mobile application
- Gamification elements
- Peer collaboration features
- AI-enhanced content recommendations
- Integration with LMS platforms
- Offline mode capability

## 10. Timeline
- Phase 1 (Foundation): 2-3 weeks
- Phase 2 (Core Development): 4-6 weeks
- Phase 3 (UI & Features): 3-4 weeks
- Phase 4 (Testing & Deployment): 2-3 weeks

**Total Estimated Duration**: 11-16 weeks
