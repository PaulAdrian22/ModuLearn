// Script to create an admin user
// Run this with: npm run seed:admin (or: node scripts/seeds/create_admin.js)

const bcrypt = require('bcryptjs');
const { query } = require('../../config/database');

const createAdmin = async () => {
  const username = 'admin';
  const password = 'admin123';
  const name = 'Admin User';
  const age = 30;
  const educationalBackground = 'Computer Science';

  console.log('\n=== Creating Admin User ===\n');

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const existingUser = await query(
      'SELECT UserID, Username, Role FROM user WHERE Username = ?',
      [username]
    );

    if (existingUser.length > 0) {
      await query(
        'UPDATE user SET Role = ? WHERE Username = ?',
        ['admin', username]
      );
      console.log('Existing user updated to admin role');
    } else {
      await query(
        'INSERT INTO user (Name, Username, Password, Age, EducationalBackground, Role) VALUES (?, ?, ?, ?, ?, ?)',
        [name, username, hashedPassword, age, educationalBackground, 'admin']
      );
      console.log('New admin user created');
    }

    console.log('\nAdmin Credentials:');
    console.log('==================');
    console.log('Username:', username);
    console.log('Password:', password);
    console.log('\nIMPORTANT: Change the password after first login.');

  } catch (error) {
    console.error('Error creating admin:', error.message);
    if (error.code === 'ER_NO_SUCH_TABLE') {
      console.error('\nPlease run the database migration first:');
      console.error('  mysql -u your_username -p modulearn_db < database/add_admin_role.sql');
    }
  }

  process.exit(0);
};

createAdmin();
