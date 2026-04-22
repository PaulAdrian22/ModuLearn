// Server-side helpers for the simulation config pipeline.
// A simulation's "config" (meta + timeline) lives in simulation.ZoneData as JSON.
// When no override is present we fall back to the on-disk manifest.json that ships
// with the asset library.

const fs = require('fs');
const path = require('path');

const SIM_ASSETS_ROOT = path.join(__dirname, '..', 'sim-assets');

const PERSPECTIVE_CATEGORY_MAP = {
  'Front Panel': 'Front',
  'Back Panel': 'Back',
  'Back Panel - Inside': 'Back',
  'Side View': 'Side',
  'CPU Area': 'Side',
  'RAM Area': 'Side',
  'HDD Area': 'Side',
  'SSD Area': 'Side',
  'GPU Area': 'Side'
};

const FALLBACK_META = {
  1: {
    title: 'The Computer Parts',
    description: 'Navigate the system unit case to familiarize yourself with how different computer components look like.',
    skill: 'Memorization',
    steps: [
      'Unplug the power cable from the system unit.',
      'Open the system unit case.',
      'Explore the CPU area.',
      'Explore the RAM area.',
      'Explore the HDD bay area.',
      'Explore the SSD area.',
      'Explore the GPU area.',
      'Explore the inside back panel.',
      'Explore the front panel.',
      'Close the system unit case.',
      'Plug the power cable back into the system unit.'
    ]
  },
  2: {
    title: 'Disassembling the CPU',
    description: 'Navigate the system unit case to familiarize yourself with the CPU.',
    skill: 'Technical Comprehension',
    steps: [
      'Unplug the power cable from the system unit.',
      'Open the system unit case.',
      'Go to the CPU area.',
      'Disconnect the cables for the CPU Power and Fan from the motherboard.',
      'Unscrew the CPU Fan from the motherboard.',
      'Lift the metal rod that locks the CPU in place.',
      'Remove the CPU from the CPU socket and set aside.'
    ]
  },
  3: {
    title: 'Disassembling the Motherboard',
    description: 'Navigate the system unit case to familiarize yourself with the motherboard.',
    skill: 'Analytical Thinking',
    steps: [
      'Unplug the power cable from the system unit.',
      'Open the system unit case.',
      'Unplug all connectors connected to the motherboard.',
      'Unscrew the motherboard from the case.',
      'Set the motherboard aside.'
    ]
  },
  4: {
    title: 'Disassembling the RAM',
    description: 'Navigate the system unit case to familiarize yourself with the RAM.',
    skill: 'Problem Solving',
    steps: [
      'Unplug the power cable from the system unit.',
      'Open the system unit case.',
      'Go to the RAM area.',
      'Push down the clips of the RAM to release it.',
      'Pull out the RAM sticks and set aside.'
    ]
  },
  5: {
    title: 'Disassembling the HDD',
    description: 'Navigate the system unit case to familiarize yourself with the HDD.',
    skill: 'Critical Thinking',
    steps: [
      'Unplug the power cable from the system unit.',
      'Open the system unit case.',
      'Go to the HDD bay area.',
      'Unplug the SATA data and power cables from the HDD.',
      'Pull the HDD out from the drive bay and set aside.'
    ]
  },
  6: {
    title: 'Disassembling the SSD',
    description: 'Navigate the system unit case to familiarize yourself with the SSD.',
    skill: 'Memorization',
    steps: [
      'Unplug the power cable from the system unit.',
      'Open the system unit case.',
      'Go to the SSD area.',
      'Unscrew the SSD from the slot.',
      'Pull the SSD out from the slot and set aside.'
    ]
  },
  7: {
    title: 'Disassembling the GPU',
    description: 'Navigate the system unit case to familiarize yourself with the GPU.',
    skill: 'Technical Comprehension',
    steps: [
      'Unplug the power cable from the system unit.',
      'Open the system unit case.',
      'Go to the GPU area.',
      'Unplug the PCIe power cable from the GPU.',
      'Unscrew the GPU from the case from the inside back panel.',
      'Push down the clips of the PCIe slot.',
      'Pull out the GPU and set aside.'
    ]
  },
  8: {
    title: 'Disassembling the PSU',
    description: 'Navigate the system unit case to familiarize yourself with the PSU.',
    skill: 'Analytical Thinking',
    steps: [
      'Unplug the power cable from the system unit.',
      'Open the system unit case.',
      'Unplug all connectors connected to the motherboard.',
      'Go to the back panel of the system unit case.',
      'Unscrew the PSU mount.',
      'Pull out the PSU and set aside.'
    ]
  },
  9: {
    title: 'Disassembling the Cooling Systems',
    description: 'Navigate the system unit case to familiarize yourself with the cooling systems.',
    skill: 'Problem Solving',
    steps: [
      'Unplug the power cable from the system unit.',
      'Open the system unit case.',
      'Unplug the system fan connectors from the motherboard.',
      'Unscrew the cooling fan mounts from the back panel.',
      'Pull out the back fan and set aside.',
      'Remove the front panel cover.',
      'Unscrew the front cooling fan mounts.',
      'Pull out the front fans and set aside.'
    ]
  }
};

