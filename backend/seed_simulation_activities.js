const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const { query, closePool } = require('./config/database');
const { uploadAssetFromPath, isAzureStorageEnabled } = require('./utils/uploadStorage');

const SIMULATION_ROOT = path.resolve(__dirname, '..', 'Simulations', 'simulation webp');
const DOCX_INSTRUCTIONS_PATH = path.resolve(__dirname, '..', 'Simulations', 'Assessments_ModuLearn.docx');
const UPLOAD_ROOT = path.resolve(__dirname, 'uploads', 'simulations');

const ACTIVITY_FOLDER_PATTERN = /^Activity\s+(\d+)$/i;
const STEP_PREFIX_PATTERN = /^(\d+)\s*\.\s*(.+)$/;
const SUPPORTED_ASSET_EXTENSION_PATTERN = /\.(webp|png|jpg|jpeg)$/i;
const STRICT_ACTIVITY_FOLDER_MIN = 1;
const STRICT_ACTIVITY_FOLDER_MAX = 9;

const SKILLS = [
  'Memorization',
  'Technical Comprehension',
  'Analytical Thinking',
  'Problem Solving',
  'Critical Thinking'
];

const normalizeSkill = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  const matched = SKILLS.find((skill) => skill.toLowerCase() === normalized);
  return matched || 'Memorization';
};

const AREA_LIBRARY = {
  'Side View': {
    background: 'Side View/1. Case Base - Side.PNG',
    parts: [
      { label: 'Power Cable', image: 'Back Panel/10. Plug - Back.PNG' },
      { label: 'System Unit Case Cover', image: 'Side View/14. Side Cover.png' },
      { label: 'Case Shade', image: 'Side View/2. Case Shade - Side.PNG' },
      { label: 'Front Panel Connectors', image: 'Side View/11. Front Panel Connectors - Side.PNG' },
      { label: 'Power Connectors', image: 'Side View/12. Power Connectors - Side.PNG' },
      { label: 'Screw Holes', image: 'Side View/13. Scew Holes - Side.PNG' },
      { label: 'Motherboard', image: 'Side View/3. Motherboard/1. motherboard_am4-transparent.png.PNG' },
      { label: 'Motherboard Screw', image: 'Side View/3. Motherboard/2. screws.PNG' },
      { label: 'CPU', image: 'Side View/4. CPU/1. CPU - Side.PNG' },
      { label: 'Thermal Paste', image: 'Side View/4. CPU/2. Paste - Side.PNG' },
      { label: 'CPU Fan', image: 'Side View/4. CPU/3. CPU Fan - Side.PNG' },
      { label: 'CPU Connector', image: 'Side View/4. CPU/4. CPU Connector - Side.PNG' },
      { label: 'RAM Stick 1', image: 'Side View/5. RAM/1. RAM 1 - Side.PNG' },
      { label: 'RAM Stick 2', image: 'Side View/5. RAM/2. RAM 2 - Side.PNG' },
      { label: 'HDD Bay', image: 'Side View/6. HDD/1. Bay - Side.PNG' },
      { label: 'HDD', image: 'Side View/6. HDD/2. HDD - Side.PNG' },
      { label: 'HDD Connector', image: 'Side View/6. HDD/3. HDD Connector - Side.PNG' },
      { label: 'SSD', image: 'Side View/7. SSD/1. SSD - Side.PNG' },
      { label: 'SSD Screw', image: 'Side View/7. SSD/2. SSD Screw - Side.PNG' },
      { label: 'PSU', image: 'Side View/8. PSU/2. PSU - Side.PNG' },
      { label: 'GPU', image: 'Side View/9. GPU/1. GPU - Side.PNG' },
      { label: 'GPU Screw', image: 'Side View/9. GPU/2. GPU Screw - Side.PNG' },
      { label: 'Back Fan', image: 'Side View/10. System Fan/1. Back Fan - Side.PNG' },
      { label: 'Front Fan 1', image: 'Side View/10. System Fan/2. Front Fan 1 - Side.PNG' },
      { label: 'Front Fan 2', image: 'Side View/10. System Fan/3. Front Fan 2 - Side.PNG' }
    ]
  },
  'CPU Area': {
    background: 'Side View/CPU Area/1. Base - CPU Area.PNG',
    parts: [
      { label: 'CPU', image: 'Side View/CPU Area/2. CPU - CPU Area.PNG' },
      { label: 'Thermal Paste', image: 'Side View/CPU Area/3. Paste - CPU Area.PNG' },
      { label: 'CPU Cooler', image: 'Side View/CPU Area/4. Cooler - CPU Area.PNG' },
      { label: 'CPU Connectors', image: 'Side View/CPU Area/5. Connectors - CPU Area.PNG' }
    ]
  },
  'RAM Area': {
    background: 'Side View/RAM Area/1. Lock Socket.PNG',
    parts: [
      { label: 'Unlock Socket', image: 'Side View/RAM Area/2. Unlock Socket.PNG' },
      { label: 'RAM Stick 1', image: 'Side View/RAM Area/3. RAM Stick 1.PNG' },
      { label: 'RAM Stick 2', image: 'Side View/RAM Area/4. RAM Stick 2.PNG' },
      { label: '24 Pin Power Connector', image: 'Side View/RAM Area/5. 24 Pin - RAM Area.PNG' }
    ]
  },
  'HDD Area': {
    background: 'Side View/HDD Area/1. Base - HDD Area.PNG',
    parts: [
      { label: 'HDD Connectors', image: 'Side View/HDD Area/2. Connectors - HDD Area.PNG' },
      { label: 'HDD', image: 'Side View/HDD Area/3. HDD - Area.PNG' }
    ]
  },
  'SSD Area': {
    background: 'Side View/SSD Area/1. Base - SSD Area.PNG',
    parts: [
      { label: 'SSD Locked', image: 'Side View/SSD Area/2. SSD Locked.PNG' },
      { label: 'SSD Unlock', image: 'Side View/SSD Area/3. SSD Unlock.PNG' },
      { label: 'System Fan Connector', image: 'Side View/SSD Area/4. System Fan - SSD Area.PNG' }
    ]
  },
  'GPU Area': {
    background: 'Side View/GPU Area/1. Base - GPU Area.PNG',
    parts: [
      { label: 'Front Panel Connectors', image: 'Side View/GPU Area/2. Front Panel Connectors - GPU Area.PNG' },
      { label: 'GPU', image: 'Side View/GPU Area/3. GPU - GPU Area.PNG' },
      { label: 'PCIe Slot', image: 'Side View/GPU Area/4. PCIe - GPU Area.PNG' },
      { label: 'GPU Screw', image: 'Side View/GPU Area/5. Screw - GPU Area.PNG' }
    ]
  },
  'Back Panel': {
    background: 'Back Panel/1. Shade - Base.PNG',
    parts: [
      { label: 'PSU', image: 'Back Panel/2. PSU - Back.PNG' },
      { label: 'Fan', image: 'Back Panel/3. Fan - Back.PNG' },
      { label: 'Ports', image: 'Back Panel/4. Ports - Back.PNG' },
      { label: 'GPU Ports', image: 'Back Panel/5. GPU Ports - Back.PNG' },
      { label: 'Grid', image: 'Back Panel/6. Grid - Back.PNG' },
      { label: 'PSU Screw', image: 'Back Panel/7. PSU Screw - Back.PNG' },
      { label: 'Fan Screw', image: 'Back Panel/8. Fan Screw - Back.PNG' },
      { label: 'GPU Plate', image: 'Back Panel/9. GPU Plate - Back.PNG' },
      { label: 'Power Plug', image: 'Back Panel/10. Plug - Back.PNG' }
    ]
  },
  'Back Panel - Inside': {
    background: 'Side View/Back Panel - Inside/1. Base - Back Panel Inside.PNG',
    parts: [
      { label: 'Fan Inside', image: 'Side View/Back Panel - Inside/2. Fan Inside - Back Panel Inside.PNG' },
      { label: 'GPU Screw and Plate', image: 'Side View/Back Panel - Inside/3. GPU Screw & Plate - Back Panel Inside.PNG' }
    ]
  },
  'Front Panel': {
    background: 'Front Panel/1. Base - Front.PNG',
    parts: [
      { label: 'Front Fan 1', image: 'Front Panel/2. Fan 1 - Front.PNG' },
      { label: 'Front Fan 1 Screw', image: 'Front Panel/3. Fan 1 Screw - Front.PNG' },
      { label: 'Front Fan 2', image: 'Front Panel/4. Fan 2 - Front.PNG' },
      { label: 'Front Fan 2 Screw', image: 'Front Panel/5. Fan 2 Screw - Front.PNG' },
      { label: 'Front Panel Cover', image: 'Front Panel/6. Front Panel Cover.PNG' }
    ]
  }
};

