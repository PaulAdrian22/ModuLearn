const fs = require('fs');
const path = require('path');
const { query, closePool } = require('./config/database');

const NUMBERED_INSTRUCTION_PATTERN = /^(\d+)\.\s+\S+/;

const normalizePath = (value = '') => String(value || '').trim().replace(/\\/g, '/');

const isHttpUrl = (value = '') => /^https?:\/\//i.test(value);

const toLocalUploadPath = (assetPath = '') => {
  const normalized = normalizePath(assetPath);
  if (!normalized.startsWith('/uploads/')) return null;

  const relativeUploadPath = normalized.replace(/^\/uploads\//i, '');
  return path.resolve(__dirname, 'uploads', ...relativeUploadPath.split('/'));
};

const pathExists = async (absolutePath = '') => {
  try {
    await fs.promises.access(absolutePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

const isAssetReferenceValid = async (assetPath = '') => {
  const normalized = normalizePath(assetPath);
  if (!normalized) {
    return {
      valid: false,
      reason: 'Asset path is empty.'
    };
  }

  if (isHttpUrl(normalized)) {
    return {
      valid: true,
      reason: 'Remote URL'
    };
  }

  const localUploadPath = toLocalUploadPath(normalized);
  if (!localUploadPath) {
    return {
      valid: false,
      reason: 'Asset path must be a remote URL or start with /uploads/.'
    };
  }

  const exists = await pathExists(localUploadPath);
  if (!exists) {
    return {
      valid: false,
      reason: `Missing local file: ${localUploadPath}`
    };
  }

  return {
    valid: true,
    reason: 'Local upload file'
  };
};

const parseZoneData = (rawZoneData) => {
  if (!rawZoneData) return { parsed: null, error: 'ZoneData is empty.' };

  if (typeof rawZoneData === 'object') return { parsed: rawZoneData, error: null };

  try {
    return {
      parsed: JSON.parse(rawZoneData),
      error: null
    };
  } catch (error) {
    return {
      parsed: null,
      error: `ZoneData is invalid JSON: ${error.message}`
    };
  }
};

const collectDropZones = (zoneData = {}) => {
  const mainAreas = Array.isArray(zoneData.mainAreas) ? zoneData.mainAreas : [];
  const areaDropZones = mainAreas.flatMap((area) => (Array.isArray(area?.dropZones) ? area.dropZones : []));

  if (areaDropZones.length > 0) return areaDropZones;

  return Array.isArray(zoneData.dropZones) ? zoneData.dropZones : [];
};

const parseInstructionLines = (instructionText = '') => {
  return String(instructionText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
};

const validateInstructionNumbering = (instructionText = '') => {
  const lines = parseInstructionLines(instructionText);
  if (lines.length === 0) {
    return ['Instructions are empty.'];
  }

  const numericLines = [];
  const issues = [];

  lines.forEach((line) => {
    const match = line.match(NUMBERED_INSTRUCTION_PATTERN);
    if (!match) {
      issues.push(`Instruction is not numbered: "${line}"`);
      return;
    }

    numericLines.push(Number(match[1]));
  });

  if (numericLines.length === 0) {
    issues.push('No numbered instruction lines were found.');
    return issues;
  }

  if (numericLines[0] !== 1) {
    issues.push(`Instruction numbering must start at 1 (found ${numericLines[0]}).`);
  }

  for (let index = 1; index < numericLines.length; index += 1) {
    const expected = numericLines[index - 1] + 1;
    if (numericLines[index] !== expected) {
      issues.push(
        `Instruction numbering must be consecutive (expected ${expected}, found ${numericLines[index]}).`
      );
      break;
    }
  }

  return issues;
};

const buildSimulationLabel = (simulation) => {
  const moduleLabel = Number.isFinite(Number(simulation.ModuleID)) ? `M${Number(simulation.ModuleID)}` : 'M?';
  const orderLabel = Number.isFinite(Number(simulation.SimulationOrder)) ? `S${Number(simulation.SimulationOrder)}` : 'S?';
  return `[${moduleLabel}-${orderLabel}] ${simulation.SimulationTitle || 'Untitled Simulation'} (#${simulation.SimulationID})`;
};

const validateSimulation = async (simulation) => {
  const issues = [];
  const parsedZoneData = parseZoneData(simulation.ZoneData);

  if (parsedZoneData.error) {
    return [parsedZoneData.error];
  }

  const zoneData = parsedZoneData.parsed || {};
  const mainAreas = Array.isArray(zoneData.mainAreas) ? zoneData.mainAreas : [];
  const baseImage = String(mainAreas[0]?.backgroundImage || zoneData.backgroundImage || '').trim();

  if (!baseImage) {
    issues.push('Missing base image (mainAreas[0].backgroundImage or ZoneData.backgroundImage).');
  } else {
    const baseValidation = await isAssetReferenceValid(baseImage);
    if (!baseValidation.valid) {
      issues.push(`Invalid base image: ${baseValidation.reason}`);
    }
  }

  const dropZones = collectDropZones(zoneData);
  if (dropZones.length === 0) {
    issues.push('No step layers were found (dropZones is empty).');
  } else {
    for (let index = 0; index < dropZones.length; index += 1) {
      const zone = dropZones[index] || {};
      const zoneName = zone.label || `Layer ${index + 1}`;
      const layerImage = String(zone.layerImage || zone.smallImage || '').trim();
      const layerOrder = Number(zone.layerOrder);

      if (!layerImage) {
        issues.push(`Layer image missing for "${zoneName}".`);
      } else {
        const layerValidation = await isAssetReferenceValid(layerImage);
        if (!layerValidation.valid) {
          issues.push(`Invalid layer image for "${zoneName}": ${layerValidation.reason}`);
        }
      }

      if (!Number.isFinite(layerOrder) || layerOrder <= 0) {
        issues.push(`Invalid layerOrder for "${zoneName}" (value: ${zone.layerOrder}).`);
      }
    }
  }

  const instructionText = String(zoneData.instructionText || simulation.Instructions || '').trim();
  const instructionIssues = validateInstructionNumbering(instructionText);
  issues.push(...instructionIssues);

  return issues;
};

const run = async () => {
  console.log('\n=== Verifying Simulation Assets ===\n');

  try {
    const columns = await query('SHOW COLUMNS FROM simulation');
    const columnSet = new Set(columns.map((column) => column.Field));

    if (!columnSet.has('ZoneData')) {
      throw new Error('Simulation table does not have a ZoneData column. Run the simulation migration first.');
    }

    const hasModuleId = columnSet.has('ModuleID');
    const hasInstructions = columnSet.has('Instructions');

    const simulationRows = await query(
      `SELECT
        SimulationID,
        ${hasModuleId ? 'ModuleID' : 'NULL AS ModuleID'},
        SimulationTitle,
        SimulationOrder,
        ZoneData,
        ${hasInstructions ? 'Instructions' : "'' AS Instructions"}
      FROM simulation
      ORDER BY ${hasModuleId ? 'ModuleID,' : ''} SimulationOrder, SimulationID`
    );

    if (!Array.isArray(simulationRows) || simulationRows.length === 0) {
      throw new Error('No simulations were found in the simulation table.');
    }

    const failures = [];

    for (const simulation of simulationRows) {
      const issues = await validateSimulation(simulation);
      if (issues.length === 0) continue;

      failures.push({
        simulation,
        issues
      });
    }

    console.log(`Checked ${simulationRows.length} simulations.`);

    if (failures.length === 0) {
      console.log('PASS: All simulations have valid base images, step layers, and numbered instructions.\n');
      return;
    }

    console.error(`FAIL: ${failures.length} simulation(s) failed verification.\n`);

    failures.forEach((failure, index) => {
      const label = buildSimulationLabel(failure.simulation);
      console.error(`${index + 1}. ${label}`);
      failure.issues.forEach((issue) => {
        console.error(`   - ${issue}`);
      });
      console.error('');
    });

    process.exitCode = 1;
  } catch (error) {
    console.error(`Verification failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
};

run();