const safeString = (value) => String(value == null ? '' : value).trim();

const categoryForPerspective = (perspective = '') => {
  const key = safeString(perspective);
  return PERSPECTIVE_CATEGORY_MAP[key] || 'Side';
};

const stepOrderFromFilename = (filename = '') => {
  const base = String(filename).split(/[\\/]/).pop() || '';
  const match = base.match(/^(\d+)\s*\./);
  return match ? Number(match[1]) : 0;
};

const componentLabelFromFilename = (filename = '') => {
  const base = String(filename).split(/[\\/]/).pop() || '';
  const withoutExt = base.replace(/\.webp$/i, '');
  const withoutNumber = withoutExt.replace(/^\s*\d+\s*\.\s*/, '');
  const withoutSuffix = withoutNumber.replace(/\s*-\s*(Back|Side|Front|CPU Area|RAM Area|HDD Area|SSD Area|GPU Area|Back Panel(?: - Inside)?|Front Panel|Area)\s*$/i, '');
  return withoutSuffix.trim() || withoutNumber.trim() || base;
};

const resolveActivityOrder = (simulation) => {
  const explicit = Number(simulation?.SimulationOrder);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const title = safeString(simulation?.SimulationTitle);
  const match = title.match(/activity\s*(\d+)|simulation\s*#?\s*(\d+)/i);
  if (match) {
    const parsed = Number(match[1] || match[2] || 0);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
};

const loadManifestFromDisk = (activityOrder) => {
  const manifestPath = path.join(SIM_ASSETS_ROOT, `Activity ${activityOrder}`, 'manifest.json');
  try {
    if (!fs.existsSync(manifestPath)) return null;
    const raw = fs.readFileSync(manifestPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`Failed to load manifest for Activity ${activityOrder}:`, error.message);
    return null;
  }
};

const timelineFromManifest = (manifest) => {
  const mappings = Array.isArray(manifest?.mappings) ? manifest.mappings : [];
  if (mappings.length === 0) return [];

  const byStep = new Map();
  mappings.forEach((mapping, index) => {
    const assetPath = safeString(mapping?.source);
    const order = Number(mapping?.stepOrder) || stepOrderFromFilename(assetPath) || (index + 1);
    if (!byStep.has(order)) byStep.set(order, []);
    byStep.get(order).push({ mapping, index });
  });

  const sortedOrders = Array.from(byStep.keys()).sort((a, b) => a - b);
  const timeline = [];

  sortedOrders.forEach((order) => {
    const entries = byStep.get(order);
    const byPerspective = new Map();
    entries.forEach((entry) => {
      const perspective = safeString(entry.mapping?.perspective);
      if (!byPerspective.has(perspective)) byPerspective.set(perspective, []);
      byPerspective.get(perspective).push(entry);
    });

    let subIndex = 0;
    byPerspective.forEach((perEntries, perspective) => {
      const momentId = byPerspective.size > 1
        ? `moment-${order}-${subIndex}`
        : `moment-${order}`;
      subIndex += 1;

      const layers = perEntries.map(({ mapping }, layerIndex) => {
        const assetPath = safeString(mapping?.source);
        const targetPath = safeString(mapping?.target) || assetPath;
        const group = safeString(mapping?.componentGroup);
        return {
          id: `${momentId}-layer-${layerIndex}`,
          assetPath,
          targetPath,
          group,
          label: componentLabelFromFilename(assetPath),
          kind: group.toLowerCase() === 'case and panels' ? 'scene' : 'focus'
        };
      });

      timeline.push({
        id: momentId,
        order,
        perspective,
        category: categoryForPerspective(perspective),
        layers
      });
    });
  });

  return timeline;
};

const buildFallbackConfig = (activityOrder) => {
  const manifest = loadManifestFromDisk(activityOrder);
  const fallbackMeta = FALLBACK_META[activityOrder] || { title: `Activity ${activityOrder}`, description: '', skill: '', steps: [] };
  return {
    meta: {
      title: fallbackMeta.title,
      description: fallbackMeta.description,
      skill: fallbackMeta.skill,
      steps: [...(fallbackMeta.steps || [])]
    },
    timeline: timelineFromManifest(manifest || {})
  };
};

// Parse whatever is currently in simulation.ZoneData. May be null, a JSON string,
// or already-parsed object. If it has a valid meta+timeline, it's treated as the
// admin override; otherwise we fall back to the on-disk manifest.
const parseStoredConfig = (zoneData) => {
  if (!zoneData) return null;
  let parsed = zoneData;
  if (typeof zoneData === 'string') {
    try { parsed = JSON.parse(zoneData); } catch { return null; }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  if (!parsed.meta && !parsed.timeline) return null;
  return parsed;
};

const normalizeStoredConfig = (raw, activityOrder) => {
  console.log('=== normalizeStoredConfig called ===');
  console.log('Input raw config:', JSON.stringify(raw).substring(0, 500));
  console.log('Activity order:', activityOrder);
  
  const fallback = buildFallbackConfig(activityOrder);
  const rawMeta = raw?.meta || {};

  const meta = {
    title: safeString(rawMeta.title) || fallback.meta.title,
    description: safeString(rawMeta.description) || fallback.meta.description,
    skill: safeString(rawMeta.skill) || fallback.meta.skill,
    steps: Array.isArray(rawMeta.steps) && rawMeta.steps.length > 0
      ? rawMeta.steps.map(safeString).filter(Boolean)
      : [...fallback.meta.steps]
  };

  const rawTimeline = Array.isArray(raw?.timeline) ? raw.timeline : [];
  const timeline = (rawTimeline.length > 0 ? rawTimeline : fallback.timeline)
    .map((moment, momentIdx) => {
      const order = Number(moment?.order) || (momentIdx + 1);
      const id = safeString(moment?.id) || `moment-${order}-${momentIdx}`;
      const perspective = safeString(moment?.perspective);
      const layers = Array.isArray(moment?.layers) ? moment.layers : [];
      return {
        id,
        order,
        perspective,
        category: categoryForPerspective(perspective),
        layers: layers
          .map((layer, layerIdx) => {
            const assetPath = safeString(layer?.assetPath);
            if (!assetPath) return null;
            const kind = safeString(layer?.kind).toLowerCase() === 'scene' ? 'scene' : 'focus';
            const result = {
              id: safeString(layer?.id) || `${id}-layer-${layerIdx}`,
              assetPath,
              targetPath: safeString(layer?.targetPath) || assetPath,
              group: safeString(layer?.group),
              label: safeString(layer?.label) || componentLabelFromFilename(assetPath),
              kind
            };
            // Preserve click area and animation settings if present
            if (layer?.clickArea) result.clickArea = layer.clickArea;
            if (layer?.animation) {
              const animation = String(layer.animation).toLowerCase().trim();
              const validAnimations = ['zoom-in', 'zoom-out', 'move-away-left', 'move-away-right', 'wipe', 'none'];
              if (validAnimations.includes(animation)) {
                result.animation = animation;
              }
            }
            return result;
          })
          .filter(Boolean)
      };
    })
    .filter((moment) => moment.layers.length > 0)
    .sort((a, b) => a.order - b.order);

  console.log('=== normalizeStoredConfig output ===');
  const layerAnimationCounts = timeline.reduce((acc, m) => acc + m.layers.filter(l => l.animation).length, 0);
  const layerClickAreaCounts = timeline.reduce((acc, m) => acc + m.layers.filter(l => l.clickArea).length, 0);
  console.log(`Layers with animation: ${layerAnimationCounts}, Layers with clickArea: ${layerClickAreaCounts}`);

  return { meta, timeline };
};

// Public API: given a simulation row, return its merged config.
const getSimulationConfig = (simulation) => {
  const activityOrder = resolveActivityOrder(simulation);
  const stored = parseStoredConfig(simulation?.ZoneData);
  if (stored) {
    return {
      activityOrder,
      source: 'override',
      config: normalizeStoredConfig(stored, activityOrder)
    };
  }
  return {
    activityOrder,
    source: 'manifest',
    config: buildFallbackConfig(activityOrder)
  };
};

// Walk the asset folder for an activity and list every webp available for the
// admin editor's asset picker. Paths are returned in the same format the
// manifests use (e.g. "Activity 1/1. Plug - Back.webp") with the perspective
// and group inferred from their folder placement.
const listActivityAssets = (activityOrder) => {
  const rootDir = path.join(SIM_ASSETS_ROOT, `Activity ${activityOrder}`);
  if (!fs.existsSync(rootDir)) return [];

  const assets = [];
  const walk = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    entries.forEach((entry) => {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile() && /\.webp$/i.test(entry.name)) {
        const rel = path.relative(SIM_ASSETS_ROOT, abs).split(path.sep).join('/');
        const relFromActivity = path.relative(rootDir, abs).split(path.sep).join('/');
        const parts = relFromActivity.split('/');
        const perspective = parts.length >= 3 ? parts[0] : '';
        const group = parts.length >= 3 ? parts[1] : '';
        const filename = parts[parts.length - 1];
        // Prefer the "flat" sourcePath format used by manifests (Activity N/filename.webp)
        // over the nested target path for asset IDs — matches what editor users pick.
        const sourcePath = `Activity ${activityOrder}/${filename}`;
        assets.push({
          assetPath: sourcePath,
          targetPath: rel,
          filename,
          perspective,
          group,
          label: componentLabelFromFilename(filename),
          order: stepOrderFromFilename(filename)
        });
      }
    });
  };
  walk(rootDir);
  assets.sort((a, b) => (a.order || 9999) - (b.order || 9999) || a.filename.localeCompare(b.filename));
  return assets;
};

module.exports = {
  SIM_ASSETS_ROOT,
  resolveActivityOrder,
  getSimulationConfig,
  buildFallbackConfig,
  normalizeStoredConfig,
  listActivityAssets,
  categoryForPerspective,
  PERSPECTIVE_CATEGORY_MAP
};