const AREA_KEYWORDS = [
  { keyword: 'inside back panel', area: 'Back Panel - Inside' },
  { keyword: 'back panel inside', area: 'Back Panel - Inside' },
  { keyword: 'back inside panel', area: 'Back Panel - Inside' },
  { keyword: 'back panel', area: 'Back Panel' },
  { keyword: 'front panel', area: 'Front Panel' },
  { keyword: 'front side', area: 'Front Panel' },
  { keyword: 'cpu area', area: 'CPU Area' },
  { keyword: 'ram area', area: 'RAM Area' },
  { keyword: 'hdd bay', area: 'HDD Area' },
  { keyword: 'hdd area', area: 'HDD Area' },
  { keyword: 'ssd area', area: 'SSD Area' },
  { keyword: 'gpu area', area: 'GPU Area' },
  { keyword: 'psu area', area: 'Side View' },
  { keyword: 'side view', area: 'Side View' }
];

const PROCESS_AREA_ALIASES = [
  { token: 'side', area: 'Side View' },
  { token: 'side view', area: 'Side View' },
  { token: 'back', area: 'Back Panel' },
  { token: 'back panel', area: 'Back Panel' },
  { token: 'front', area: 'Front Panel' },
  { token: 'front panel', area: 'Front Panel' },
  { token: 'inside back panel', area: 'Back Panel - Inside' },
  { token: 'back panel inside', area: 'Back Panel - Inside' },
  { token: 'cpu', area: 'CPU Area' },
  { token: 'cpu area', area: 'CPU Area' },
  { token: 'ram', area: 'RAM Area' },
  { token: 'ram area', area: 'RAM Area' },
  { token: 'ssd', area: 'SSD Area' },
  { token: 'ssd area', area: 'SSD Area' },
  { token: 'hdd', area: 'HDD Area' },
  { token: 'hdd area', area: 'HDD Area' },
  { token: 'gpu', area: 'GPU Area' },
  { token: 'gpu area', area: 'GPU Area' }
];

const STEP_AREA_HINTS = [
  { pattern: /i\/?o\s+shield|rear\s+panel|back\s+ports?/, area: 'Back Panel' },
  { pattern: /inside\s+back\s+panel|back\s+panel\s+inside/, area: 'Back Panel - Inside' },
  { pattern: /cpu\s+area|processor\s+area|cpu\s+socket|thermal\s+paste|cpu\s+cooler/, area: 'CPU Area' },
  { pattern: /ram\s+area|ram\s+slot|memory\s+slot|slot\s+a2|slot\s+b2/, area: 'RAM Area' },
  { pattern: /ssd\s+area|\bssd\b|m\.2/, area: 'SSD Area' },
  { pattern: /hdd\s+area|\bhdd\b|drive\s+bay|storage\s+bay/, area: 'HDD Area' },
  { pattern: /gpu\s+area|\bgpu\b|pcie/, area: 'GPU Area' },
  { pattern: /front\s+panel|front\s+fan/, area: 'Front Panel' }
];

const TARGET_HINT_RULES = [
  { pattern: /open\s+the\s+system\s+unit\s+case|open\s+the\s+side\s+panel|side\s+panel|case\s+cover/, labels: ['System Unit Case Cover'], area: 'Side View' },
  { pattern: /(unplug|disconnect|remove|detach)\s+(the\s+)?(power\s+cable|power\s+plug|power\s+connector|power)/, labels: ['Power Cable', 'Power Plug', 'Power Connectors'] },
  { pattern: /i\/?o\s+shield|rear\s+shield/, labels: ['Ports', 'GPU Plate'], area: 'Back Panel' },
  { pattern: /24\s*-?\s*pin|atx\s+power/, labels: ['24 Pin Power Connector', 'Power Connectors'] },
  { pattern: /8\s*-?\s*pin|cpu\s+power/, labels: ['CPU Connector', 'CPU Connectors'] },
  { pattern: /power\s+and\s+reset|front\s+panel\s+connector/, labels: ['Front Panel Connectors'] },
  { pattern: /cpu\s+cooler|cooler\s+fan|heatsink/, labels: ['CPU Fan', 'CPU Cooler'] },
  { pattern: /cooler\s+fan\s+connector|cpu\s+fan\s+connector/, labels: ['CPU Connector', 'CPU Connectors'] },
  { pattern: /thermal\s+paste|\bpaste\b/, labels: ['Thermal Paste'] },
  { pattern: /ram\s+slot|memory\s+slot|ram\s+socket/, labels: ['Unlock Socket', 'RAM Stick 1', 'RAM Stick 2'] },
  { pattern: /sata\s+power\s+cable|power\s+cable/, labels: ['Power Cable', 'Power Connectors'] },
  { pattern: /sata\s+cable|data\s+cable/, labels: ['HDD Connector', 'HDD Connectors'] },
  { pattern: /storage\s+drive\s+bay|drive\s+bay/, labels: ['HDD Bay'] },
  { pattern: /psu\s+mounting|power\s+supply/, labels: ['PSU'] },
  { pattern: /gpu\s+screw/, labels: ['GPU Screw', 'GPU Screw and Plate'] },
  { pattern: /front\s+fan\s+1/, labels: ['Front Fan 1', 'Front Fan 1 Screw'] },
  { pattern: /front\s+fan\s+2/, labels: ['Front Fan 2', 'Front Fan 2 Screw'] },
  { pattern: /back\s+fan|rear\s+fan/, labels: ['Back Fan', 'Fan', 'Fan Inside'] }
];

const TITLE_FOCUS_RULES = [
  {
    pattern: /motherboard/,
    labels: ['System Unit Case Cover', 'Motherboard', 'Motherboard Screw', 'Front Panel Connectors', 'Power Connectors', 'CPU Connector', 'Ports']
  },
  {
    pattern: /processor|\bcpu\b/,
    labels: ['System Unit Case Cover', 'CPU', 'Thermal Paste', 'CPU Fan', 'CPU Cooler', 'CPU Connector', 'CPU Connectors']
  },
  {
    pattern: /ram/,
    labels: ['System Unit Case Cover', 'RAM Stick 1', 'RAM Stick 2', 'Unlock Socket', '24 Pin Power Connector']
  },
  {
    pattern: /internal storage|ssd|hdd/,
    labels: ['System Unit Case Cover', 'SSD', 'SSD Screw', 'SSD Unlock', 'HDD', 'HDD Bay', 'HDD Connector', 'HDD Connectors', 'Power Cable']
  },
  {
    pattern: /psu|power supply/,
    labels: ['System Unit Case Cover', 'PSU', 'PSU Screw', 'Power Cable', 'Power Connectors', 'Power Plug']
  },
  {
    pattern: /cooling|fan/,
    labels: ['Back Fan', 'Front Fan 1', 'Front Fan 2', 'Fan', 'Fan Screw', 'Fan Inside', 'System Fan Connector']
  },
  {
    pattern: /gpu/,
    labels: ['GPU', 'GPU Screw', 'GPU Plate', 'GPU Ports', 'GPU Screw and Plate', 'PCIe Slot']
  }
];

const normalizeLine = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const normalizeTextToken = (value = '') =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const sanitizeStepLine = (value = '') => normalizeLine(String(value || '').replace(/^[-*]\s*/, '').replace(/^[0-9]+[.)]\s*/, ''));

const NUMBERED_LIST_PATTERN = /^\d+\s*[.)]\s+/;
const ALPHABET_LIST_PATTERN = /^[a-z]\s*[.)]\s+/i;

const isNumberedListLine = (value = '') => NUMBERED_LIST_PATTERN.test(normalizeLine(value));
const isAlphabetListLine = (value = '') => ALPHABET_LIST_PATTERN.test(normalizeLine(value));

