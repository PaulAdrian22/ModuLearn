-- Ensure simulation admin editor columns exist.
-- Safe to run multiple times.

-- ZoneData holds admin overrides (meta + timeline JSON).
SET @zone_data_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'simulation'
    AND COLUMN_NAME = 'ZoneData'
);

SET @zone_data_sql := IF(
  @zone_data_exists = 0,
  'ALTER TABLE simulation ADD COLUMN ZoneData LONGTEXT NULL',
  'SELECT "ZoneData already exists"'
);
PREPARE stmt_zone_data FROM @zone_data_sql;
EXECUTE stmt_zone_data;
DEALLOCATE PREPARE stmt_zone_data;

-- SimulationOrder is required by admin ordering and fallback resolution.
SET @simulation_order_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'simulation'
    AND COLUMN_NAME = 'SimulationOrder'
);

SET @simulation_order_sql := IF(
  @simulation_order_exists = 0,
  'ALTER TABLE simulation ADD COLUMN SimulationOrder INT NOT NULL DEFAULT 1',
  'SELECT "SimulationOrder already exists"'
);
PREPARE stmt_simulation_order FROM @simulation_order_sql;
EXECUTE stmt_simulation_order;
DEALLOCATE PREPARE stmt_simulation_order;
