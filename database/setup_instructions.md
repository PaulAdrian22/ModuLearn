# Database Setup Instructions for MODULEARN

## Prerequisites

Before setting up the database, ensure you have:
- MySQL Server installed (version 5.7 or higher) OR PostgreSQL (version 12 or higher)
- Database client tool (MySQL Workbench, phpMyAdmin, or command line)
- Administrative access to create databases and users

## Option 1: MySQL Setup

### Step 1: Install MySQL Server

**For Windows:**
1. Download MySQL Installer from [MySQL Official Website](https://dev.mysql.com/downloads/installer/)
2. Run the installer and select "Developer Default" or "Server Only"
3. Follow installation wizard
4. Set root password during installation
5. Complete installation

### Step 2: Access MySQL Command Line

Open Command Prompt or PowerShell and run:
```bash
mysql -u root -p
```
Enter your root password when prompted.

### Step 3: Create Database and User

Execute the following SQL commands:

```sql
-- Create the database
CREATE DATABASE modulearn_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create a dedicated user for the application
CREATE USER 'modulearn_user'@'localhost' IDENTIFIED BY 'ModulearnSecurePass2025!';

-- Grant all privileges on the database to the user
GRANT ALL PRIVILEGES ON modulearn_db.* TO 'modulearn_user'@'localhost';

-- Apply the privilege changes
FLUSH PRIVILEGES;

-- Verify database creation
SHOW DATABASES;

-- Switch to the new database
USE modulearn_db;
```

### Step 4: Import Schema

From command line (exit MySQL first):
```bash
mysql -u modulearn_user -p modulearn_db < "c:\Users\paula\Desktop\thesis\modulearn\database\schema.sql"
```

Or from MySQL Workbench:
1. Open MySQL Workbench
2. Connect to your MySQL server
3. Go to File > Run SQL Script
4. Select `schema.sql` file
5. Execute

### Step 5: Verify Installation

```sql
USE modulearn_db;

-- Show all tables
SHOW TABLES;

-- Expected output:
-- +------------------------+
-- | Tables_in_modulearn_db |
-- +------------------------+
-- | assessment             |
-- | bkt_model              |
-- | learning_skill         |
-- | module                 |
-- | progress               |
-- | question               |
-- | user                   |
-- | user_answer            |
-- +------------------------+

-- Verify table structure
DESCRIBE user;
DESCRIBE module;
DESCRIBE assessment;

-- Check sample data
SELECT * FROM user;
SELECT * FROM module;
```

## Option 2: PostgreSQL Setup

### Step 1: Install PostgreSQL

**For Windows:**
1. Download PostgreSQL installer from [PostgreSQL Official Website](https://www.postgresql.org/download/windows/)
2. Run the installer
3. Set postgres user password
4. Default port: 5432
5. Complete installation

### Step 2: Access PostgreSQL

Open Command Prompt and run:
```bash
psql -U postgres
```

### Step 3: Create Database and User

```sql
-- Create the database
CREATE DATABASE modulearn_db WITH ENCODING 'UTF8';

-- Create a dedicated user
CREATE USER modulearn_user WITH PASSWORD 'ModulearnSecurePass2025!';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE modulearn_db TO modulearn_user;

-- Connect to the database
\c modulearn_db

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO modulearn_user;
```

### Step 4: Adjust Schema for PostgreSQL

PostgreSQL requires slight syntax modifications. Use this command to modify the schema:

```sql
-- Replace AUTO_INCREMENT with SERIAL
-- Replace ENUM with CHECK constraints or custom types
-- Replace BOOLEAN with BOOLEAN (already compatible)
```

### Step 5: Import Schema

From command line:
```bash
psql -U modulearn_user -d modulearn_db -f "c:\Users\paula\Desktop\thesis\modulearn\database\schema.sql"
```

## Database Configuration File

Create a database configuration file for your application:

### For Node.js (config/database.js):

```javascript
module.exports = {
  development: {
    host: 'localhost',
    user: 'modulearn_user',
    password: 'ModulearnSecurePass2025!',
    database: 'modulearn_db',
    port: 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  },
  production: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'modulearn_user',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'modulearn_db',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  }
};
```

### For Python/Django (settings.py):

```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': 'modulearn_db',
        'USER': 'modulearn_user',
        'PASSWORD': 'ModulearnSecurePass2025!',
        'HOST': 'localhost',
        'PORT': '3306',
        'OPTIONS': {
            'charset': 'utf8mb4',
        },
    }
}
```

## Testing Database Connection

### MySQL Test (Command Line):

```bash
mysql -u modulearn_user -p modulearn_db -e "SELECT COUNT(*) FROM user;"
```

### Node.js Test Script:

Create `database/test_connection.js`:

```javascript
const mysql = require('mysql2');

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'modulearn_user',
  password: 'ModulearnSecurePass2025!',
  database: 'modulearn_db'
});

connection.connect((err) => {
  if (err) {
    console.error('Error connecting to database:', err);
    return;
  }
  console.log('Successfully connected to modulearn_db!');
  
  connection.query('SELECT COUNT(*) as count FROM user', (err, results) => {
    if (err) {
      console.error('Error querying database:', err);
      return;
    }
    console.log('User count:', results[0].count);
    connection.end();
  });
});
```

Run with:
```bash
node database/test_connection.js
```

## Database Backup and Restore

### Backup Database:

**MySQL:**
```bash
mysqldump -u modulearn_user -p modulearn_db > backup_$(date +%Y%m%d).sql
```

**PostgreSQL:**
```bash
pg_dump -U modulearn_user modulearn_db > backup_$(date +%Y%m%d).sql
```

### Restore Database:

**MySQL:**
```bash
mysql -u modulearn_user -p modulearn_db < backup_20251114.sql
```

**PostgreSQL:**
```bash
psql -U modulearn_user -d modulearn_db < backup_20251114.sql
```

## Security Best Practices

1. **Never commit database passwords to version control**
   - Use environment variables
   - Add `.env` to `.gitignore`

2. **Use strong passwords**
   - Minimum 12 characters
   - Mix of uppercase, lowercase, numbers, symbols

3. **Limit user privileges**
   - Don't use root user for application
   - Grant only necessary permissions

4. **Regular backups**
   - Daily automated backups
   - Store backups securely offsite

5. **Enable SSL/TLS for connections**
   - Especially important for production

## Troubleshooting

### Issue: Access Denied for User

**Solution:**
```sql
-- Verify user exists
SELECT User, Host FROM mysql.user WHERE User = 'modulearn_user';

-- Reset password if needed
ALTER USER 'modulearn_user'@'localhost' IDENTIFIED BY 'NewPassword123!';
FLUSH PRIVILEGES;
```

### Issue: Database Not Found

**Solution:**
```sql
-- List all databases
SHOW DATABASES;

-- Create if missing
CREATE DATABASE modulearn_db;
```

### Issue: Cannot Connect to MySQL Server

**Solution:**
1. Verify MySQL service is running:
   ```bash
   # Windows
   net start MySQL80
   
   # Check status
   sc query MySQL80
   ```

2. Check port 3306 is not blocked:
   ```bash
   netstat -an | findstr 3306
   ```

### Issue: Table Already Exists

**Solution:**
```sql
-- Drop all tables (CAUTION: This deletes all data)
DROP DATABASE modulearn_db;
CREATE DATABASE modulearn_db;

-- Then re-import schema
```

## Next Steps After Setup

1. Verify all 8 tables are created
2. Check foreign key relationships
3. Test sample data insertion
4. Run database views
5. Configure application connection
6. Test CRUD operations from application
7. Set up automated backups

## Useful MySQL Commands

```sql
-- Show current database
SELECT DATABASE();

-- Show table structure
DESCRIBE table_name;

-- Show table indexes
SHOW INDEX FROM table_name;

-- Show foreign keys
SELECT 
  TABLE_NAME,
  COLUMN_NAME,
  CONSTRAINT_NAME,
  REFERENCED_TABLE_NAME,
  REFERENCED_COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE REFERENCED_TABLE_NAME IS NOT NULL
  AND TABLE_SCHEMA = 'modulearn_db';

-- Show all views
SHOW FULL TABLES WHERE TABLE_TYPE = 'VIEW';

-- Count records in all tables
SELECT 'user' as table_name, COUNT(*) as count FROM user
UNION ALL
SELECT 'module', COUNT(*) FROM module
UNION ALL
SELECT 'assessment', COUNT(*) FROM assessment
UNION ALL
SELECT 'question', COUNT(*) FROM question
UNION ALL
SELECT 'user_answer', COUNT(*) FROM user_answer
UNION ALL
SELECT 'progress', COUNT(*) FROM progress
UNION ALL
SELECT 'bkt_model', COUNT(*) FROM bkt_model
UNION ALL
SELECT 'learning_skill', COUNT(*) FROM learning_skill;
```

## Database Monitoring

```sql
-- Check database size
SELECT 
  table_schema AS 'Database',
  ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS 'Size (MB)'
FROM information_schema.tables
WHERE table_schema = 'modulearn_db'
GROUP BY table_schema;

-- Check individual table sizes
SELECT 
  table_name AS 'Table',
  ROUND(((data_length + index_length) / 1024 / 1024), 2) AS 'Size (MB)'
FROM information_schema.tables
WHERE table_schema = 'modulearn_db'
ORDER BY (data_length + index_length) DESC;
```

## Environment Variables Setup

Create `.env` file in project root:

```env
# Database Configuration
DB_HOST=localhost
DB_USER=modulearn_user
DB_PASSWORD=ModulearnSecurePass2025!
DB_NAME=modulearn_db
DB_PORT=3306

# Important: Add .env to .gitignore
```

Add to `.gitignore`:
```
.env
.env.local
.env.*.local
```

## Database is Ready!

Once setup is complete, you should have:
- Database `modulearn_db` created
- User `modulearn_user` with proper privileges
- All 8 tables created with relationships
- Sample data loaded
- Database views available
- Connection tested successfully

You can now proceed to backend development!
