// Idempotent migration: adds AttemptedFromLesson column to simulation_progress
// if it doesn't already exist. Called at server startup and fails open.

const { pool } = require('../config/database');

let migrationCompleted = false;

const ensureSimulationProgressColumns = async () => {
  if (migrationCompleted) return;
  try {
    const [tableRows] = await pool.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'simulation_progress' LIMIT 1`
    );
    if (!tableRows || tableRows.length === 0) return;

    const [colRows] = await pool.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'simulation_progress'
          AND COLUMN_NAME = 'AttemptedFromLesson' LIMIT 1`
    );

    if (colRows.length === 0) {
      await pool.query(
        `ALTER TABLE simulation_progress
           ADD COLUMN AttemptedFromLesson TINYINT(1) NOT NULL DEFAULT 0`
      );
      console.log('[migration] Added AttemptedFromLesson to simulation_progress');
    }

    migrationCompleted = true;
  } catch (err) {
    console.warn('[migration] ensureSimulationProgressColumns failed (will retry):', err.message);
  }
};

module.exports = { ensureSimulationProgressColumns };
