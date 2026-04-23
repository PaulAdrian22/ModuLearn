const { query, closePool } = require('./config/database');

const columnExists = async (tableName, columnName) => {
  const rows = await query(
    `SELECT 1
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1`,
    [tableName, columnName]
  );
  return rows.length > 0;
};

const tableExists = async (tableName) => {
  const rows = await query(
    `SELECT 1
       FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
};

const run = async () => {
  console.log('\n=== Ensuring Simulation Admin Columns ===\n');

  try {
    const hasSimulationTable = await tableExists('simulation');
    if (!hasSimulationTable) {
      console.error('simulation table does not exist.');
      console.error('Run: node create_simulation_tables_fix.js');
      process.exitCode = 1;
      return;
    }

    const hasZoneData = await columnExists('simulation', 'ZoneData');
    if (!hasZoneData) {
      console.log('Adding ZoneData column to simulation table...');
      await query('ALTER TABLE simulation ADD COLUMN ZoneData LONGTEXT NULL');
      console.log('Added ZoneData column.');
    } else {
      console.log('ZoneData column already exists.');
    }

    const hasSimulationOrder = await columnExists('simulation', 'SimulationOrder');
    if (!hasSimulationOrder) {
      console.log('Adding SimulationOrder column to simulation table...');
      await query('ALTER TABLE simulation ADD COLUMN SimulationOrder INT NOT NULL DEFAULT 1');
      console.log('Added SimulationOrder column.');
    } else {
      console.log('SimulationOrder column already exists.');
    }

    console.log('\nSimulation admin schema is ready.\n');
  } catch (error) {
    console.error('Failed to ensure simulation admin columns:', error.message);
    process.exitCode = 1;
  } finally {
    try {
      await closePool();
    } catch (closeError) {
      // Ignore pool shutdown errors on process exit path.
    }
  }
};

run();
