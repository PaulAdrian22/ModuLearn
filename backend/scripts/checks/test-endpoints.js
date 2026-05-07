// Quick test script to verify endpoints are working
const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

async function testEndpoints() {
  console.log('Testing MODULEARN API Endpoints...\n');

  // Test 1: Health check
  try {
    const health = await axios.get(`${BASE_URL}/health`);
    console.log('✓ Health check:', health.data.message);
  } catch (err) {
    console.log('✗ Health check failed:', err.message);
  }

  // Test 2: Users/all endpoint
  try {
    const users = await axios.get(`${BASE_URL}/users/all`);
    console.log(`✓ Users endpoint: Found ${users.data.length} users`);
  } catch (err) {
    console.log('✗ Users endpoint failed:', err.response?.status, err.message);
    console.log('  Error details:', err.response?.data);
  }

  // Test 3: Debug routes
  try {
    const routes = await axios.get(`${BASE_URL}/debug/routes`);
    console.log('\n Available routes:');
    routes.data.routes.forEach(route => {
      console.log(`  ${route.methods.join(', ').toUpperCase()} ${route.path}`);
    });
  } catch (err) {
    console.log('✗ Debug routes failed:', err.message);
  }
}

testEndpoints();
