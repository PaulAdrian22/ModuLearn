// Script to ensure Lesson 1 is always unlocked
// Run this to make sure the first lesson is accessible to all users

const { query } = require('./config/database');

async function ensureLesson1Unlocked() {
  try {
    console.log('Ensuring Lesson 1 is unlocked...');
    
    // Update lesson 1 to be unlocked
    await query('UPDATE module SET Is_Unlocked = TRUE WHERE LessonOrder = 1');
    
    // Verify the update
    const result = await query(
      'SELECT ModuleID, ModuleTitle, LessonOrder, Is_Unlocked FROM module WHERE LessonOrder = 1'
    );
    
    if (result.length > 0) {
      console.log('\n✓ Lesson 1 status:');
      console.log(`  Module ID: ${result[0].ModuleID}`);
      console.log(`  Title: ${result[0].ModuleTitle}`);
      console.log(`  Lesson Order: ${result[0].LessonOrder}`);
      console.log(`  Is Unlocked: ${result[0].Is_Unlocked ? 'YES' : 'NO'}`);
      console.log('\n✓ Lesson 1 is now unlocked and accessible to all users!');
    } else {
      console.log('\n⚠ No lesson with LessonOrder = 1 found in the database.');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error ensuring lesson 1 is unlocked:', error);
    process.exit(1);
  }
}

ensureLesson1Unlocked();
