const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

async function createTestUser() {
  try {
    const password = 'password';
    const hashedPassword = await bcrypt.hash(password, 10);

    console.log('Hashed password:', hashedPassword);

    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '2204',
      database: 'modulearn_db'
    });

    await connection.execute(
      'INSERT INTO user (Name, Username, Password, Age, EducationalBackground) VALUES (?, ?, ?, ?, ?)',
      ['Test Student', 'student', hashedPassword, 20, 'Senior High School']
    );

    console.log('\nTest account created.');
    console.log('Username: student');
    console.log('Password: password');

    await connection.end();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

createTestUser();
