// Simulation activity data layer.
//
// The canonical runtime shape is a SimulationConfig:
//   {
//     meta: { title, description, skill, steps: string[] },
//     timeline: Moment[]
//   }
//
// A Moment groups one or more manifest layers that share a stepOrder + perspective.
// Each layer is classified as "scene" (static background built up over time) or
// "focus" (the interactive part the learner reveals or removes at that moment).
//
// This module is authoritative for converting between the legacy manifest.json
// format and the canonical config, so admin-edited configs and on-disk manifests
// share one rendering path.

export const ACTIVITY_META = {
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

export const PERSPECTIVE_CATEGORIES = ['Front', 'Back', 'Side'];

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

export const KNOWN_PERSPECTIVES = Object.keys(PERSPECTIVE_CATEGORY_MAP);

export const categoryForPerspective = (perspective = '') => {
  const key = String(perspective || '').trim();
  return PERSPECTIVE_CATEGORY_MAP[key] || 'Side';
};

export const componentLabelFromFilename = (filename = '') => {
  const base = String(filename).split(/[\\/]/).pop() || '';
  const withoutExt = base.replace(/\.webp$/i, '');
  const withoutNumber = withoutExt.replace(/^\s*\d+\s*\.\s*/, '');
  const withoutPerspectiveSuffix = withoutNumber.replace(/\s*-\s*(Back|Side|Front|CPU Area|RAM Area|HDD Area|SSD Area|GPU Area|Back Panel(?: - Inside)?|Front Panel|Area)\s*$/i, '');
  return withoutPerspectiveSuffix.trim() || withoutNumber.trim() || base;
};

export const stepOrderFromFilename = (filename = '') => {
  const match = String(filename).split(/[\\/]/).pop()?.match(/^(\d+)\s*\./);
  return match ? Number(match[1]) : 0;
};

const safeString = (value) => String(value == null ? '' : value).trim();

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const DEFAULT_ZOOM_AREA = {
  x: 35,
  y: 30,
  width: 30,
  height: 30,
};

const normalizeLayerAnimation = (animation) => {
  const value = String(animation || '').trim().toLowerCase();
  const validAnimations = ['zoom-in', 'zoom-out', 'move-away-left', 'move-away-right', 'wipe'];
  if (validAnimations.includes(value)) return value;
  return 'none';
};

export const normalizeZoomArea = (zoomArea) => {
  if (!zoomArea || typeof zoomArea !== 'object') return null;

  const rawWidth = Number(zoomArea.width);
  const rawHeight = Number(zoomArea.height);
  const width = clamp(Number.isFinite(rawWidth) ? rawWidth : DEFAULT_ZOOM_AREA.width, 5, 100);
  const height = clamp(Number.isFinite(rawHeight) ? rawHeight : DEFAULT_ZOOM_AREA.height, 5, 100);

  const rawX = Number(zoomArea.x);
  const rawY = Number(zoomArea.y);
  const x = clamp(Number.isFinite(rawX) ? rawX : DEFAULT_ZOOM_AREA.x, 0, 100 - width);
  const y = clamp(Number.isFinite(rawY) ? rawY : DEFAULT_ZOOM_AREA.y, 0, 100 - height);

  return { x, y, width, height };
};

const makeLayerId = (momentId, index) => `${momentId}-layer-${index}`;

// Convert a legacy manifest (the on-disk manifest.json) into the canonical
// timeline. Groups mappings by stepOrder, then by perspective so that a single
// stepOrder that spans multiple views (e.g. Activity 9 step 13 has three fans
// across Back and Front panels) becomes separate sequential moments.
export const timelineFromManifest = (manifest = {}) => {
  const mappings = Array.isArray(manifest?.mappings) ? manifest.mappings : [];
  if (mappings.length === 0) return [];

  const byStep = new Map();
  mappings.forEach((mapping, index) => {
    const path = safeString(mapping?.source);
    const order = Number(mapping?.stepOrder) || stepOrderFromFilename(path) || (index + 1);
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

    let perspectiveSubIndex = 0;
    byPerspective.forEach((perEntries, perspective) => {
      const momentId = byPerspective.size > 1
        ? `moment-${order}-${perspectiveSubIndex}`
        : `moment-${order}`;
      perspectiveSubIndex += 1;

      const layers = perEntries.map(({ mapping, index }, layerIndex) => {
        const assetPath = safeString(mapping?.source);
        const targetPath = safeString(mapping?.target);
        const group = safeString(mapping?.componentGroup);
        return {
          id: makeLayerId(momentId, layerIndex),
          assetPath,
          targetPath: targetPath || assetPath,
          group,
          label: componentLabelFromFilename(assetPath),
          kind: group.toLowerCase() === 'case and panels' ? 'scene' : 'focus',
          animation: 'none',
          clickArea: null,
          zoomArea: null,
          sourceIndex: index
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

// Build the full canonical config for an activity from on-disk manifest data.
export const configFromManifest = (activityOrder, manifest) => {
  const meta = ACTIVITY_META[activityOrder] || null;
  return {
    meta: meta
      ? {
          title: meta.title,
          description: meta.description,
          skill: meta.skill,
          steps: [...meta.steps]
        }
      : { title: `Activity ${activityOrder}`, description: '', skill: '', steps: [] },
    timeline: timelineFromManifest(manifest)
  };
};

// Defensive normalizer — accepts any reasonable shape and returns a valid config.
// Used both when loading persisted admin overrides and when repairing partials.
export const normalizeConfig = (raw = {}, { activityOrder, fallbackManifest } = {}) => {
  const fallbackMeta = ACTIVITY_META[activityOrder] || { title: '', description: '', skill: '', steps: [] };
  const rawMeta = raw?.meta || {};

  const meta = {
    title: safeString(rawMeta.title) || fallbackMeta.title || `Activity ${activityOrder || ''}`.trim(),
    description: safeString(rawMeta.description) || fallbackMeta.description || '',
    skill: safeString(rawMeta.skill) || fallbackMeta.skill || '',
    steps: Array.isArray(rawMeta.steps) && rawMeta.steps.length > 0
      ? rawMeta.steps.map((s) => safeString(s)).filter(Boolean)
      : [...(fallbackMeta.steps || [])]
  };

  let timeline = Array.isArray(raw?.timeline) ? raw.timeline : [];
  if (timeline.length === 0 && fallbackManifest) {
    timeline = timelineFromManifest(fallbackManifest);
  }

  timeline = timeline
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
            const clickArea = normalizeZoomArea(layer?.clickArea);
            const zoomArea = normalizeZoomArea(layer?.zoomArea);
            return {
              id: safeString(layer?.id) || makeLayerId(id, layerIdx),
              assetPath,
              targetPath: safeString(layer?.targetPath) || assetPath,
              group: safeString(layer?.group),
              label: safeString(layer?.label) || componentLabelFromFilename(assetPath),
              kind,
              animation: normalizeLayerAnimation(layer?.animation),
              clickArea,
              zoomArea
            };
          })
          .filter(Boolean)
      };
    })
    .filter((moment) => moment.layers.length > 0)
    .sort((a, b) => a.order - b.order);

  return { meta, timeline };
};

// Helpers used by the learner-side renderer.
export const isDisassemblyActivity = (meta) => {
  return String(meta?.title || '').toLowerCase().includes('disassembling');
};

// Compose the scene for the current moment:
//   - backgrounds: every "scene" layer from moments at or before currentIndex
//                  that shares the current moment's perspective.
//   - focusLayers: the focus layers of the current moment.
//   - revealedFocusIds: Set of focus-layer ids the learner has completed (in prior moments too).
export const composeScene = (timeline, currentIndex) => {
  const safeIndex = Math.max(0, Math.min(currentIndex, timeline.length - 1));
  const current = timeline[safeIndex];
  if (!current) return { backdrops: [], focusLayers: [], perspective: '', category: 'Side' };

  const backdrops = [];
  for (let i = 0; i <= safeIndex; i += 1) {
    const moment = timeline[i];
    if (!moment) continue;
    if (moment.perspective !== current.perspective) continue;
    moment.layers.forEach((layer) => {
      if (layer.kind === 'scene') backdrops.push(layer);
    });
  }

  return {
    perspective: current.perspective,
    category: current.category,
    backdrops,
    focusLayers: current.layers.filter((layer) => layer.kind === 'focus')
  };
};
