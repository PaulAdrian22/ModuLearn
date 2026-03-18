const { query } = require('./config/database');

const runMigration = async () => {
  console.log('\n=== Creating Simulation Tables ===\n');
  
  try {
    // Create simulation table
    console.log('Creating simulation table...');
    try {
      await query(`
        CREATE TABLE simulation (
          SimulationID INT AUTO_INCREMENT PRIMARY KEY,
          ModuleID INT NOT NULL,
          SimulationTitle VARCHAR(200) NOT NULL,
          Description TEXT,
          ActivityType VARCHAR(100),
          MaxScore INT DEFAULT 10,
          TimeLimit INT DEFAULT 0,
          Instructions TEXT,
          SimulationOrder INT NOT NULL,
          Is_Locked BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (ModuleID) REFERENCES module(ModuleID) ON DELETE CASCADE,
          INDEX idx_module (ModuleID),
          INDEX idx_order (SimulationOrder)
        )
      `);
      console.log('✓ Simulation table created\n');
    } catch (error) {
      if (error.code === 'ER_TABLE_EXISTS_ERROR') {
        console.log('✓ Simulation table already exists\n');
      } else {
        throw error;
      }
    }
    
    // Create simulation_progress table
    console.log('Creating simulation_progress table...');
    try {
      await query(`
        CREATE TABLE simulation_progress (
          SimProgressID INT AUTO_INCREMENT PRIMARY KEY,
          UserID INT NOT NULL,
          SimulationID INT NOT NULL,
          Score DECIMAL(5,2) DEFAULT 0.00,
          Attempts INT DEFAULT 0,
          TimeSpent INT DEFAULT 0,
          CompletionStatus ENUM('Not Started', 'In Progress', 'Completed') DEFAULT 'Not Started',
          DateStarted TIMESTAMP NULL,
          DateCompleted TIMESTAMP NULL,
          LastAttempt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (UserID) REFERENCES user(UserID) ON DELETE CASCADE,
          FOREIGN KEY (SimulationID) REFERENCES simulation(SimulationID) ON DELETE CASCADE,
          UNIQUE KEY unique_user_simulation (UserID, SimulationID),
          INDEX idx_user (UserID),
          INDEX idx_simulation (SimulationID)
        )
      `);
      console.log('✓ Simulation_progress table created\n');
    } catch (error) {
      if (error.code === 'ER_TABLE_EXISTS_ERROR') {
        console.log('✓ Simulation_progress table already exists\n');
      } else {
        throw error;
      }
    }
    
    // Insert sample data
    console.log('Inserting sample simulations...');
    try {
      await query(`
        INSERT INTO simulation (ModuleID, SimulationTitle, Description, ActivityType, MaxScore, TimeLimit, Instructions, SimulationOrder, Is_Locked) VALUES
        (3, 'Identifying Sections of the Motherboard', 'Learn to identify different sections and components of a computer motherboard', 'Interactive Diagram', 10, 5, 'Click on the correct sections of the motherboard as prompted', 1, FALSE),
        (3, 'Preparing the Motherboard', 'Practice the proper procedures for preparing a motherboard for installation', 'Step-by-Step Activity', 10, 0, 'Follow the steps to properly prepare the motherboard', 2, FALSE),
        (4, 'Installing the CPU', 'Practice the correct procedure for installing a CPU into the motherboard', 'Step-by-Step Activity', 10, 0, 'Follow the proper steps to install the CPU safely', 1, TRUE),
        (4, 'Installing the CPU Fan', 'Learn how to properly install a CPU cooling fan', 'Step-by-Step Activity', 10, 0, 'Install the CPU fan following manufacturer guidelines', 2, TRUE),
        (4, 'Installing the RAM', 'Practice installing RAM modules into the correct slots', 'Interactive Activity', 10, 0, 'Insert RAM modules into the appropriate DIMM slots', 3, TRUE),
        (4, 'Installing the Power Supply', 'Learn the proper installation of a computer power supply unit', 'Step-by-Step Activity', 10, 0, 'Mount and connect the power supply unit correctly', 4, TRUE)
      `);
      console.log('✓ Sample data inserted\n');
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        console.log('✓ Sample data already exists\n');
      } else if (error.code === 'ER_NO_REFERENCED_ROW_2') {
        console.log('⚠ Module IDs 3 and 4 do not exist - skipping sample data\n');
      } else {
        console.log('⚠ Error inserting sample data:', error.message, '\n');
      }
    }
    
    console.log('✓ Migration completed successfully!\n');
    
    // Verify tables exist
    const tables = await query("SHOW TABLES LIKE 'simulation%'");
    console.log('Created tables:');
    tables.forEach(table => {
      console.log(`  - ${Object.values(table)[0]}`);
    });
    
    // Check simulation count
    const simCount = await query('SELECT COUNT(*) as count FROM simulation');
    console.log(`\nTotal simulations: ${simCount[0].count}\n`);
    
  } catch (error) {
    console.error('✗ Migration failed:', error.message);
    process.exit(1);
  }
  
  process.exit(0);
};

runMigration();
