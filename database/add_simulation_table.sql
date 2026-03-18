-- ============================================
-- SIMULATION TABLE
-- ============================================
CREATE TABLE simulation (
    SimulationID INT AUTO_INCREMENT PRIMARY KEY,
    ModuleID INT NOT NULL,
    SimulationTitle VARCHAR(200) NOT NULL,
    Description TEXT,
    ActivityType VARCHAR(100),
    MaxScore INT DEFAULT 10,
    TimeLimit INT DEFAULT 0, -- in minutes, 0 means no limit
    Instructions TEXT,
    SimulationOrder INT NOT NULL,
    Is_Locked BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (ModuleID) REFERENCES module(ModuleID) ON DELETE CASCADE,
    INDEX idx_module (ModuleID),
    INDEX idx_order (SimulationOrder)
);

-- ============================================
-- SIMULATION_PROGRESS TABLE
-- ============================================
CREATE TABLE simulation_progress (
    SimProgressID INT AUTO_INCREMENT PRIMARY KEY,
    UserID INT NOT NULL,
    SimulationID INT NOT NULL,
    Score DECIMAL(5,2) DEFAULT 0.00,
    Attempts INT DEFAULT 0,
    TimeSpent INT DEFAULT 0, -- in minutes
    CompletionStatus ENUM('Not Started', 'In Progress', 'Completed') DEFAULT 'Not Started',
    DateStarted TIMESTAMP NULL,
    DateCompleted TIMESTAMP NULL,
    LastAttempt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (UserID) REFERENCES user(UserID) ON DELETE CASCADE,
    FOREIGN KEY (SimulationID) REFERENCES simulation(SimulationID) ON DELETE CASCADE,
    UNIQUE KEY unique_user_simulation (UserID, SimulationID),
    INDEX idx_user (UserID),
    INDEX idx_simulation (SimulationID)
);

-- ============================================
-- SAMPLE SIMULATIONS DATA
-- ============================================
-- Lesson 3 Simulations
INSERT INTO simulation (ModuleID, SimulationTitle, Description, ActivityType, MaxScore, TimeLimit, Instructions, SimulationOrder, Is_Locked) VALUES
(3, 'Identifying Sections of the Motherboard', 'Learn to identify different sections and components of a computer motherboard', 'Interactive Diagram', 10, 5, 'Click on the correct sections of the motherboard as prompted', 1, FALSE),
(3, 'Preparing the Motherboard', 'Practice the proper procedures for preparing a motherboard for installation', 'Step-by-Step Activity', 10, 0, 'Follow the steps to properly prepare the motherboard', 2, FALSE);

-- Lesson 4 Simulations
INSERT INTO simulation (ModuleID, SimulationTitle, Description, ActivityType, MaxScore, TimeLimit, Instructions, SimulationOrder, Is_Locked) VALUES
(4, 'Installing the CPU', 'Practice the correct procedure for installing a CPU into the motherboard', 'Step-by-Step Activity', 10, 0, 'Follow the proper steps to install the CPU safely', 1, TRUE),
(4, 'Installing the CPU Fan', 'Learn how to properly install a CPU cooling fan', 'Step-by-Step Activity', 10, 0, 'Install the CPU fan following manufacturer guidelines', 2, TRUE),
(4, 'Installing the RAM', 'Practice installing RAM modules into the correct slots', 'Interactive Activity', 10, 0, 'Insert RAM modules into the appropriate DIMM slots', 3, TRUE),
(4, 'Installing the Power Supply', 'Learn the proper installation of a computer power supply unit', 'Step-by-Step Activity', 10, 0, 'Mount and connect the power supply unit correctly', 4, TRUE);
