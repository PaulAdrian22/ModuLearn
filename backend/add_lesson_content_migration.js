// Add lesson content columns migration
const { query } = require('./config/database');
const fs = require('fs');
const path = require('path');

async function migrate() {
  try {
    console.log('Starting migration: Add lesson content columns...');
    
    const sql = fs.readFileSync(
      path.join(__dirname, '../database/add_lesson_content_columns.sql'),
      'utf8'
    );
    
    await query(sql);
    
    console.log('✓ Migration completed successfully!');
    console.log('  - Added sections column');
    console.log('  - Added diagnosticQuestions column');
    console.log('  - Added reviewQuestions column');
    console.log('  - Added finalQuestions column');
    
    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error.message);
    process.exit(1);
  }
}

migrate();
