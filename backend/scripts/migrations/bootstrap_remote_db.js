const fs = require('fs');
const path = require('path');
const BACKEND_DIR = path.resolve(__dirname, '..', '..');
const mysql = require('mysql2/promise');

const requiredEnv = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Missing required env: ${key}`);
    process.exit(1);
  }
}

const migrationFiles = [
  '../database/schema.sql',
  '../database/update_profile_picture.sql',
  '../database/add_admin_role.sql',
  '../database/add_lesson_content_columns.sql',
  '../database/add_lesson_time_difficulty.sql',
  '../database/add_simulation_table.sql',
  '../database/add_final_instruction.sql',
  '../database/add_avatar_system.sql',
  '../database/bkt_full_migration.sql',
  '../database/ensure_lesson_1_unlocked.sql'
];

const run = async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true
  });

  try {
    for (const relFile of migrationFiles) {
      const fullPath = path.join(BACKEND_DIR, relFile);
      if (!fs.existsSync(fullPath)) {
        console.log(`Skipping missing file: ${relFile}`);
        continue;
      }

      let sql = fs.readFileSync(fullPath, 'utf8');

      if (relFile.endsWith('add_admin_role.sql')) {
        // Skip placeholder admin INSERT block with invalid password hash.
        sql = sql.replace(
          /INSERT INTO user[\s\S]*?ON DUPLICATE KEY UPDATE Role = 'admin';/g,
          ''
        );
      }

      if (relFile.endsWith('add_avatar_system.sql')) {
        // Improve compatibility for MySQL variants that do not support IF NOT EXISTS on ADD COLUMN.
        sql = sql.replace(/ADD COLUMN IF NOT EXISTS/g, 'ADD COLUMN');
      }

      console.log(`Running: ${relFile}`);
      try {
        await connection.query(sql);
        console.log(`OK: ${relFile}`);
      } catch (error) {
        const ignorable = ['Duplicate', 'already exists', 'ER_DUP_FIELDNAME', 'ER_TABLE_EXISTS_ERROR', 'ER_DUP_KEYNAME', 'ER_DUP_ENTRY'];
        const isIgnorable = ignorable.some((token) => (error.message || '').includes(token) || error.code === token);

        if (isIgnorable) {
          console.log(`SKIP (already applied): ${relFile} -> ${error.message}`);
        } else {
          throw error;
        }
      }
    }

    console.log('Database bootstrap complete.');
  } finally {
    await connection.end();
  }
};

run().catch((error) => {
  console.error('Bootstrap failed:', error.message);
  process.exit(1);
});
