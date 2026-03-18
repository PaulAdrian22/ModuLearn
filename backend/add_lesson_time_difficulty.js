const { query } = require('./config/database');

async function addLessonTimeAndDifficulty() {
  try {
    console.log('Adding LessonTime and Difficulty columns to module table...');
    
    // Check if columns already exist
    const columns = await query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'module' 
      AND COLUMN_NAME IN ('LessonTime', 'Difficulty')
    `);
    
    const existingColumns = columns.map(col => col.COLUMN_NAME);
    
    if (existingColumns.includes('LessonTime') && existingColumns.includes('Difficulty')) {
      console.log('Columns already exist. Skipping...');
      process.exit(0);
    }
    
    if (!existingColumns.includes('LessonTime')) {
      await query(`
        ALTER TABLE module 
        ADD COLUMN LessonTime JSON DEFAULT NULL COMMENT 'Lesson duration in hours and minutes'
      `);
      console.log('✓ LessonTime column added successfully');
    }
    
    if (!existingColumns.includes('Difficulty')) {
      await query(`
        ALTER TABLE module 
        ADD COLUMN Difficulty VARCHAR(50) DEFAULT 'Easy' COMMENT 'Lesson difficulty level'
      `);
      console.log('✓ Difficulty column added successfully');
    }
    
    console.log('\nMigration completed successfully!');
    process.exit(0);
    
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

addLessonTimeAndDifficulty();
