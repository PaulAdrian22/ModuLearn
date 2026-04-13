const mysql = require('mysql2/promise');

const required = [
  'LOCAL_DB_HOST', 'LOCAL_DB_PORT', 'LOCAL_DB_USER', 'LOCAL_DB_PASSWORD', 'LOCAL_DB_NAME',
  'REMOTE_DB_HOST', 'REMOTE_DB_PORT', 'REMOTE_DB_USER', 'REMOTE_DB_PASSWORD', 'REMOTE_DB_NAME'
];

for (const k of required) {
  if (!process.env[k]) {
    console.error(`Missing env: ${k}`);
    process.exit(1);
  }
}

const main = async () => {
  const toDbJson = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  };

  const local = await mysql.createConnection({
    host: process.env.LOCAL_DB_HOST,
    port: Number(process.env.LOCAL_DB_PORT),
    user: process.env.LOCAL_DB_USER,
    password: process.env.LOCAL_DB_PASSWORD,
    database: process.env.LOCAL_DB_NAME,
    multipleStatements: true
  });

  const remote = await mysql.createConnection({
    host: process.env.REMOTE_DB_HOST,
    port: Number(process.env.REMOTE_DB_PORT),
    user: process.env.REMOTE_DB_USER,
    password: process.env.REMOTE_DB_PASSWORD,
    database: process.env.REMOTE_DB_NAME,
    multipleStatements: true
  });

  try {
    // Ensure remote simulation table supports ZoneData used by the frontend.
    try {
      await remote.query('ALTER TABLE simulation ADD COLUMN ZoneData JSON NULL');
      console.log('Added ZoneData column to remote simulation table.');
    } catch (e) {
      if (!String(e.message).includes('Duplicate column')) throw e;
    }

    // Ensure remote module table supports roadmapStages used by authored content.
    try {
      await remote.query('ALTER TABLE module ADD COLUMN roadmapStages JSON NULL');
      console.log('Added roadmapStages column to remote module table.');
    } catch (e) {
      if (!String(e.message).includes('Duplicate column')) throw e;
    }

    try {
      await remote.query('ALTER TABLE module ADD COLUMN Is_Completed BOOLEAN NOT NULL DEFAULT FALSE');
      console.log('Added Is_Completed column to remote module table.');
    } catch (e) {
      if (!String(e.message).includes('Duplicate column')) throw e;
    }

    const [localModules] = await local.query(`
      SELECT ModuleID, ModuleTitle, Description, LessonOrder, Tesda_Reference, Is_Unlocked, Is_Completed,
             sections, diagnosticQuestions, reviewQuestions, finalQuestions, finalInstruction,
             roadmapStages, LessonTime, Difficulty
      FROM module
      ORDER BY ModuleID
    `);

    for (const m of localModules) {
      await remote.query(
        `INSERT INTO module (
           ModuleID, ModuleTitle, Description, LessonOrder, Tesda_Reference, Is_Unlocked, Is_Completed,
           sections, diagnosticQuestions, reviewQuestions, finalQuestions, finalInstruction,
           roadmapStages, LessonTime, Difficulty
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           ModuleTitle = VALUES(ModuleTitle),
           Description = VALUES(Description),
           LessonOrder = VALUES(LessonOrder),
           Tesda_Reference = VALUES(Tesda_Reference),
           Is_Unlocked = VALUES(Is_Unlocked),
           Is_Completed = VALUES(Is_Completed),
           sections = VALUES(sections),
           diagnosticQuestions = VALUES(diagnosticQuestions),
           reviewQuestions = VALUES(reviewQuestions),
           finalQuestions = VALUES(finalQuestions),
           finalInstruction = VALUES(finalInstruction),
           roadmapStages = VALUES(roadmapStages),
           LessonTime = VALUES(LessonTime),
           Difficulty = VALUES(Difficulty)`,
        [
          m.ModuleID, m.ModuleTitle, m.Description, m.LessonOrder, m.Tesda_Reference, m.Is_Unlocked, m.Is_Completed,
          toDbJson(m.sections), toDbJson(m.diagnosticQuestions), toDbJson(m.reviewQuestions), toDbJson(m.finalQuestions), m.finalInstruction,
          toDbJson(m.roadmapStages), toDbJson(m.LessonTime), m.Difficulty
        ]
      );
    }

    // Keep lesson 1 unlocked safety rule.
    await remote.query('UPDATE module SET Is_Unlocked = TRUE WHERE LessonOrder = 1');

    const [localSims] = await local.query(`
      SELECT SimulationID, SimulationTitle, Description, ActivityType, MaxScore, TimeLimit,
             SimulationOrder, ZoneData
      FROM simulation
      ORDER BY SimulationID
    `);

    const defaultModuleId = localModules.length > 0 ? localModules[0].ModuleID : 1;

    for (const s of localSims) {
      await remote.query(
        `INSERT INTO simulation (
           SimulationID, ModuleID, SimulationTitle, Description, ActivityType,
           MaxScore, TimeLimit, Instructions, SimulationOrder, Is_Locked, ZoneData
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           ModuleID = VALUES(ModuleID),
           SimulationTitle = VALUES(SimulationTitle),
           Description = VALUES(Description),
           ActivityType = VALUES(ActivityType),
           MaxScore = VALUES(MaxScore),
           TimeLimit = VALUES(TimeLimit),
           Instructions = VALUES(Instructions),
           SimulationOrder = VALUES(SimulationOrder),
           Is_Locked = VALUES(Is_Locked),
           ZoneData = VALUES(ZoneData)`,
        [
          s.SimulationID,
          defaultModuleId,
          s.SimulationTitle,
          s.Description,
          s.ActivityType,
          s.MaxScore,
          s.TimeLimit,
          'Imported from local content',
          s.SimulationOrder,
          0,
          toDbJson(s.ZoneData)
        ]
      );
    }

    const [[remoteModuleCount]] = await remote.query('SELECT COUNT(*) AS c FROM module');
    const [[remoteSimCount]] = await remote.query('SELECT COUNT(*) AS c FROM simulation');

    console.log(`Sync complete. Remote modules=${remoteModuleCount.c}, simulations=${remoteSimCount.c}`);
  } finally {
    await local.end();
    await remote.end();
  }
};

main().catch((err) => {
  console.error('Sync failed:', err.message);
  process.exit(1);
});
