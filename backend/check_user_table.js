const { query } = require('./config/database');

async function checkUserTable() {
  try {
    const cols = await query('DESCRIBE user');
    console.log('User table columns:');
    cols.forEach(c => console.log(`- ${c.Field} (${c.Type})`));
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkUserTable();
