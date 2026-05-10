const { query } = require('../../config/database');

async function addGenderColumn() {
  try {
    console.log('Adding Gender column to user table...');

    const cols = await query('DESCRIBE user');
    const hasGender = cols.some(c => c.Field === 'Gender');

    if (!hasGender) {
      await query("ALTER TABLE user ADD COLUMN Gender ENUM('Male', 'Female') NULL AFTER Age");
      console.log('Gender column added');
    } else {
      console.log('Gender column already exists');
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err);
    process.exit(1);
  }
}

addGenderColumn();
