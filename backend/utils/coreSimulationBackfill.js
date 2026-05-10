// Inserts placeholder rows for core simulations 16-20 if they're missing.
// Idempotent: only inserts orders that aren't already in the simulation
// table. Cached after the first successful run; fails open (logs and
// retries on the next call) so a transient DB issue doesn't loop forever.
//
// Called from two places to maximize coverage:
//   1. server.js at startup, so a fresh box backfills without waiting for
//      an admin request to come in.
//   2. The admin GET /api/admin/simulations handler, so an existing box
//      that came up before this code shipped still self-heals on the
//      first admin page load.

const { pool } = require('../config/database');

const CORE_PLACEHOLDER_ORDERS = [16, 17, 18, 19, 20];
let backfillCompleted = false;

const ensureCoreSimulationPlaceholders = async () => {
  if (backfillCompleted) return { ran: false, inserted: 0 };
  try {
    // Safety: bail quietly if the simulation table doesn't exist yet.
    const [tableRows] = await pool.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'simulation' LIMIT 1`
    );
    if (!tableRows || tableRows.length === 0) {
      return { ran: false, inserted: 0, reason: 'no-table' };
    }

    const [rows] = await pool.query(
      'SELECT SimulationOrder FROM simulation WHERE SimulationOrder BETWEEN ? AND ?',
      [CORE_PLACEHOLDER_ORDERS[0], CORE_PLACEHOLDER_ORDERS[CORE_PLACEHOLDER_ORDERS.length - 1]]
    );
    const present = new Set(rows.map((r) => Number(r.SimulationOrder)));
    const missing = CORE_PLACEHOLDER_ORDERS.filter((n) => !present.has(n));

    // Mirror the column set used by the canonical seed in ensureSimulationTable
    // (and the one used by POST /admin/simulations) so production schemas with
    // NOT-NULL columns lacking defaults — Instructions in particular — don't
    // throw ER_NO_DEFAULT_FOR_FIELD when we insert.
    for (const order of missing) {
      await pool.query(
        `INSERT INTO simulation
           (SimulationTitle, Description, ActivityType, MaxScore, TimeLimit, Instructions, SimulationOrder, Is_Locked)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [`Activity ${order}`, '', 'Disassembling', 10, 0, '', order, false]
      );
      console.log(`ensureCoreSimulationPlaceholders: inserted placeholder at order ${order}`);
    }

    backfillCompleted = true;
    return { ran: true, inserted: missing.length };
  } catch (error) {
    console.warn('ensureCoreSimulationPlaceholders failed:', {
      code: error?.code,
      message: error?.message,
    });
    return { ran: false, inserted: 0, error };
  }
};

module.exports = { ensureCoreSimulationPlaceholders };