const stripNumberedPrefix = (value = '') => sanitizeStepLine(String(value || '').replace(NUMBERED_LIST_PATTERN, ''));
const stripAlphabetPrefix = (value = '') => sanitizeStepLine(String(value || '').replace(ALPHABET_LIST_PATTERN, ''));

const dedupeLines = (lines = []) => {
  const unique = [];
  const seen = new Set();

  lines.forEach((line) => {
    const cleaned = sanitizeStepLine(line);
    if (!cleaned) return;

    const normalized = cleaned.toLowerCase();
    if (seen.has(normalized)) return;

    seen.add(normalized);
    unique.push(cleaned);
  });

  return unique;
};

const splitStructuredInstructionAndProcessLines = (rawLines = []) => {
  const instructionLines = [];
  const processSteps = [];
  let lastType = null;

  rawLines.forEach((line) => {
    const normalizedLine = normalizeLine(line);
    if (!normalizedLine) return;

    if (isNumberedListLine(normalizedLine)) {
      const instruction = stripNumberedPrefix(normalizedLine);
      if (instruction) {
        instructionLines.push(instruction);
        lastType = 'instruction';
      }
      return;
    }

    if (isAlphabetListLine(normalizedLine)) {
      const processStep = stripAlphabetPrefix(normalizedLine);
      if (processStep) {
        processSteps.push(processStep);
        lastType = 'process';
      }
      return;
    }

    const continuation = sanitizeStepLine(normalizedLine);
    if (!continuation) return;

    if (lastType === 'process' && processSteps.length > 0) {
      const lastIndex = processSteps.length - 1;
      processSteps[lastIndex] = normalizeLine(`${processSteps[lastIndex]} ${continuation}`);
      return;
    }

    if (lastType === 'instruction' && instructionLines.length > 0) {
      const lastIndex = instructionLines.length - 1;
      instructionLines[lastIndex] = normalizeLine(`${instructionLines[lastIndex]} ${continuation}`);
    }
  });

  return {
    instructionLines: dedupeLines(instructionLines),
    processSteps: dedupeLines(processSteps)
  };
};

