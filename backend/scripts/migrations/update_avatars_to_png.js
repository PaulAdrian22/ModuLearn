const mysql = require('mysql2/promise');
require('dotenv').config();

async function updateAvatarsToPng() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'modulearn_user',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'modulearn_db'
  });

  try {
    // Update default value for default_avatar column
    await db.execute("ALTER TABLE user MODIFY COLUMN default_avatar VARCHAR(50) DEFAULT 'avatar1.png'");
    console.log('✓ Updated default_avatar column default to avatar1.png');

    // Update all existing .svg avatars to .png
    const [result] = await db.execute(
      "UPDATE user SET default_avatar = REPLACE(default_avatar, '.svg', '.png') WHERE default_avatar LIKE '%.svg'"
    );
    console.log(`✓ Updated ${result.affectedRows} user records from .svg to .png`);

    console.log('\n✅ Database successfully updated to use .png avatars');
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await db.end();
  }
}

updateAvatarsToPng();
