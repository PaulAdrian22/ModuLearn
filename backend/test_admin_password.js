const bcrypt = require('bcryptjs');
const { query } = require('./config/database');

async function testAdminPassword() {
  try {
    console.log('Testing admin password...\n');
    
    // Get admin user from database
    const users = await query(
      'SELECT UserID, Name, Email, Password, Role FROM user WHERE Email = ?',
      ['admin@modulearn.com']
    );
    
    if (users.length === 0) {
      console.log('❌ Admin user not found in database');
      process.exit(1);
    }
    
    const user = users[0];
    console.log('Found admin user:');
    console.log(`  UserID: ${user.UserID}`);
    console.log(`  Name: ${user.Name}`);
    console.log(`  Email: ${user.Email}`);
    console.log(`  Role: ${user.Role}`);
    console.log(`  Password Hash: ${user.Password}\n`);
    
    // Test password comparison
    const testPassword = 'admin123';
    console.log(`Testing password: "${testPassword}"\n`);
    
    const isMatch = await bcrypt.compare(testPassword, user.Password);
    
    if (isMatch) {
      console.log('✅ Password matches! Login should work.');
    } else {
      console.log('❌ Password does NOT match. This is the problem!');
      console.log('\nGenerating new hash for "admin123"...');
      const newHash = await bcrypt.hash(testPassword, 10);
      console.log(`New hash: ${newHash}`);
      console.log('\nUpdating database...');
      await query(
        'UPDATE user SET Password = ? WHERE UserID = ?',
        [newHash, user.UserID]
      );
      console.log('✅ Password updated. Try logging in again.');
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testAdminPassword();
