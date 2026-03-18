// Script to run the database migration for admin role
const { query } = require('./config/database');

const runMigration = async () => {
  console.log('\n=== Running Admin Role Migration ===\n');
  
  try {
    // Add Role column
    console.log('Adding Role column to user table...');
    await query(
      "ALTER TABLE user ADD COLUMN Role ENUM('student', 'admin') DEFAULT 'student' NOT NULL"
    );
    console.log('✓ Role column added successfully');
    
    // Update existing users to be students
    console.log('\nUpdating existing users...');
    await query("UPDATE user SET Role = 'student' WHERE Role IS NULL");
    console.log('✓ Existing users updated to student role');
    
    console.log('\n✓ Migration completed successfully!\n');
    console.log('You can now run: node create_admin.js\n');
    
  } catch (error) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('✓ Role column already exists - skipping migration');
    } else {
      console.error('✗ Migration error:', error.message);
    }
  }
  
  process.exit(0);
};

runMigration();
