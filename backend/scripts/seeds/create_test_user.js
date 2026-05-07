const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

async function createTestUser() {
  try {
    // Hash the password
    const password = 'password';
    const hashedPassword = await bcrypt.hash(password, 10);
    
    console.log('Hashed password:', hashedPassword);
    
    // Connect to database
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '2204',
      database: 'modulearn_db'
    });
    
    // Insert user
    const [result] = await connection.execute(
      'INSERT INTO user (Name, Email, Password, Age, EducationalBackground) VALUES (?, ?, ?, ?, ?)',
      ['Test Student', 'student@test.com', hashedPassword, 20, 'Senior High School']
    );
    
    console.log('\n✓ Test account created successfully!');
    console.log('\nLogin credentials:');
    console.log('Email: student@test.com');
    console.log('Password: password');
    
    await connection.end();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

createTestUser();
