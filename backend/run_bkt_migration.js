/**
 * BKT Full Migration Runner
 * 
 * Runs the bkt_full_migration.sql file against the database.
 * 
 * Usage: node run_bkt_migration.js
 */

const fs = require('fs');
const path = require('path');
const { pool, testConnection, closePool } = require('./config/database');

const runMigration = async () => {
  console.log('========================================');
  console.log('  BKT Full Migration Runner');
  console.log('========================================\n');

  // Test connection first
  const connected = await testConnection();
  if (!connected) {
    console.error('❌ Failed to connect to database. Check your .env configuration.');
    process.exit(1);
  }

  console.log('✅ Database connection established.\n');

  // Read migration SQL file
  const sqlPath = path.join(__dirname, '..', 'database', 'bkt_full_migration.sql');
  
  if (!fs.existsSync(sqlPath)) {
    console.error(`❌ Migration file not found: ${sqlPath}`);
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(sqlPath, 'utf8');
  console.log(`📄 Loaded migration file: ${sqlPath}\n`);

  // Split SQL into individual statements (skip empty lines, comments)
  const statements = sqlContent
    .split(';')
    .map(s => s.trim())
    .filter(s => {
      // Remove empty statements and pure comment blocks
      const withoutComments = s.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
      return withoutComments.length > 0;
    });

  console.log(`📋 Found ${statements.length} SQL statements to execute.\n`);

  let successCount = 0;
  let errorCount = 0;
  let skipCount = 0;
  const errors = [];

  const connection = await pool.getConnection();

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i].trim();
    if (!stmt) continue;

    // Extract first meaningful line for logging
    const firstLine = stmt.split('\n').find(l => {
      const clean = l.replace(/--.*$/, '').trim();
      return clean.length > 0;
    }) || stmt.substring(0, 60);

    const shortDesc = firstLine.substring(0, 80).replace(/\s+/g, ' ');

    try {
      await connection.query(stmt);
      successCount++;
      console.log(`  ✅ [${i + 1}/${statements.length}] ${shortDesc}...`);
    } catch (error) {
      // MySQL error codes for "already exists" scenarios
      const skipCodes = [
        'ER_DUP_COLUMN',          // Duplicate column name
        'ER_TABLE_EXISTS_ERROR',   // Table already exists
        'ER_DUP_KEYNAME',         // Duplicate key name (index already exists)
        'ER_DUP_FIELDNAME',       // Duplicate column name
      ];
      const skipPatterns = [
        'Duplicate column',
        'already exists',
        'Duplicate key name',
        'Duplicate entry',
      ];
      const isSkippable = skipCodes.includes(error.code) || 
                           error.errno === 1060 || // ER_DUP_FIELDNAME
                           error.errno === 1061 || // ER_DUP_KEYNAME
                           error.errno === 1050 || // ER_TABLE_EXISTS_ERROR
                           skipPatterns.some(p => error.message.includes(p));

      if (isSkippable) {
        skipCount++;
        console.log(`  ⏭️  [${i + 1}/${statements.length}] Skipped (already exists): ${shortDesc}...`);
      } else {
        errorCount++;
        errors.push({ statement: i + 1, desc: shortDesc, error: error.message });
        console.log(`  ❌ [${i + 1}/${statements.length}] ERROR: ${error.message}`);
        console.log(`     Statement: ${shortDesc}...`);
      }
    }
  }

  connection.release();

  console.log('\n========================================');
  console.log('  Migration Summary');
  console.log('========================================');
  console.log(`  ✅ Successful: ${successCount}`);
  console.log(`  ⏭️  Skipped:    ${skipCount}`);
  console.log(`  ❌ Errors:     ${errorCount}`);
  console.log('========================================\n');

  if (errors.length > 0) {
    console.log('Errors encountered:');
    errors.forEach(e => {
      console.log(`  Statement ${e.statement}: ${e.desc}`);
      console.log(`    → ${e.error}\n`);
    });
  }

  if (errorCount === 0) {
    console.log('🎉 BKT migration completed successfully!');
    console.log('   All BKT tables and columns are ready.\n');
  } else {
    console.log('⚠️  Migration completed with errors. Review the errors above.\n');
  }

  await closePool();
  process.exit(errorCount > 0 ? 1 : 0);
};

runMigration().catch(err => {
  console.error('Unexpected error during migration:', err);
  process.exit(1);
});
