const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { query, closePool } = require('./config/database');
const { isAzureStorageEnabled, uploadAssetFromPath } = require('./utils/uploadStorage');

const DRY_RUN = process.argv.includes('--dry-run');
const MODULES_ONLY = process.argv.includes('--modules-only');
const SIMULATIONS_ONLY = process.argv.includes('--simulations-only');

const SHOULD_PROCESS_MODULES = !SIMULATIONS_ONLY;
const SHOULD_PROCESS_SIMULATIONS = !MODULES_ONLY;

const UPLOADS_ROOT = path.resolve(__dirname, 'uploads');
const URL_MATCH_PATTERN = /\/?uploads\/(?:lessons|simulations)\/[^\s"'<>]+/gi;

const sharedState = {
  urlMap: new Map(),
  missingFiles: new Set(),
  totalFilesUploaded: 0,
  totalUrlRewrites: 0,
};

const stats = {
  modulesScanned: 0,
  modulesUpdated: 0,
  moduleFieldsUpdated: 0,
  simulationsScanned: 0,
  simulationsUpdated: 0,
  simulationFieldsUpdated: 0,
};

const splitTrailingPunctuation = (value = '') => {
  const match = String(value || '').match(/^(.+?)([),.;!?]+)?$/);
  if (!match) {
    return { core: String(value || ''), suffix: '' };
  }

  return {
    core: match[1] || '',
    suffix: match[2] || '',
  };
};

const normalizeUploadsUrl = (value = '') => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;

  const withoutQueryHash = trimmed.split('#')[0].split('?')[0].trim();
  if (!withoutQueryHash) return null;

  const normalized = withoutQueryHash.startsWith('/')
    ? withoutQueryHash
    : `/${withoutQueryHash}`;

  if (!/^\/uploads\/(lessons|simulations)\//i.test(normalized)) {
    return null;
  }

  return normalized.replace(/\\/g, '/');
};

const toAbsoluteLocalPath = (uploadsUrl = '') => {
  const normalized = normalizeUploadsUrl(uploadsUrl);
  if (!normalized) return null;

  const relativePath = normalized.replace(/^\/+/, '');
  const absolutePath = path.resolve(__dirname, ...relativePath.split('/'));

  if (!absolutePath.startsWith(UPLOADS_ROOT)) {
    return null;
  }

  return absolutePath;
};

const estimateBlobUrl = (blobPath = '') => {
  const normalizedBlobPath = String(blobPath || '').replace(/^\/+/, '');
  const customPublicBase = String(process.env.AZURE_STORAGE_PUBLIC_BASE_URL || '').trim();
  if (customPublicBase) {
    return `${customPublicBase.replace(/\/+$/, '')}/${normalizedBlobPath}`;
  }

  const accountName = String(process.env.AZURE_STORAGE_ACCOUNT_NAME || '').trim();
  const containerName = String(process.env.AZURE_STORAGE_CONTAINER_NAME || 'modulearn-assets').trim();
  if (accountName) {
    return `https://${accountName}.blob.core.windows.net/${containerName}/${normalizedBlobPath}`;
  }

  return `azure-blob://${normalizedBlobPath}`;
};

const migrateUploadsUrl = async (uploadsUrl, state) => {
  const normalized = normalizeUploadsUrl(uploadsUrl);
  if (!normalized) return uploadsUrl;

  if (state.urlMap.has(normalized)) {
    return state.urlMap.get(normalized);
  }

  const localPath = toAbsoluteLocalPath(normalized);
  if (!localPath) {
    state.urlMap.set(normalized, normalized);
    return normalized;
  }

  try {
    await fs.promises.access(localPath, fs.constants.R_OK);
  } catch {
    state.missingFiles.add(normalized);
    state.urlMap.set(normalized, normalized);
    return normalized;
  }

  const blobPath = normalized.replace(/^\/uploads\//i, '');

  const migratedUrl = DRY_RUN
    ? estimateBlobUrl(blobPath)
    : await uploadAssetFromPath(localPath, {
        category: blobPath.split('/')[0] || 'assets',
        preserveFileName: true,
        blobPath,
        deleteSource: false,
      });

  state.urlMap.set(normalized, migratedUrl);
  state.totalFilesUploaded += 1;
  return migratedUrl;
};

const rewriteStringValue = async (value, state) => {
  const directMatch = normalizeUploadsUrl(value);
  if (directMatch) {
    const migratedUrl = await migrateUploadsUrl(directMatch, state);
    const changed = migratedUrl !== directMatch;
    if (changed) state.totalUrlRewrites += 1;
    return { value: changed ? migratedUrl : value, changed };
  }

  const rawMatches = String(value || '').match(URL_MATCH_PATTERN) || [];
  if (rawMatches.length === 0) {
    return { value, changed: false };
  }

  const uniqueMatches = [...new Set(rawMatches)];
  let nextValue = String(value || '');
  let changed = false;

  for (const rawMatch of uniqueMatches) {
    const { core, suffix } = splitTrailingPunctuation(rawMatch);
    const normalized = normalizeUploadsUrl(core);
    if (!normalized) continue;

    const migratedUrl = await migrateUploadsUrl(normalized, state);
    if (migratedUrl === normalized) continue;

    const replacement = `${migratedUrl}${suffix}`;
    nextValue = nextValue.split(rawMatch).join(replacement);
    changed = true;
    state.totalUrlRewrites += 1;
  }

  return {
    value: changed ? nextValue : value,
    changed,
  };
};

const rewriteDeep = async (value, state) => {
  if (typeof value === 'string') {
    return rewriteStringValue(value, state);
  }

  if (Array.isArray(value)) {
    let changed = false;
    const nextItems = [];

    for (const item of value) {
      const result = await rewriteDeep(item, state);
      nextItems.push(result.value);
      if (result.changed) changed = true;
    }

    return { value: changed ? nextItems : value, changed };
  }

  if (value && typeof value === 'object') {
    let changed = false;
    const nextObject = {};

    for (const [key, entryValue] of Object.entries(value)) {
      const result = await rewriteDeep(entryValue, state);
      nextObject[key] = result.value;
      if (result.changed) changed = true;
    }

    return { value: changed ? nextObject : value, changed };
  }

  return { value, changed: false };
};

const parseJsonColumn = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (typeof value === 'object') {
    return value;
  }

  return null;
};

