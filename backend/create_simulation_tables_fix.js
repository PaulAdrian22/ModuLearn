const db = require('./config/database');

async function run() {
  try {
    await db.query(`
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
        Is_Locked BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_module (ModuleID),
        INDEX idx_order (SimulationOrder)
      )
    `);
    console.log('simulation table created');
  } catch (e) {
    console.log('simulation table error:', e.message);
  }

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS simulation_progress (
        ProgressID INT AUTO_INCREMENT PRIMARY KEY,
        UserID INT NOT NULL,
        SimulationID INT NOT NULL,
        Score INT DEFAULT 0,
        Attempts INT DEFAULT 0,
        TimeSpent INT DEFAULT 0,
        CompletionStatus ENUM('not_started','in_progress','completed') DEFAULT 'not_started',
        DateCompleted DATETIME,
        FOREIGN KEY (UserID) REFERENCES user(UserID) ON DELETE CASCADE,
        FOREIGN KEY (SimulationID) REFERENCES simulation(SimulationID) ON DELETE CASCADE,
        UNIQUE KEY unique_user_sim (UserID, SimulationID)
      )
    `);
    console.log('simulation_progress table created');
  } catch (e) {
    console.log('simulation_progress table error:', e.message);
  }

  process.exit(0);
}

run();
