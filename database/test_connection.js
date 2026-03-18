// Database Connection Test Script for MODULEARN
// Run this to verify database connectivity before proceeding

const mysql = require('mysql2/promise');

// Database configuration
const dbConfig = {
  host: 'localhost',
  user: 'modulearn_user',
  password: 'ModulearnSecurePass2025!',
  database: 'modulearn_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

async function testDatabaseConnection() {
  let connection;
  
  try {
    console.log('========================================');
    console.log('MODULEARN Database Connection Test');
    console.log('========================================\n');
    
    console.log('1. Attempting to connect to database...');
    connection = await mysql.createConnection(dbConfig);
    console.log('   SUCCESS: Connected to modulearn_db\n');
    
    // Test 1: Check tables exist
    console.log('2. Checking if all tables exist...');
    const [tables] = await connection.query('SHOW TABLES');
    const tableNames = tables.map(row => Object.values(row)[0]);
    
    const expectedTables = [
      'user',
      'module',
      'assessment',
      'question',
      'user_answer',
      'progress',
      'bkt_model',
      'learning_skill'
    ];
    
    const missingTables = expectedTables.filter(table => !tableNames.includes(table));
    
    if (missingTables.length === 0) {
      console.log('   SUCCESS: All 8 tables found');
      console.log('   Tables:', tableNames.join(', ') + '\n');
    } else {
      console.log('   WARNING: Missing tables:', missingTables.join(', ') + '\n');
    }
    
    // Test 2: Count records in each table
    console.log('3. Counting records in each table...');
    for (const table of tableNames) {
      const [result] = await connection.query(`SELECT COUNT(*) as count FROM ${table}`);
      console.log(`   ${table}: ${result[0].count} records`);
    }
    console.log('');
    
    // Test 3: Check foreign key relationships
    console.log('4. Verifying foreign key relationships...');
    const [foreignKeys] = await connection.query(`
      SELECT 
        TABLE_NAME,
        COLUMN_NAME,
        REFERENCED_TABLE_NAME,
        REFERENCED_COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE REFERENCED_TABLE_NAME IS NOT NULL
        AND TABLE_SCHEMA = 'modulearn_db'
    `);
    
    console.log(`   Found ${foreignKeys.length} foreign key relationships`);
    foreignKeys.forEach(fk => {
      console.log(`   - ${fk.TABLE_NAME}.${fk.COLUMN_NAME} -> ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME}`);
    });
    console.log('');
    
    // Test 4: Check views
    console.log('5. Checking database views...');
    const [views] = await connection.query(`
      SHOW FULL TABLES 
      WHERE TABLE_TYPE = 'VIEW'
    `);
    
    if (views.length > 0) {
      console.log(`   Found ${views.length} views:`);
      views.forEach(view => {
        console.log(`   - ${Object.values(view)[0]}`);
      });
    } else {
      console.log('   No views found');
    }
    console.log('');
    
    // Test 5: Sample query test
    console.log('6. Running sample queries...');
    
    // Check if sample data exists
    const [users] = await connection.query('SELECT Name, Email FROM user LIMIT 3');
    if (users.length > 0) {
      console.log('   Sample users:');
      users.forEach(user => {
        console.log(`   - ${user.Name} (${user.Email})`);
      });
    } else {
      console.log('   No users found (this is normal for fresh installation)');
    }
    
    const [modules] = await connection.query('SELECT ModuleTitle, LessonOrder FROM module ORDER BY LessonOrder LIMIT 3');
    if (modules.length > 0) {
      console.log('   Sample modules:');
      modules.forEach(module => {
        console.log(`   - ${module.LessonOrder}. ${module.ModuleTitle}`);
      });
    } else {
      console.log('   No modules found (this is normal for fresh installation)');
    }
    console.log('');
    
    // Final summary
    console.log('========================================');
    console.log('TEST SUMMARY');
    console.log('========================================');
    console.log('Database Connection: PASSED');
    console.log(`Tables Created: ${tableNames.length}/8`);
    console.log(`Foreign Keys: ${foreignKeys.length}`);
    console.log(`Views: ${views.length}`);
    console.log('Status: DATABASE READY FOR USE');
    console.log('========================================\n');
    
  } catch (error) {
    console.error('\n========================================');
    console.error('ERROR OCCURRED');
    console.error('========================================');
    console.error('Error Type:', error.code);
    console.error('Message:', error.message);
    console.error('\nTroubleshooting Steps:');
    console.error('1. Ensure MySQL server is running');
    console.error('2. Verify database credentials in this script');
    console.error('3. Check if database "modulearn_db" exists');
    console.error('4. Verify user "modulearn_user" has proper privileges');
    console.error('5. Run schema.sql to create tables if missing');
    console.error('========================================\n');
    process.exit(1);
    
  } finally {
    if (connection) {
      await connection.end();
      console.log('Connection closed.\n');
    }
  }
}

// Run the test
testDatabaseConnection();
