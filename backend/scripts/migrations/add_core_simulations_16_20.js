// Idempotently inserts core simulations #16-#20 as empty placeholders.
// Anything beyond SimulationOrder 20 is treated as supplementary by the UI
// (and, when wired in, by the algorithm). Existing rows at 16-20 are left alone.

const { pool, query, closePool } = require('../../config/database');

const PLACEHOLDERS = [16, 17, 18, 19, 20].map((order) => ({
  order,
  title: `Activity ${order}`,
  description: '',
  activityType: 'Disassembling',
  maxScore: 10,
  timeLimit: 0,
}));

async function ensureCoreSimulations() {
  console.log('Ensuring core simulations 16-20 exist...');

  // Make sure the simulation table itself is there. The admin route already
  // calls this on every request, but we run a stripped check here so the
  // script is safe to invoke from a fresh box.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS simulation (
      SimulationID INT AUTO_INCREMENT PRIMARY KEY,
      ModuleID INT NULL,
      SimulationTitle VARCHAR(200) NOT NULL,
      Description TEXT,
      ActivityType VARCHAR(100),
      MaxScore INT DEFAULT 10,
      TimeLimit INT DEFAULT 0,
      Instructions TEXT,
      SimulationOrder INT NOT NULL DEFAULT 1,
      Is_Locked BOOLEAN DEFAULT FALSE,
      ZoneData LONGTEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_order (SimulationOrder)
    )
  `);

  let inserted = 0;
  let skipped = 0;
  for (const meta of PLACEHOLDERS) {
    const existing = await query(
      'SELECT SimulationID FROM simulation WHERE SimulationOrder = ? LIMIT 1',
      [meta.order]
    );
    if (existing.length > 0) {
      console.log(`  Skipping order ${meta.order} (already present, ID ${existing[0].SimulationID})`);
      skipped += 1;
      continue;
    }

    await query(
      `INSERT INTO simulation
        (SimulationTitle, Description, ActivityType, MaxScore, TimeLimit, Instructions, SimulationOrder, Is_Locked)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [meta.title, meta.description, meta.activityType, meta.maxScore, meta.timeLimit, '', meta.order, false]
    );
    console.log(`  Inserted core simulation order ${meta.order}: ${meta.title}`);
    inserted += 1;
  }

  console.log(`Done. Inserted: ${inserted}, skipped: ${skipped}.`);
}

(async () => {
  try {
    await ensureCoreSimulations();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    try { await closePool(); } catch { /* ignore */ }
  }
})();