const decodeHtmlEntities = (value = '') => String(value || '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&gt;/g, '>')
  .replace(/&lt;/g, '<')
  .replace(/&amp;/g, '&')
  .replace(/&#39;/g, "'")
  .replace(/&quot;/g, '"');

const cleanHtmlListText = (value = '') => sanitizeStepLine(decodeHtmlEntities(value).replace(/\s+/g, ' '));

const extractStructuredStepsFromHtmlBlock = (htmlBlock = '') => {
  if (!htmlBlock) {
    return {
      instructionLines: [],
      processSteps: []
    };
  }

  const stepsAnchorIndex = htmlBlock.toLowerCase().indexOf('steps');
  if (stepsAnchorIndex < 0) {
    return {
      instructionLines: [],
      processSteps: []
    };
  }

  const afterSteps = htmlBlock.slice(stepsAnchorIndex);
  const firstListIndex = afterSteps.toLowerCase().indexOf('<ol');
  if (firstListIndex < 0) {
    return {
      instructionLines: [],
      processSteps: []
    };
  }

  const listHtml = afterSteps.slice(firstListIndex);
  const tokens = listHtml.match(/<\/?ol[^>]*>|<\/?li[^>]*>|<[^>]+>|[^<]+/gi) || [];

  const instructionLines = [];
  const processSteps = [];
  const liStack = [];
  let listDepth = 0;
  let started = false;

  for (const token of tokens) {
    const lower = token.toLowerCase();

    if (/^<ol\b/.test(lower)) {
      listDepth += 1;
      started = true;
      continue;
    }

    if (/^<\/ol>/.test(lower)) {
      listDepth = Math.max(0, listDepth - 1);
      if (started && listDepth === 0) break;
      continue;
    }

    if (/^<li\b/.test(lower)) {
      liStack.push({ depth: listDepth, text: '' });
      continue;
    }

    if (/^<\/li>/.test(lower)) {
      const completed = liStack.pop();
      if (!completed) continue;

      const text = cleanHtmlListText(completed.text);
      if (!text) continue;

      if (completed.depth === 1) {
        instructionLines.push(text);
      } else if (completed.depth >= 2) {
        processSteps.push(text);
      }

      continue;
    }

    if (/^<[^>]+>$/.test(token)) continue;

    if (liStack.length > 0) {
      const activeIndex = liStack.length - 1;
      liStack[activeIndex].text = `${liStack[activeIndex].text} ${token}`;
    }
  }

  return {
    instructionLines: dedupeLines(instructionLines),
    processSteps: dedupeLines(processSteps)
  };
};

const buildHtmlStructuredStepsBySimulation = (html = '') => {
  const map = new Map();
  const markerRegex = /lesson\s+(\d+)\s*:|simulation\s*#\s*(\d+)\s*:/gi;
  const markers = [...String(html || '').matchAll(markerRegex)];
  const simulations = [];
  let currentLessonId = null;

  markers.forEach((marker) => {
    if (marker[1]) {
      currentLessonId = Number(marker[1]);
      return;
    }

    if (marker[2]) {
      simulations.push({
        lessonId: currentLessonId,
        simulationOrder: Number(marker[2]),
        index: Number(marker.index || 0)
      });
    }
  });

  for (let index = 0; index < simulations.length; index += 1) {
    const current = simulations[index];
    const next = simulations[index + 1];
    const blockStart = current.index;
    const blockEnd = next ? next.index : String(html || '').length;
    const htmlBlock = String(html || '').slice(blockStart, blockEnd);
    const structured = extractStructuredStepsFromHtmlBlock(htmlBlock);

    if (structured.instructionLines.length > 0 || structured.processSteps.length > 0) {
      const key = `${String(current.lessonId || 0)}:${String(current.simulationOrder)}`;
      map.set(key, structured);
    }
  }

  return map;
};

const buildActivityNarrative = (activity = {}) => [
  activity.title,
  activity.description,
  ...(activity.instructionLines || []),
  ...(activity.steps || [])
].join(' ').toLowerCase();

const DISASSEMBLY_TITLE_PATTERN = /\b(disassembl(?:e|ing|y)?|dismantl(?:e|ing)?|tear\s*down)\b/i;

const shouldStartOnAssembledLayer = (activity = {}) => {
  const title = String(activity?.title || '');
  if (DISASSEMBLY_TITLE_PATTERN.test(title)) return true;

  const earlySteps = [
    ...(activity?.instructionLines || []).slice(0, 3),
    ...(activity?.steps || []).slice(0, 3)
  ];

  const earlyNarrative = earlySteps.join(' ').toLowerCase();
  if (!earlyNarrative) return false;

  const removeScore = (earlyNarrative.match(/\b(remove|detach|disconnect|unplug|unscrew|take\s+out|pull\s+out)\b/g) || []).length;
  const installScore = (earlyNarrative.match(/\b(install|attach|insert|mount|plug\s+in|connect)\b/g) || []).length;

  return removeScore >= 2 && removeScore > installScore;
};

const labelMatchesNarrative = (label = '', narrative = '') => {
  const normalizedLabel = normalizeTextToken(label);
  if (!normalizedLabel) return false;

  if (narrative.includes(normalizedLabel)) return true;

  const singular = normalizedLabel.endsWith('s') ? normalizedLabel.slice(0, -1) : normalizedLabel;
  if (singular && narrative.includes(singular)) return true;

  return false;
};

const findMatchingLabel = (pool = [], desiredLabel = '') => {
  const desired = normalizeTextToken(desiredLabel);
  if (!desired) return null;

  return pool.find((label) => {
    const normalized = normalizeTextToken(label);
    return normalized === desired || normalized.includes(desired) || desired.includes(normalized);
  }) || null;
};

const ensureDirectory = async (dirPath) => {
  await fs.promises.mkdir(dirPath, { recursive: true });
};

const toPosixPath = (value = '') => String(value || '').replace(/\\/g, '/');

const removeStepPrefix = (value = '') => {
  const match = String(value || '').match(STEP_PREFIX_PATTERN);
  if (!match) return String(value || '').trim();
  return String(match[2] || '').trim();
};

const deriveStepOrderFromRelativePath = (relativePath = '') => {
  const segments = toPosixPath(relativePath).split('/').filter(Boolean);

  for (const segment of segments) {
    const nameOnly = String(segment || '').replace(/\.[^.]+$/, '').trim();
    const match = nameOnly.match(STEP_PREFIX_PATTERN);
    if (match?.[1]) {
      return Number(match[1]);
    }
  }

  return null;
};

const buildStepLabelFromRelativePath = (relativePath = '') => {
  const normalizedPath = toPosixPath(relativePath);
  const segments = normalizedPath.split('/').filter(Boolean);
  const lastSegment = segments[segments.length - 1] || '';
  const withoutExt = lastSegment.replace(/\.[^.]+$/, '');
  const cleaned = normalizeLine(removeStepPrefix(withoutExt).replace(/[_-]+/g, ' '));

  if (cleaned) return cleaned;

  const fallbackName = removeStepPrefix(withoutExt);
  return fallbackName || 'Step Layer';
};

const walkActivityFolderAssets = async (absoluteFolderPath, relativePrefix = '') => {
  const directoryEntries = await fs.promises.readdir(absoluteFolderPath, { withFileTypes: true });
  let collected = [];

  for (const directoryEntry of directoryEntries) {
    const absoluteEntryPath = path.join(absoluteFolderPath, directoryEntry.name);
    const relativeEntryPath = relativePrefix
      ? `${relativePrefix}/${directoryEntry.name}`
      : directoryEntry.name;

    if (directoryEntry.isDirectory()) {
      const nested = await walkActivityFolderAssets(absoluteEntryPath, relativeEntryPath);
      collected = collected.concat(nested);
      continue;
    }

    if (!SUPPORTED_ASSET_EXTENSION_PATTERN.test(directoryEntry.name)) {
      continue;
    }

    collected.push(toPosixPath(relativeEntryPath));
  }

  return collected;
};

const getOrderedAssetsForActivityFolder = async (activityFolderName = '') => {
  const absoluteFolderPath = path.join(SIMULATION_ROOT, activityFolderName);

  let rawRelativePaths = [];
  try {
    rawRelativePaths = await walkActivityFolderAssets(absoluteFolderPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const enriched = rawRelativePaths
    .map((relativePath) => ({
      relativePath,
      stepOrder: deriveStepOrderFromRelativePath(relativePath),
      label: buildStepLabelFromRelativePath(relativePath)
    }))
    .filter((entry) => Number.isFinite(Number(entry.stepOrder)))
    .sort((a, b) => {
      const stepDelta = Number(a.stepOrder) - Number(b.stepOrder);
      if (stepDelta !== 0) return stepDelta;
      return a.relativePath.localeCompare(b.relativePath);
    });

  const stepCounters = {};

  return enriched.map((entry) => {
    const key = String(entry.stepOrder);
    const sameStepIndex = stepCounters[key] || 0;
    stepCounters[key] = sameStepIndex + 1;

    const layerOrder = Number((Number(entry.stepOrder) + sameStepIndex * 0.01).toFixed(2));

    return {
      ...entry,
      layerOrder
    };
  });
};

const listAvailableActivityFolders = async () => {
  let entries = [];
  try {
    entries = await fs.promises.readdir(SIMULATION_ROOT, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  return entries
    .filter((entry) => entry.isDirectory() && ACTIVITY_FOLDER_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => {
      const aMatch = a.match(ACTIVITY_FOLDER_PATTERN);
      const bMatch = b.match(ACTIVITY_FOLDER_PATTERN);
      const aIndex = aMatch ? Number(aMatch[1]) : Number.MAX_SAFE_INTEGER;
      const bIndex = bMatch ? Number(bMatch[1]) : Number.MAX_SAFE_INTEGER;
      return aIndex - bIndex;
    });
};

const parseActivityFolderIndex = (folderName = '') => {
  const match = String(folderName || '').match(ACTIVITY_FOLDER_PATTERN);
  if (!match) return null;

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
};

const getStrictActivityFolders = (folders = []) => {
  return folders.filter((folderName) => {
    const index = parseActivityFolderIndex(folderName);
    if (!Number.isFinite(index)) return false;
    return index >= STRICT_ACTIVITY_FOLDER_MIN && index <= STRICT_ACTIVITY_FOLDER_MAX;
  });
};

const getActivityIdentity = (activity = {}) => {
  return `${String(activity.moduleId || 0)}:${String(activity.simulationOrder || 0)}:${String(activity.title || '')}`;
};

const resolveActivityFolderName = (activity = {}, availableFolders = []) => {
  const normalizedFolderMap = new Map(
    availableFolders.map((folderName) => [folderName.toLowerCase(), folderName])
  );

  const candidates = [
    activity.activityFolderHint,
    Number.isFinite(Number(activity.activityIndex)) ? `Activity ${Number(activity.activityIndex)}` : ''
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = normalizedFolderMap.get(String(candidate).toLowerCase());
    if (resolved) return resolved;
  }

  return null;
};

const copyAssetToUploads = async (relativePath) => {
  const sourcePath = path.join(SIMULATION_ROOT, ...relativePath.split('/'));
  const normalized = relativePath.replace(/\\/g, '/');

  if (isAzureStorageEnabled()) {
    try {
      await fs.promises.access(sourcePath, fs.constants.R_OK);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.warn(`Missing asset: ${relativePath}`);
        return null;
      }
      throw error;
    }

    return uploadAssetFromPath(sourcePath, {
      category: 'simulations',
      preserveFileName: true,
      blobPath: `simulations/${normalized}`,
      deleteSource: false,
    });
  }

  const destinationPath = path.join(UPLOAD_ROOT, ...relativePath.split('/'));

  await ensureDirectory(path.dirname(destinationPath));

  try {
    await fs.promises.copyFile(sourcePath, destinationPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`Missing asset: ${relativePath}`);
      return null;
    }
    throw error;
  }

  return `/uploads/simulations/${normalized}`;
};

const getGridCoordinates = (count) => {
  const base = [
    { x: 16, y: 16 }, { x: 34, y: 16 }, { x: 52, y: 16 }, { x: 70, y: 16 }, { x: 88, y: 16 },
    { x: 16, y: 35 }, { x: 34, y: 35 }, { x: 52, y: 35 }, { x: 70, y: 35 }, { x: 88, y: 35 },
    { x: 16, y: 54 }, { x: 34, y: 54 }, { x: 52, y: 54 }, { x: 70, y: 54 }, { x: 88, y: 54 },
    { x: 16, y: 73 }, { x: 34, y: 73 }, { x: 52, y: 73 }, { x: 70, y: 73 }, { x: 88, y: 73 },
    { x: 16, y: 90 }, { x: 34, y: 90 }, { x: 52, y: 90 }, { x: 70, y: 90 }, { x: 88, y: 90 }
  ];

  return Array.from({ length: count }, (_, index) => base[index] || {
    x: 14 + (index % 5) * 18,
    y: 16 + Math.floor(index / 5) * 18
  });
};

const inferActionType = (stepText = '') => {
  const normalized = String(stepText || '').toLowerCase();

  if (/^(go to|go back|return to|back to|side\s*>|cpu area\s*>|ram area\s*>|gpu area\s*>|ssd area\s*>|hdd area\s*>)/.test(normalized)) {
    return 'navigate';
  }

  const hasDragCoreVerb = /(drag|install|set aside|pull out|insert|mount|attach)/.test(normalized);
  const hasPlaceVerb = /\bplace\b.*\b(into|onto|on|in|to)\b/.test(normalized);
  if (hasDragCoreVerb || hasPlaceVerb) return 'drag';

  if (/(open|close|locate|identify|ensure|check|review|find)/.test(normalized)) {
    return 'mark';
  }

  if (/(open|close|unplug|disconnect|unscrew|screw|lift|push|remove|lock|unlock|apply|connect|click)/.test(normalized)) {
    return 'interact';
  }

  return 'mark';
};

const normalizeRequiredTool = (value = '', fallback = 'hand') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'screwdriver' || normalized === 'hand') return normalized;
  return fallback;
};

const inferRequiredToolForStep = (stepText = '', targetLabel = '') => {
  const normalized = `${String(stepText || '')} ${String(targetLabel || '')}`.toLowerCase();

  if (/\b(screwdriver|unscrew|screw|screw\s*holes?)\b/.test(normalized)) {
    return 'screwdriver';
  }

  return 'hand';
};

const getPerspectiveIdByAreaName = (perspectives = [], areaName = '') => {
  const normalizedTarget = normalizeTextToken(areaName);
  if (!normalizedTarget) return null;

  const match = perspectives.find((perspective) =>
    normalizeTextToken(perspective?.name || '') === normalizedTarget
  );

  return match ? Number(match.id) : null;
};

const resolveAreaNameFromToken = (token = '', perspectives = []) => {
  const cleaned = normalizeLine(String(token || '').replace(/\(.*?\)/g, ''));
  const normalized = normalizeTextToken(cleaned);
  if (!normalized) return null;
  if (normalized === 'any area') return null;

  for (const alias of PROCESS_AREA_ALIASES) {
    const aliasToken = normalizeTextToken(alias.token);
    if (!aliasToken) continue;

    if (normalized === aliasToken || normalized.includes(aliasToken) || aliasToken.includes(normalized)) {
      return alias.area;
    }
  }

  for (const perspective of perspectives) {
    const perspectiveName = String(perspective?.name || '').trim();
    const normalizedPerspective = normalizeTextToken(perspectiveName);
    if (!normalizedPerspective) continue;

    if (
      normalized === normalizedPerspective
      || normalized.includes(normalizedPerspective)
      || normalizedPerspective.includes(normalized)
    ) {
      return perspectiveName;
    }
  }

  return null;
};

const inferInteractionModeFromLabel = (label = '') => {
  const normalized = String(label || '').toLowerCase();

  if (/(screw|connector|cable|lock|clip|plug|button|latch|socket|switch)/.test(normalized)) {
    return 'click';
  }

  return 'drag';
};

const inferAreasFromActivity = (activity = {}) => {
  const text = [
    activity.title,
    activity.description,
    ...(activity.instructionLines || []),
    ...(activity.steps || [])
  ].join(' ').toLowerCase();

  const areaSet = new Set(['Side View']);

  AREA_KEYWORDS.forEach(({ keyword, area }) => {
    if (text.includes(keyword)) areaSet.add(area);
  });

  const title = String(activity.title || '').toLowerCase();

  if (title.includes('motherboard')) {
    areaSet.add('Side View');
    areaSet.add('Back Panel');
  }

  if (title.includes('processor') || title.includes('cpu')) {
    areaSet.add('CPU Area');
  }

  if (title.includes('ram')) {
    areaSet.add('RAM Area');
  }

  if (title.includes('internal storage')) {
    areaSet.add('SSD Area');
    areaSet.add('HDD Area');
  }

  if (title.includes('ssd')) {
    areaSet.add('SSD Area');
  }

  if (title.includes('hdd')) {
    areaSet.add('HDD Area');
  }

  if (title.includes('gpu')) {
    areaSet.add('GPU Area');
    areaSet.add('Back Panel - Inside');
  }

  if (title.includes('psu') || title.includes('power supply')) {
    areaSet.add('Back Panel');
  }

  if (title.includes('cooling')) {
    areaSet.add('Front Panel');
    areaSet.add('Back Panel');
    areaSet.add('Back Panel - Inside');
    areaSet.add('SSD Area');
  }

  const areas = Array.from(areaSet).filter((areaName) => Boolean(AREA_LIBRARY[areaName]));
  return areas.length > 0 ? areas : ['Side View'];
};

const parseActivitiesFromDocx = async () => {
  const { value: rawText } = await mammoth.extractRawText({ path: DOCX_INSTRUCTIONS_PATH });
  const { value: htmlText } = await mammoth.convertToHtml({ path: DOCX_INSTRUCTIONS_PATH });
  const structuredBySimulation = buildHtmlStructuredStepsBySimulation(htmlText);

  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);

  const activities = [];
  let currentLessonId = null;
  let current = null;
  let inSteps = false;
  let metadataField = null;

  const flushCurrent = () => {
    if (!current || !currentLessonId) {
      current = null;
      inSteps = false;
      metadataField = null;
      return;
    }

    const filteredStepLines = current.rawSteps
      .map(normalizeLine)
      .filter((line) => {
        if (!line) return false;
        if (/^note\s*:/i.test(line)) return false;
        if (/^\(show/i.test(line)) return false;
        if (line.includes('>')) return false;
        if (/(?:\bpic\b|\bfolder\b|button\s+on|highlighted)/i.test(line)) return false;
        if (line === '.') return false;
        return true;
      });

    const { instructionLines: numberedInstructions, processSteps: alphabetProcessSteps } =
      splitStructuredInstructionAndProcessLines(filteredStepLines);

    const htmlKey = `${String(currentLessonId || 0)}:${String(current.simulationOrder)}`;
    const htmlStructured = structuredBySimulation.get(htmlKey) || null;

    const fallbackInstructionLines = dedupeLines(filteredStepLines);
    const htmlOrFallbackInstructionLines = htmlStructured?.instructionLines?.length > 0
      ? htmlStructured.instructionLines
      : (numberedInstructions.length > 0 ? numberedInstructions : fallbackInstructionLines);

    const instructionLines = dedupeLines([
      ...htmlOrFallbackInstructionLines,
      ...fallbackInstructionLines
    ]);

    const normalizedTitle = sanitizeStepLine(current.title);
    const normalizedDescription = sanitizeStepLine(current.description);
    const normalizedSkill = normalizeSkill(current.skillType);
    const numberedFlowSteps = instructionLines.length > 0 ? instructionLines : fallbackInstructionLines;

    if (!normalizedTitle || numberedFlowSteps.length === 0) {
      current = null;
      inSteps = false;
      metadataField = null;
      return;
    }

    const activity = {
      moduleId: currentLessonId,
      simulationOrder: current.simulationOrder,
      skillType: normalizedSkill,
      title: normalizedTitle,
      description: normalizedDescription || 'Simulation activity imported from Assessments_ModuLearn.docx.',
      steps: numberedFlowSteps,
      instructionLines: numberedFlowSteps
    };

    activity.areas = inferAreasFromActivity(activity);
    activities.push(activity);

    current = null;
    inSteps = false;
    metadataField = null;
  };

  lines.forEach((line) => {
    const lessonMatch = line.match(/^Lesson\s+(\d+)\s*:/i);
    if (lessonMatch) {
      flushCurrent();
      currentLessonId = Number(lessonMatch[1]);
      return;
    }

    const simulationMatch = line.match(/^Simulation\s*#\s*(\d+)\s*:\s*(.+)$/i);
    if (simulationMatch) {
      flushCurrent();
      current = {
        simulationOrder: Number(simulationMatch[1]),
        skillType: normalizeSkill(simulationMatch[2]),
        title: '',
        description: '',
        setupNotes: [],
        rawSteps: []
      };
      inSteps = false;
      metadataField = null;
      return;
    }

    if (!current) return;

    if (/^Title\s*:/i.test(line)) {
      current.title = sanitizeStepLine(line.replace(/^Title\s*:/i, ''));
      metadataField = 'title';
      return;
    }

    if (/^Description\s*:/i.test(line)) {
      current.description = sanitizeStepLine(line.replace(/^Description\s*:/i, ''));
      metadataField = 'description';
      return;
    }

    if (/^Skill\s*:/i.test(line)) {
      const skillText = sanitizeStepLine(line.replace(/^Skill\s*:/i, ''));
      if (skillText) current.skillType = normalizeSkill(skillText);
      metadataField = null;
      return;
    }

    if (/^Steps\s*\(in\s*sequence\)\s*:/i.test(line)) {
      inSteps = true;
      metadataField = null;
      return;
    }

    if (/^Notes?\s*:/i.test(line) && !inSteps) {
      metadataField = null;
      return;
    }

    if (/^\(show/i.test(line) || /^NOTE\s*:/i.test(line)) {
      current.setupNotes.push(line);
      return;
    }

    if (inSteps) {
      current.rawSteps.push(line);
      return;
    }

    if (metadataField === 'description') {
      current.description = normalizeLine(`${current.description} ${line}`);
      return;
    }

    if (metadataField === 'title') {
      current.title = normalizeLine(`${current.title} ${line}`);
    }
  });

  flushCurrent();

  const orderedActivities = activities
    .filter((activity) => Number(activity.moduleId) === 3 || Number(activity.moduleId) === 4)
    .sort((a, b) => {
      if (a.moduleId !== b.moduleId) return a.moduleId - b.moduleId;
      return a.simulationOrder - b.simulationOrder;
    });

  return orderedActivities.map((activity, index) => {
    const activityIndex = index + 1;
    return {
      ...activity,
      activityIndex,
      activityFolderHint: `Activity ${activityIndex}`
    };
  });
};

const resolvePrimaryAreaName = (activity = {}) => {
  const candidateAreas = Array.isArray(activity?.areas)
    ? activity.areas.filter((areaName) => Boolean(AREA_LIBRARY[areaName]))
    : [];

  if (candidateAreas.length === 0) return 'Side View';

  const text = [
    activity.title,
    activity.description,
    ...(activity.steps || []),
    ...(activity.instructionLines || [])
  ].join(' ').toLowerCase();

  const scored = candidateAreas.map((areaName) => {
    const template = AREA_LIBRARY[areaName];
    let score = 0;

    if (text.includes(areaName.toLowerCase())) score += 5;

    (template.parts || []).forEach((part) => {
      const label = String(part?.label || '').toLowerCase();
      if (label && text.includes(label)) score += 3;
    });

    return {
      areaName,
      score: score - (template.parts?.length || 0) * 0.15
    };
  });

  scored.sort((a, b) => b.score - a.score);
  if (scored[0]?.score > 0) return scored[0].areaName;

  if (candidateAreas.includes('Side View')) return 'Side View';
  return candidateAreas[0];
};

const inferTargetLabel = (stepText = '', perspectives = [], perspectiveId = null) => {
  const normalized = String(stepText || '').toLowerCase();

  const preferredZones = (perspectiveId
    ? perspectives.filter((perspective) => perspective.id === perspectiveId)
    : perspectives)
    .flatMap((perspective) => perspective.dropZones || [])
    .map((zone) => ({
      areaName: perspectiveId
        ? perspectives.find((perspective) => perspective.id === perspectiveId)?.name || null
        : null,
      label: String(zone?.label || '').trim()
    }))
    .filter((zone) => Boolean(zone.label));

  const fallbackZones = perspectives
    .flatMap((perspective) => (perspective.dropZones || []).map((zone) => ({
      areaName: perspective.name,
      label: String(zone?.label || '').trim()
    })))
    .filter((zone) => Boolean(zone.label));

  const resolveFromZones = (zones = []) => {
    const labels = zones.map((zone) => zone.label).sort((a, b) => b.length - a.length);
    if (labels.length === 0) return '';

    const direct = labels.find((label) => normalized.includes(label.toLowerCase()));
    if (direct) return direct;

    for (const rule of TARGET_HINT_RULES) {
      if (!rule.pattern.test(normalized)) continue;

      const scopedLabels = rule.area
        ? zones.filter((zone) => zone.areaName === rule.area).map((zone) => zone.label)
        : labels;
      const candidatePool = scopedLabels.length > 0 ? scopedLabels : labels;

      for (const desiredLabel of rule.labels) {
        const match = findMatchingLabel(candidatePool, desiredLabel);
        if (match) return match;
      }
    }

    return '';
  };

  const preferredTarget = resolveFromZones(preferredZones);
  if (preferredTarget) return preferredTarget;

  if (!perspectiveId) return '';
  return resolveFromZones(fallbackZones);
};

const parseProcessCommandStep = (stepText = '', perspectives = [], activePerspectiveId = null) => {
  const normalizedStep = normalizeLine(stepText);
  if (!normalizedStep || !normalizedStep.includes('>')) return null;

  const buttonMatch = normalizedStep.match(/^(.+?)\s*-\s*button\s+on\s+(.+?)(?:\s*>\s*click(?:\s*>\s*.*)?)?$/i);
  if (buttonMatch) {
    const areaName = resolveAreaNameFromToken(buttonMatch[1], perspectives);
    const perspectiveId = areaName
      ? getPerspectiveIdByAreaName(perspectives, areaName)
      : (activePerspectiveId || null);

    const perspective = perspectives.find((entry) => Number(entry.id) === Number(perspectiveId));
    const zoneLabels = (perspective?.dropZones || []).map((zone) => String(zone?.label || '').trim()).filter(Boolean);

    const rawTarget = sanitizeStepLine(String(buttonMatch[2] || '').replace(/\(.*?\)/g, ''));
    const condensedTarget = normalizeLine(
      rawTarget
        .replace(/\b(button|on|highlighted|area)\b/gi, ' ')
        .replace(/\s+/g, ' ')
    ).trim();
    const ambiguousTarget = /^(highlighted|area|highlighted area)$/i.test(condensedTarget) || condensedTarget.length < 3;

    const targetLabel =
      findMatchingLabel(zoneLabels, rawTarget)
      || (condensedTarget ? findMatchingLabel(zoneLabels, condensedTarget) : null)
      || (!ambiguousTarget ? inferTargetLabel(rawTarget, perspectives, perspectiveId) : '')
      || (!ambiguousTarget ? inferTargetLabel(rawTarget, perspectives, null) : '')
      || '';

    const displayArea = areaName || perspective?.name || 'current view';
    const displayTarget = targetLabel || rawTarget || 'required control';

    return {
      text: `Click ${displayTarget} in ${displayArea}.`,
      actionType: 'interact',
      perspectiveId,
      targetLabel,
      requiredTool: inferRequiredToolForStep(normalizedStep, targetLabel || rawTarget)
    };
  }

  const segments = normalizedStep
    .split('>')
    .map((segment) => normalizeLine(String(segment || '').replace(/\(.*?\)/g, '')))
    .filter(Boolean);

  if (segments.length < 2) return null;

  const hasAnyAreaStep = segments.some((segment) => normalizeTextToken(segment).includes('any area'));
  if (hasAnyAreaStep) {
    const sidePerspectiveId = getPerspectiveIdByAreaName(perspectives, 'Side View') || activePerspectiveId || null;
    return {
      text: 'Open a highlighted area, then return to Side View.',
      actionType: 'mark',
      perspectiveId: sidePerspectiveId,
      targetLabel: '',
      requiredTool: 'hand'
    };
  }

  const destinationArea = resolveAreaNameFromToken(segments[segments.length - 1], perspectives);
  const destinationPerspectiveId = destinationArea
    ? getPerspectiveIdByAreaName(perspectives, destinationArea)
    : null;

  if (destinationArea && !destinationPerspectiveId) {
    return {
      text: `Move focus to ${destinationArea}.`,
      actionType: 'mark',
      perspectiveId: activePerspectiveId || null,
      targetLabel: '',
      requiredTool: 'hand'
    };
  }

  if (!destinationPerspectiveId) return null;

  return {
    text: `Navigate to ${destinationArea}.`,
    actionType: 'navigate',
    perspectiveId: destinationPerspectiveId,
    targetLabel: '',
    requiredTool: 'hand'
  };
};

const inferRelevantLabelsForArea = (activity = {}, areaName = '') => {
  const areaTemplate = AREA_LIBRARY[areaName];
  if (!areaTemplate) return new Set();

  const narrative = buildActivityNarrative(activity);
  const title = String(activity?.title || '').toLowerCase();
  const availableLabels = areaTemplate.parts.map((part) => String(part?.label || '').trim()).filter(Boolean);
  const selected = new Set();

  availableLabels.forEach((label) => {
    if (labelMatchesNarrative(label, narrative)) {
      selected.add(label);
    }
  });

  TARGET_HINT_RULES.forEach((rule) => {
    if (!rule.pattern.test(narrative)) return;
    if (rule.area && rule.area !== areaName) return;

    rule.labels.forEach((desiredLabel) => {
      const match = findMatchingLabel(availableLabels, desiredLabel);
      if (match) selected.add(match);
    });
  });

  TITLE_FOCUS_RULES.forEach((rule) => {
    if (!rule.pattern.test(title)) return;

    rule.labels.forEach((desiredLabel) => {
      const match = findMatchingLabel(availableLabels, desiredLabel);
      if (match) selected.add(match);
    });
  });

  return selected;
};

const buildPerspective = async (areaName, perspectiveId, allowedLabels = null, options = {}) => {
  const areaTemplate = AREA_LIBRARY[areaName];
  if (!areaTemplate) {
    throw new Error(`Unknown area template: ${areaName}`);
  }

  const initialVisualState = options?.initialVisualState === 'assembled' ? 'assembled' : 'base';

  const filteredParts = allowedLabels && allowedLabels.size > 0
    ? areaTemplate.parts.filter((part) => allowedLabels.has(part.label))
    : areaTemplate.parts;

  const parts = filteredParts.length > 0 ? filteredParts : areaTemplate.parts;

  const backgroundImage = await copyAssetToUploads(areaTemplate.background);
  const coordinates = getGridCoordinates(parts.length);

  const dropZones = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const imagePath = await copyAssetToUploads(part.image);

    if (!imagePath) continue;

    dropZones.push({
      id: index + 1,
      x: coordinates[index].x,
      y: coordinates[index].y,
      label: part.label,
      smallImage: imagePath,
      layerImage: imagePath,
      layerOrder: index + 1,
      interactionMode: inferInteractionModeFromLabel(part.label)
    });
  }

  return {
    id: perspectiveId,
    name: areaName,
    backgroundImage,
    dropZones,
    initialVisualState
  };
};

const buildInstructionText = (steps = []) => steps.map((step, index) => `${index + 1}. ${step}`).join('\n');

const buildFlowStepsFromImageOrder = (instructionSteps = [], dropZones = [], perspectiveId = 1) => {
  const normalizedSteps = dedupeLines(instructionSteps);
  const orderedZones = [...dropZones].sort((a, b) => {
    const orderDelta = Number(a?.layerOrder || 0) - Number(b?.layerOrder || 0);
    if (orderDelta !== 0) return orderDelta;

    return Number(a?.id || 0) - Number(b?.id || 0);
  });

  return orderedZones.map((zone, index) => {
    const stepText = normalizedSteps[index] || `Place ${zone.label}.`;
    const targetLabel = zone?.label || '';
    const actionType = inferActionType(stepText);

    return {
      id: index + 1,
      text: stepText,
      actionType: actionType === 'navigate' ? 'mark' : actionType,
      perspectiveId,
      targetLabel,
      requiredTool: normalizeRequiredTool('', inferRequiredToolForStep(stepText, targetLabel || ''))
    };
  });
};

const inferAreaNameFromStep = (stepText = '', perspectives = []) => {
  const normalized = String(stepText || '').toLowerCase();
  if (!normalized) return null;

  const availableAreas = new Set(
    (perspectives || []).map((perspective) => String(perspective?.name || '').trim()).filter(Boolean)
  );

  for (const { keyword, area } of AREA_KEYWORDS) {
    if (normalized.includes(keyword) && availableAreas.has(area)) {
      return area;
    }
  }

  for (const hint of STEP_AREA_HINTS) {
    if (hint.pattern.test(normalized) && availableAreas.has(hint.area)) {
      return hint.area;
    }
  }

  return null;
};

const buildFlowSteps = (steps = [], perspectives = []) => {
  const fallbackPerspectiveId = perspectives[0]?.id || 1;
  const sideViewPerspectiveId = perspectives.find((perspective) => perspective.name === 'Side View')?.id || null;
  let activePerspectiveId = sideViewPerspectiveId || fallbackPerspectiveId;

  return steps.map((stepText, index) => {
    const parsedProcessStep = parseProcessCommandStep(stepText, perspectives, activePerspectiveId);
    if (parsedProcessStep) {
      const parsedPerspectiveId = Number.isFinite(Number(parsedProcessStep.perspectiveId))
        && Number(parsedProcessStep.perspectiveId) > 0
        ? Number(parsedProcessStep.perspectiveId)
        : (activePerspectiveId || fallbackPerspectiveId);

      if (parsedPerspectiveId) {
        activePerspectiveId = parsedPerspectiveId;
      }

      return {
        id: index + 1,
        text: parsedProcessStep.text,
        actionType: parsedProcessStep.actionType,
        perspectiveId: parsedPerspectiveId || null,
        targetLabel: parsedProcessStep.targetLabel || '',
        requiredTool: normalizeRequiredTool(
          parsedProcessStep.requiredTool,
          inferRequiredToolForStep(parsedProcessStep.text, parsedProcessStep.targetLabel || '')
        )
      };
    }

    const inferredAreaName = inferAreaNameFromStep(stepText, perspectives);
    const inferredPerspectiveId = inferredAreaName
      ? perspectives.find((perspective) => perspective.name === inferredAreaName)?.id || null
      : null;

    if (inferredPerspectiveId) {
      activePerspectiveId = inferredPerspectiveId;
    }

    let stepPerspectiveId = inferredPerspectiveId || activePerspectiveId || fallbackPerspectiveId;
    const inferredActionType = inferActionType(stepText);
    const targetLabel = inferTargetLabel(stepText, perspectives, stepPerspectiveId)
      || inferTargetLabel(stepText, perspectives, null);

    if (!inferredPerspectiveId && targetLabel) {
      const activePerspective = perspectives.find((perspective) => Number(perspective.id) === Number(stepPerspectiveId));
      const activeHasTarget = Boolean(activePerspective?.dropZones?.some((zone) => String(zone?.label || '') === targetLabel));

      if (!activeHasTarget) {
        const targetPerspective = perspectives.find((perspective) =>
          perspective.dropZones?.some((zone) => String(zone?.label || '') === targetLabel)
        );

        if (targetPerspective?.id) {
          stepPerspectiveId = Number(targetPerspective.id);
        }
      }
    }

    if (!inferredPerspectiveId && !targetLabel) {
      stepPerspectiveId = sideViewPerspectiveId || fallbackPerspectiveId;
    }

    activePerspectiveId = stepPerspectiveId;

    let actionType = inferredActionType;
    if (actionType === 'interact' && !targetLabel) {
      actionType = 'mark';
    }

    return {
      id: index + 1,
      text: stepText,
      actionType,
      perspectiveId: stepPerspectiveId,
      targetLabel,
      requiredTool: normalizeRequiredTool('', inferRequiredToolForStep(stepText, targetLabel || ''))
    };
  });
};

const ensureZoneDataColumn = async () => {
  const columns = await query('SHOW COLUMNS FROM simulation');
  const hasZoneData = columns.some((column) => column.Field === 'ZoneData');

  if (!hasZoneData) {
    await query('ALTER TABLE simulation ADD COLUMN ZoneData JSON NULL');
    console.log('Added ZoneData JSON column to simulation table.');
  }
};

const getSimulationColumnSet = async () => {
  const columns = await query('SHOW COLUMNS FROM simulation');
  return new Set(columns.map((column) => column.Field));
};

const resolveSimulationOrder = async (activity, columnSet) => {
  const hasModuleColumn = columnSet.has('ModuleID');

  if (hasModuleColumn) {
    return activity.simulationOrder;
  }

  const existingByTitle = await query(
    'SELECT SimulationOrder FROM simulation WHERE SimulationTitle = ? LIMIT 1',
    [activity.title]
  );

  if (existingByTitle.length > 0) {
    return existingByTitle[0].SimulationOrder;
  }

  const maxRows = await query('SELECT COALESCE(MAX(SimulationOrder), 0) AS maxOrder FROM simulation');
  return Number(maxRows[0]?.maxOrder || 0) + 1;
};

const upsertSimulation = async (activity, zoneData, columnSet, resolvedOrder) => {
  const hasModuleColumn = columnSet.has('ModuleID');

  const existing = hasModuleColumn
    ? await query(
      'SELECT SimulationID FROM simulation WHERE ModuleID <=> ? AND SimulationOrder = ? LIMIT 1',
      [activity.moduleId, resolvedOrder]
    )
    : await query(
      'SELECT SimulationID FROM simulation WHERE SimulationTitle = ? LIMIT 1',
      [activity.title]
    );

  const instructions = buildInstructionText(activity.instructionLines?.length > 0 ? activity.instructionLines : activity.steps);
  const maxScore = 100;
  const normalizedSkill = normalizeSkill(activity.skillType);

  const payload = {
    SimulationTitle: activity.title,
    Description: activity.description,
    ActivityType: 'Adaptive Workflow',
    MaxScore: maxScore,
    TimeLimit: 0,
    SimulationOrder: resolvedOrder,
    ZoneData: JSON.stringify({
      instructionText: instructions,
      skillType: normalizedSkill,
      flowSteps: zoneData.flowSteps,
      mainAreas: zoneData.mainAreas,
      backgroundImage: zoneData.backgroundImage,
      dropZones: zoneData.dropZones,
      imageSequence: zoneData.imageSequence || []
    })
  };

  if (columnSet.has('ModuleID')) payload.ModuleID = activity.moduleId;
  if (columnSet.has('Instructions')) payload.Instructions = instructions;
  if (columnSet.has('Is_Locked')) payload.Is_Locked = false;
  if (columnSet.has('SkillType')) payload.SkillType = normalizedSkill;

  if (existing.length > 0) {
    const updateColumns = Object.keys(payload);
    const updateAssignments = updateColumns.map((column) => `${column} = ?`).join(', ');
    const updateValues = updateColumns.map((column) => payload[column]);

    await query(
      `UPDATE simulation SET ${updateAssignments} WHERE SimulationID = ?`,
      [...updateValues, existing[0].SimulationID]
    );

    return { mode: 'updated', simulationId: existing[0].SimulationID };
  }

  const insertColumns = Object.keys(payload);
  const placeholders = insertColumns.map(() => '?').join(', ');
  const result = await query(
    `INSERT INTO simulation (${insertColumns.join(', ')}) VALUES (${placeholders})`,
    insertColumns.map((column) => payload[column])
  );

  return { mode: 'created', simulationId: result.insertId };
};

const buildZoneDataForActivity = async (activity, availableFolders = []) => {
  const activityFolderName = resolveActivityFolderName(activity, availableFolders);

  if (!activityFolderName) {
    throw new Error(
      `No matching image folder was found for "${activity.title}". `
      + `Expected ${activity.activityFolderHint || 'an Activity folder'} in ${SIMULATION_ROOT}.`
    );
  }

  const orderedAssets = await getOrderedAssetsForActivityFolder(activityFolderName);

  if (orderedAssets.length === 0) {
    throw new Error(`No numbered image assets were found inside ${activityFolderName}.`);
  }

  const baseAsset = orderedAssets.find((asset) => Number(asset.stepOrder) === 1) || orderedAssets[0];
  const baseImagePath = await copyAssetToUploads(`${activityFolderName}/${baseAsset.relativePath}`);

  if (!baseImagePath) {
    throw new Error(`Base image could not be copied for ${activityFolderName}.`);
  }

  const layerCandidates = orderedAssets.filter((asset) => asset.relativePath !== baseAsset.relativePath);
  const coordinates = getGridCoordinates(layerCandidates.length || 1);
  const dropZones = [];
  const imageSequence = [
    {
      order: Number(baseAsset.stepOrder || 1),
      label: `Step ${Number(baseAsset.stepOrder || 1)}: ${baseAsset.label || 'Base'}`,
      image: baseImagePath,
      isBase: true
    }
  ];

  for (let index = 0; index < layerCandidates.length; index += 1) {
    const layerAsset = layerCandidates[index];
    const copiedLayerPath = await copyAssetToUploads(`${activityFolderName}/${layerAsset.relativePath}`);
    if (!copiedLayerPath) continue;

    const stepPrefix = Number.isFinite(Number(layerAsset.stepOrder))
      ? `Step ${Number(layerAsset.stepOrder)}`
      : `Step ${index + 2}`;
    const label = `${stepPrefix}: ${layerAsset.label || 'Layer'}`;
    const coordinate = coordinates[index] || { x: 50, y: 50 };

    dropZones.push({
      id: index + 1,
      x: coordinate.x,
      y: coordinate.y,
      label,
      smallImage: copiedLayerPath,
      layerImage: copiedLayerPath,
      layerOrder: layerAsset.layerOrder,
      interactionMode: inferInteractionModeFromLabel(label),
      requiredTool: inferRequiredToolForStep(label, label)
    });

    imageSequence.push({
      order: layerAsset.layerOrder,
      label,
      image: copiedLayerPath,
      isBase: false
    });
  }

  const perspectiveId = 1;
  const perspectiveName = 'Computer Case - External View';
  const instructionSource = activity.instructionLines?.length > 0
    ? activity.instructionLines
    : activity.steps;
  const flowSteps = buildFlowStepsFromImageOrder(instructionSource, dropZones, perspectiveId);

  const mainAreas = [
    {
      id: perspectiveId,
      name: perspectiveName,
      backgroundImage: baseImagePath,
      dropZones
    }
  ];

  return {
    instructionText: buildInstructionText(instructionSource),
    skillType: activity.skillType,
    flowSteps,
    mainAreas,
    backgroundImage: baseImagePath,
    dropZones,
    imageSequence,
    activityFolder: activityFolderName
  };
};

const run = async () => {
  console.log('\n=== Seeding Simulation Activities from DOCX and Simulation folder ===\n');

  try {
    await ensureDirectory(UPLOAD_ROOT);
    await ensureZoneDataColumn();
    const simulationColumns = await getSimulationColumnSet();
    const activityFolders = await listAvailableActivityFolders();
    const strictActivityFolders = getStrictActivityFolders(activityFolders);

    if (strictActivityFolders.length === 0) {
      throw new Error(`No Activity folders were found in ${SIMULATION_ROOT}`);
    }

    console.log(`Detected ${activityFolders.length} activity image folders.`);
    console.log(
      `Strict mapping enabled: using only Activity ${STRICT_ACTIVITY_FOLDER_MIN} to Activity ${STRICT_ACTIVITY_FOLDER_MAX}.`
    );

    const activities = await parseActivitiesFromDocx();
    if (activities.length === 0) {
      throw new Error(`No simulation activities were parsed from ${DOCX_INSTRUCTIONS_PATH}`);
    }

    console.log(`Parsed ${activities.length} activities from DOCX.`);

    let updatedCount = 0;
    let skippedCount = 0;
    const seededActivityIdentities = new Set();

    const activityByFolderHint = new Map();
    activities.forEach((activity) => {
      const hint = String(activity.activityFolderHint || '').toLowerCase().trim();
      if (!hint || activityByFolderHint.has(hint)) return;
      activityByFolderHint.set(hint, activity);
    });

    for (const folderName of strictActivityFolders) {
      const key = String(folderName || '').toLowerCase().trim();
      const activity = activityByFolderHint.get(key);

      if (!activity) {
        skippedCount += 1;
        console.warn(`SKIPPED: ${folderName} has no matching DOCX activity in strict 1-to-1 mode.`);
        continue;
      }

      const matchedFolder = resolveActivityFolderName(activity, strictActivityFolders);
      if (!matchedFolder) {
        skippedCount += 1;
        console.warn(
          `SKIPPED: Module ${activity.moduleId} | Order ${activity.simulationOrder} | ${activity.title} (no matching Activity folder)`
        );
        continue;
      }

      const zoneData = await buildZoneDataForActivity(activity, strictActivityFolders);
      const resolvedOrder = await resolveSimulationOrder(activity, simulationColumns);
      const result = await upsertSimulation(activity, zoneData, simulationColumns, resolvedOrder);
      updatedCount += 1;
      seededActivityIdentities.add(getActivityIdentity(activity));

      console.log(
        `${result.mode.toUpperCase()}: Module ${activity.moduleId} | Order ${resolvedOrder} | ${activity.title} | ${zoneData.activityFolder}`
      );
    }

    activities.forEach((activity) => {
      const identity = getActivityIdentity(activity);
      if (seededActivityIdentities.has(identity)) return;

      skippedCount += 1;
      console.warn(
        `SKIPPED: Module ${activity.moduleId} | Order ${activity.simulationOrder} | ${activity.title} `
        + '(not part of strict Activity 1-9 mapping)'
      );
    });

    console.log(`\nSimulation activity seeding complete. Updated: ${updatedCount}, Skipped: ${skippedCount}.\n`);
  } catch (error) {
    console.error('Failed to seed simulation activities:', error.message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
};

run();