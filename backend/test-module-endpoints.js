// Test script to verify module endpoints return consistent data
// Run this with: node test-module-endpoints.js

const { query } = require('./config/database');

async function testModuleEndpoints() {
  console.log('=== Testing Module Endpoints ===\n');

  try {
    // Test 1: Check all modules in database
    console.log('1. Checking all modules in database...');
    const allModules = await query('SELECT * FROM module ORDER BY LessonOrder');
    console.log(`   Found ${allModules.length} modules in database:`);
    allModules.forEach(m => {
      console.log(`   - Lesson ${m.LessonOrder}: ${m.ModuleTitle} (ID: ${m.ModuleID}, Unlocked: ${m.Is_Unlocked})`);
    });
    console.log('');

    // Test 2: Simulate admin endpoint query
    console.log('2. Simulating admin endpoint (/api/admin/modules)...');
    const adminModules = await query(`
      SELECT 
        m.*,
        COUNT(DISTINCT q.QuestionID) as questionCount
      FROM module m
      LEFT JOIN question q ON m.ModuleID = q.ModuleID
      GROUP BY m.ModuleID
      ORDER BY m.LessonOrder
    `);
    console.log(`   Admin endpoint would return ${adminModules.length} modules:`);
    adminModules.forEach(m => {
      console.log(`   - Lesson ${m.LessonOrder}: ${m.ModuleTitle} (Questions: ${m.questionCount})`);
    });
    console.log('');

    // Test 3: Simulate user endpoint query (without userId)
    console.log('3. Simulating user endpoint (/api/modules)...');
    const userModules = await query(`
      SELECT 
        m.ModuleID,
        m.ModuleTitle,
        m.Description,
        m.LessonOrder,
        m.Tesda_Reference,
        m.Is_Unlocked
      FROM module m
      ORDER BY m.LessonOrder
    `);
    console.log(`   User endpoint would return ${userModules.length} modules:`);
    userModules.forEach(m => {
      console.log(`   - Lesson ${m.LessonOrder}: ${m.ModuleTitle}`);
    });
    console.log('');

    // Test 4: Check for any discrepancies
    console.log('4. Checking for discrepancies...');
    if (allModules.length === adminModules.length && allModules.length === userModules.length) {
      console.log('   ✓ All endpoints return the same number of modules');
    } else {
      console.log('   ✗ MISMATCH DETECTED:');
      console.log(`     Database: ${allModules.length} modules`);
      console.log(`     Admin endpoint: ${adminModules.length} modules`);
      console.log(`     User endpoint: ${userModules.length} modules`);
    }
    console.log('');

    console.log('=== Test Complete ===');
    process.exit(0);

  } catch (error) {
    console.error('Error during testing:', error);
    process.exit(1);
  }
}

testModuleEndpoints();