const migrateModuleJsonColumns = async () => {
  const rows = await query(
    `SELECT ModuleID, sections, diagnosticQuestions, reviewQuestions, finalQuestions
       FROM module`
  );

  for (const row of rows) {
    stats.modulesScanned += 1;

    const updates = {};
    const jsonFields = ['sections', 'diagnosticQuestions', 'reviewQuestions', 'finalQuestions'];

    for (const field of jsonFields) {
      const parsed = parseJsonColumn(row[field]);
      if (!parsed) continue;

      const rewritten = await rewriteDeep(parsed, sharedState);
      if (!rewritten.changed) continue;

      updates[field] = JSON.stringify(rewritten.value);
      stats.moduleFieldsUpdated += 1;
    }

    const updateFields = Object.keys(updates);
    if (updateFields.length === 0) continue;

    stats.modulesUpdated += 1;

    if (!DRY_RUN) {
      const setClause = updateFields.map((field) => `${field} = ?`).join(', ');
      const params = [...updateFields.map((field) => updates[field]), row.ModuleID];
      await query(`UPDATE module SET ${setClause} WHERE ModuleID = ?`, params);
    }
  }
};

const migrateSimulationColumns = async () => {
  const columnRows = await query('SHOW COLUMNS FROM simulation');
  const columnSet = new Set(columnRows.map((column) => String(column.Field || '')));

  const jsonFields = ['ZoneData'];
  const textFields = ['Description', 'Instructions'];
  const selectedFields = [
    ...jsonFields.filter((field) => columnSet.has(field)),
    ...textFields.filter((field) => columnSet.has(field)),
  ];

  if (selectedFields.length === 0) return;

  const rows = await query(`SELECT SimulationID, ${selectedFields.join(', ')} FROM simulation`);

  for (const row of rows) {
    stats.simulationsScanned += 1;

    const updates = {};

    for (const field of selectedFields) {
      if (jsonFields.includes(field)) {
        const parsed = parseJsonColumn(row[field]);
        if (!parsed) continue;

        const rewritten = await rewriteDeep(parsed, sharedState);
        if (!rewritten.changed) continue;

        updates[field] = JSON.stringify(rewritten.value);
        stats.simulationFieldsUpdated += 1;
        continue;
      }

      const rawValue = row[field];
      if (typeof rawValue !== 'string' || !rawValue.trim()) continue;

      const rewritten = await rewriteStringValue(rawValue, sharedState);
      if (!rewritten.changed) continue;

      updates[field] = rewritten.value;
      stats.simulationFieldsUpdated += 1;
    }

    const updateFields = Object.keys(updates);
    if (updateFields.length === 0) continue;

    stats.simulationsUpdated += 1;

    if (!DRY_RUN) {
      const setClause = updateFields.map((field) => `${field} = ?`).join(', ');
      const params = [...updateFields.map((field) => updates[field]), row.SimulationID];
      await query(`UPDATE simulation SET ${setClause} WHERE SimulationID = ?`, params);
    }
  }
};

const printSummary = () => {
  console.log('========================================');
  console.log(`Migration mode: ${DRY_RUN ? 'DRY RUN (no DB updates, no blob uploads)' : 'LIVE'}`);
  console.log(`Modules scanned: ${stats.modulesScanned}`);
  console.log(`Modules updated: ${stats.modulesUpdated}`);
  console.log(`Module fields updated: ${stats.moduleFieldsUpdated}`);
  console.log(`Simulations scanned: ${stats.simulationsScanned}`);
  console.log(`Simulations updated: ${stats.simulationsUpdated}`);
  console.log(`Simulation fields updated: ${stats.simulationFieldsUpdated}`);
  console.log(`Distinct files uploaded/planned: ${sharedState.totalFilesUploaded}`);
  console.log(`URL rewrites applied/planned: ${sharedState.totalUrlRewrites}`);

  if (sharedState.missingFiles.size > 0) {
    console.log('');
    console.log(`Missing referenced files (${sharedState.missingFiles.size}):`);
    [...sharedState.missingFiles].slice(0, 50).forEach((entry) => {
      console.log(` - ${entry}`);
    });
  }

  console.log('========================================');
};

const main = async () => {
  if (!DRY_RUN && !isAzureStorageEnabled()) {
    throw new Error('Set STORAGE_PROVIDER=azure before running live migration. Use --dry-run to preview without Azure uploads.');
  }

  console.log(`Starting media migration (${DRY_RUN ? 'dry run' : 'live'})...`);

  if (SHOULD_PROCESS_MODULES) {
    await migrateModuleJsonColumns();
  }

  if (SHOULD_PROCESS_SIMULATIONS) {
    await migrateSimulationColumns();
  }

  printSummary();
};

main()
  .catch((error) => {
    console.error('Media migration failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
