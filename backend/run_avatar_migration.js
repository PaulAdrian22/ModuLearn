const { query } = require('./config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  try {
    console.log('Running avatar system migration...');
    
    // Read the SQL file
    const sqlFile = path.join(__dirname, '..', 'database', 'add_avatar_system.sql');
    const sqlContent = fs.readFileSync(sqlFile, 'utf8');
    
    // Split by semicolons and execute each statement
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      if (statement.trim()) {
        console.log(`Executing: ${statement.substring(0, 50)}...`);
        await query(statement);
      }
    }
    
    console.log('✅ Migration completed successfully!');
    
    // Verify the columns were added
    const cols = await query('DESCRIBE user');
    console.log('\nUpdated user table columns:');
    cols.forEach(c => console.log(`- ${c.Field} (${c.Type})`));
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    process.exit(1);
  }
}

runMigration();
