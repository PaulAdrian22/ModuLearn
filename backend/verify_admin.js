// Script to verify and recreate admin user with proper password
const bcrypt = require('bcryptjs');
const { query } = require('./config/database');

const verifyAndRecreateAdmin = async () => {
  const email = 'admin@modulearn.com';
  const password = 'admin123';
  const name = 'Admin User';
  const age = 30;
  const educationalBackground = 'Computer Science';
  
  console.log('\n=== Verifying/Recreating Admin User ===\n');
  
  try {
    // Check if user exists
    const existingUser = await query(
      'SELECT UserID, Email, Role, Password FROM user WHERE Email = ?',
      [email]
    );
    
    if (existingUser.length > 0) {
      console.log('✓ Admin user found with ID:', existingUser[0].UserID);
      console.log('  Role:', existingUser[0].Role);
      
      // Test the current password
      console.log('\n--- Testing current password ---');
      const isValid = await bcrypt.compare(password, existingUser[0].Password);
      console.log('Current password valid:', isValid);
      
      if (!isValid) {
        console.log('\n--- Updating password ---');
        const hashedPassword = await bcrypt.hash(password, 10);
        await query(
          'UPDATE user SET Password = ?, Role = ?, Name = ? WHERE Email = ?',
          [hashedPassword, 'admin', name, email]
        );
        console.log('✓ Password updated successfully');
      }
    } else {
      console.log('✗ Admin user not found - Creating new one');
      const hashedPassword = await bcrypt.hash(password, 10);
      await query(
        'INSERT INTO user (Name, Email, Password, Age, EducationalBackground, Role) VALUES (?, ?, ?, ?, ?, ?)',
        [name, email, hashedPassword, age, educationalBackground, 'admin']
      );
      console.log('✓ New admin user created');
    }
    
    // Verify the final state
    const finalUser = await query(
      'SELECT UserID, Name, Email, Role FROM user WHERE Email = ?',
      [email]
    );
    
    console.log('\n=== Final Admin Account ===');
    console.log('UserID:', finalUser[0].UserID);
    console.log('Name:', finalUser[0].Name);
    console.log('Email:', finalUser[0].Email);
    console.log('Role:', finalUser[0].Role);
    console.log('\nCredentials:');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('\n✓ Admin account is ready to use!\n');
    
  } catch (error) {
    console.error('✗ Error:', error.message);
  }
  
  process.exit(0);
};

verifyAndRecreateAdmin();
