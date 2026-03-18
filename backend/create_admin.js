// Script to create an admin user
// Run this with: node create_admin.js

const bcrypt = require('bcryptjs');
const { query } = require('./config/database');

const createAdmin = async () => {
  // Change these credentials!
  const email = 'admin@modulearn.com';
  const password = 'admin123';
  const name = 'Admin User';
  const age = 30;
  const educationalBackground = 'Computer Science';
  
  console.log('\n=== Creating Admin User ===\n');
  
  try {
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Check if user exists
    const existingUser = await query(
      'SELECT UserID, Email, Role FROM user WHERE Email = ?',
      [email]
    );
    
    if (existingUser.length > 0) {
      // Update existing user to admin
      await query(
        'UPDATE user SET Role = ? WHERE Email = ?',
        ['admin', email]
      );
      console.log('✓ Existing user updated to admin role');
    } else {
      // Create new admin user
      await query(
        'INSERT INTO user (Name, Email, Password, Age, EducationalBackground, Role) VALUES (?, ?, ?, ?, ?, ?)',
        [name, email, hashedPassword, age, educationalBackground, 'admin']
      );
      console.log('✓ New admin user created');
    }
    
    console.log('\nAdmin Credentials:');
    console.log('==================');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('\n⚠️  IMPORTANT: Change the password after first login!');
    console.log('⚠️  Update the credentials in this script before running again.\n');
    
  } catch (error) {
    console.error('✗ Error creating admin:', error.message);
    if (error.code === 'ER_NO_SUCH_TABLE') {
      console.error('\nPlease run the database migration first:');
      console.error('  mysql -u your_username -p modulearn_db < database/add_admin_role.sql');
    }
  }
  
  process.exit(0);
};

// Run the function
createAdmin();
