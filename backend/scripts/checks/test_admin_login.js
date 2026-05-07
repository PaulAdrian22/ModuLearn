// Test admin login
const axios = require('axios');

const testLogin = async () => {
  console.log('\n=== Testing Admin Login ===\n');
  
  try {
    const response = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'admin@modulearn.com',
      password: 'admin123'
    });
    
    console.log('✓ Login successful!');
    console.log('\nUser Data:');
    console.log(JSON.stringify(response.data.user, null, 2));
    console.log('\nToken:', response.data.token.substring(0, 50) + '...');
    
  } catch (error) {
    console.error('✗ Login failed!');
    console.error('Status:', error.response?.status);
    console.error('Error:', error.response?.data);
  }
};

testLogin();
