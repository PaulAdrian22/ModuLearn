// Script to verify and recreate admin user with proper password
const bcrypt = require('bcryptjs');
const { query } = require('../../config/database');

const verifyAndRecreateAdmin = async () => {
  const username = 'admin';
  const password = 'admin123';
  const name = 'Admin User';
  const age = 30;
  const educationalBackground = 'Computer Science';

  console.log('\n=== Verifying/Recreating Admin User ===\n');

  try {
    const existingUser = await query(
      'SELECT UserID, Username, Role, Password FROM user WHERE Username = ?',
      [username]
    );

    if (existingUser.length > 0) {
      console.log('Admin user found with ID:', existingUser[0].UserID);
      console.log('  Role:', existingUser[0].Role);

      console.log('\n--- Testing current password ---');
      const isValid = await bcrypt.compare(password, existingUser[0].Password);
      console.log('Current password valid:', isValid);

      if (!isValid) {
        console.log('\n--- Updating password ---');
        const hashedPassword = await bcrypt.hash(password, 10);
        await query(
          'UPDATE user SET Password = ?, Role = ?, Name = ? WHERE Username = ?',
          [hashedPassword, 'admin', name, username]
        );
        console.log('Password updated successfully');
      }
    } else {
      console.log('Admin user not found - creating new one');
      const hashedPassword = await bcrypt.hash(password, 10);
      await query(
        'INSERT INTO user (Name, Username, Password, Age, EducationalBackground, Role) VALUES (?, ?, ?, ?, ?, ?)',
        [name, username, hashedPassword, age, educationalBackground, 'admin']
      );
      console.log('New admin user created');
    }

    const finalUser = await query(
      'SELECT UserID, Name, Username, Role FROM user WHERE Username = ?',
      [username]
    );

    console.log('\n=== Final Admin Account ===');
    console.log('UserID:', finalUser[0].UserID);
    console.log('Name:', finalUser[0].Name);
    console.log('Username:', finalUser[0].Username);
    console.log('Role:', finalUser[0].Role);
    console.log('\nCredentials:');
    console.log('Username:', username);
    console.log('Password:', password);

  } catch (error) {
    console.error('Error:', error.message);
  }

  process.exit(0);
};

verifyAndRecreateAdmin();
