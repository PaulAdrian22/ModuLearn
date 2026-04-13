const { query, closePool } = require('./config/database');

async function run() {
  try {
    const pingRows = await query('SELECT 1 AS ok');
    const moduleRows = await query('SELECT COUNT(*) AS totalModules FROM module');

    console.log('Database connection: PASSED');
    console.log(`Ping result: ${pingRows[0]?.ok || 0}`);
    console.log(`Module rows: ${moduleRows[0]?.totalModules || 0}`);
  } catch (error) {
    console.error('Database connection: FAILED');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

run();
