const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const cheerio = require('cheerio');
const { query, closePool } = require('./config/database');

const LESSON_DOCX_PATH = path.join(__dirname, '..', 'lessons', 'Lessons_7.docx');
const ASSESSMENT_DOCX_PATH = path.join(__dirname, '..', 'lessons', 'Assessments_lesson_7.docx');
const TARGET_LESSON_ORDER = 7;
const LESSON_UPLOADS_DIR = path.join(__dirname, 'uploads', 'lessons');

let docxImageFileCounter = 0;
const inlineImageUrlCache = new Map();

const LESSON_STAGE_DEFAULTS = [
  { id: 'diagnostic', type: 'diagnostic', label: 'Diagnostic' },
  { id: 'lesson', type: 'lesson', label: 'Lesson' },
  { id: 'final', type: 'final', label: 'Final Assessment' },
];

const REVIEW_ANSWER_KEY = {
  1: 1,
  2: 1,
  3: 2,
  4: 2,
  5: 3,
  6: 2,
  7: 2,
  8: 3,
  9: 2,
  10: 2,
  11: 2,
  12: 2,
  13: 1,
  14: 2,
  15: 2,
  16: 3,
  17: 2,
  18: 2,
  19: 1,
  20: 1,
};

const FINAL_ANSWER_KEY = {
  1: 2,
  2: 1,
  3: 2,
  4: 2,
  5: 2,
  6: 2,
  7: 2,
  8: 1,
  9: 1,
  10: 2,
  11: 1,
  12: 2,
  13: 2,
  14: 1,
  15: 2,
};

const SKILL_MAP = {
  memorization: 'Memorization',
  'technical comprehension': 'Technical Comprehension',
  'analytical thinking': 'Analytical Thinking',
  'critical thinking': 'Critical Thinking',
  'problem solving': 'Problem Solving',
  'pag-memorize': 'Memorization',
  'teknikal na pag-unawa': 'Technical Comprehension',
  'analitikal na pag-iisip': 'Analytical Thinking',
  'kritikal na pag-iisip': 'Critical Thinking',
  'paglutas ng suliranin': 'Problem Solving',
};

const normalizeWhitespace = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const escapeHtml = (value = '') =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatPlainTextWithCitations = (value = '') => {
  const normalized = normalizeWhitespace(value)
    .replace(/([\s>.;:,!?])(\d+\]\[\d+\])/g, '$1[$2')
    .replace(/([\s>.;:,!?])(\d+\])(?=[\s<.;:,!?]|$)/g, '$1[$2');

  const escaped = escapeHtml(normalized);
  return escaped.replace(/(\[(?:\d+\])(?:\[\d+\])*)/g, '<sup>$1</sup>');
};

const ensureLessonUploadsDirectory = () => {
  if (!fs.existsSync(LESSON_UPLOADS_DIR)) {
    fs.mkdirSync(LESSON_UPLOADS_DIR, { recursive: true });
  }
};

const imageExtensionFromMime = (mimeType = '') => {
  const normalizedMime = String(mimeType || '').toLowerCase().split(';')[0].trim();

  if (normalizedMime === 'image/jpeg' || normalizedMime === 'image/jpg') return 'jpg';
  if (normalizedMime === 'image/png') return 'png';
  if (normalizedMime === 'image/gif') return 'gif';
  if (normalizedMime === 'image/webp') return 'webp';
  if (normalizedMime === 'image/svg+xml') return 'svg';
  if (normalizedMime === 'image/bmp') return 'bmp';
  if (normalizedMime === 'image/x-icon' || normalizedMime === 'image/vnd.microsoft.icon') return 'ico';

  return 'png';
};

const saveDataImageToLessonUploads = (dataUri = '') => {
  const value = String(dataUri || '').trim();
  const match = value.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return '';

  try {
    ensureLessonUploadsDirectory();

    const mimeType = match[1];
    const base64Payload = match[2].replace(/\s+/g, '');
    const extension = imageExtensionFromMime(mimeType);

    docxImageFileCounter += 1;
    const fileName = `docx-lesson-${TARGET_LESSON_ORDER}-${Date.now()}-${docxImageFileCounter}.${extension}`;
    const filePath = path.join(LESSON_UPLOADS_DIR, fileName);

    fs.writeFileSync(filePath, Buffer.from(base64Payload, 'base64'));
    return `/uploads/lessons/${fileName}`;
  } catch (error) {
    console.warn('Unable to save DOCX inline image:', error.message);
    return '';
  }
};

const normalizeImportedImageUrl = (rawSrc = '') => {
  const src = String(rawSrc || '').trim();
  if (!src) return '';

  if (/^data:image/i.test(src)) {
    if (inlineImageUrlCache.has(src)) {
      return inlineImageUrlCache.get(src);
    }

    const storedImageUrl = saveDataImageToLessonUploads(src) || '';
    if (storedImageUrl) {
      inlineImageUrlCache.set(src, storedImageUrl);
    }
    return storedImageUrl;
  }

  if (src.startsWith('uploads/')) {
    return `/${src}`;
  }

  return src;
};

const inferImageLayoutFromCount = (count = 0) => {
  if (count <= 1) return 'single';
  if (count === 2) return 'side-by-side';
  if (count === 3) return 'grid-3';
  if (count === 5) return 'mosaic';
  return 'grid-2x2';
};

const normalizeForAnswerMatch = (value = '') =>
  normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const inferCorrectAnswerIndex = ({ referenceText = '', options = [] }) => {
  const reference = normalizeForAnswerMatch(referenceText);
  const referenceTokens = new Set(
    reference
      .split(' ')
      .filter((token) => token.length > 2)
  );

  let bestIndex = 0;
  let bestScore = -Infinity;

  options.forEach((option, index) => {
    const normalizedOption = normalizeForAnswerMatch(option);
    if (!normalizedOption) {
      if (bestScore < -10) {
        bestIndex = index;
        bestScore = -10;
      }
      return;
    }

    const optionTokens = normalizedOption.split(' ').filter((token) => token.length > 2);
    let score = 0;

    if (reference.includes(normalizedOption) || normalizedOption.includes(reference)) {
      score += 8;
    }

    optionTokens.forEach((token) => {
      if (referenceTokens.has(token) || reference.includes(token)) {
        score += 1;
      }
    });

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
};

const appendInlineStyle = ($fragment, element, cssRule) => {
  const $element = $fragment(element);
  const existingStyle = String($element.attr('style') || '').trim().replace(/;+\s*$/, '');
  $element.attr('style', existingStyle ? `${existingStyle}; ${cssRule}` : cssRule);
};

const isHeadingOnlyListItem = ($fragment, listItem) => {
  const $item = $fragment(listItem);
  const firstStrong = $item.find('strong').first();
  if (!firstStrong.length) return false;

  // Ignore list items that already own nested lists.
  if ($item.children('ul,ol').length > 0) return false;

  const strongText = normalizeWhitespace(firstStrong.text());
  if (!strongText) return false;

  const textWithoutNested = (() => {
    const clone = $item.clone();
    clone.find('ul,ol').remove();
    return normalizeWhitespace(clone.text());
  })();

  if (textWithoutNested !== strongText) return false;
  if (strongText.length > 120) return false;

  return true;
};

const isDashStyleListItem = ($fragment, listItem) => {
  const $item = $fragment(listItem);
  const ownClone = $item.clone();
  ownClone.children('ul,ol').remove();

  const ownText = normalizeWhitespace(ownClone.text());
  if (!ownText) return false;

  if (/^(?:-|\u2013|\u2014)\s+/.test(ownText)) {
    return true;
  }

  const ownHtml = String(ownClone.html() || '').trim();
  if (/^<strong[^>]*>.*?<\/strong>\s*(?:-|\u2013|\u2014)\s+/i.test(ownHtml)) {
    return true;
  }

  return false;
};

const normalizeHeadingBulletGroups = ($fragment) => {
  $fragment('ul,ol').each((_, listElement) => {
    const $list = $fragment(listElement);
    let $current = $list.children('li').first();

    while ($current.length) {
      if (!isHeadingOnlyListItem($fragment, $current)) {
        $current = $current.next('li');
        continue;
      }

      const groupedItems = [];
      let $scan = $current.next('li');

      while ($scan.length) {
        if (isHeadingOnlyListItem($fragment, $scan)) {
          break;
        }

        groupedItems.push($scan);
        $scan = $scan.next('li');
      }

      if (groupedItems.length > 0) {
        const $nested = $fragment('<ul data-indent-group="true"></ul>');
        appendInlineStyle($fragment, $nested, 'padding-left: 1.25rem; margin: 0.25rem 0 0.2rem;');

        groupedItems.forEach(($item) => {
          appendInlineStyle($fragment, $item, 'list-style-type: none; margin: 0.2rem 0;');
          $nested.append($item);
        });

        $current.append($nested);
      }

      $current = $scan;
    }
  });
};

const setListStyles = ($fragment) => {
  $fragment('ol').each((_, element) => {
    if ($fragment(element).attr('data-indent-group') === 'true') {
      const existingStyle = String($fragment(element).attr('style') || '');
      const styleWithoutListType = existingStyle
        .replace(/list-style-type\s*:\s*[^;]+;?/gi, '')
        .trim();
      const stylePrefix = styleWithoutListType ? `${styleWithoutListType.replace(/;?$/, ';')} ` : '';
      $fragment(element).attr('style', `${stylePrefix}list-style-type: none;`);
      return;
    }

    const depth = $fragment(element).parents('ol').length + 1;
    const listStyleType = depth === 1 ? 'decimal' : depth === 2 ? 'lower-alpha' : 'lower-roman';
    const existingStyle = String($fragment(element).attr('style') || '');
    const styleWithoutListType = existingStyle
      .replace(/list-style-type\s*:\s*[^;]+;?/gi, '')
      .trim();
    const stylePrefix = styleWithoutListType ? `${styleWithoutListType.replace(/;?$/, ';')} ` : '';
    $fragment(element).attr('style', `${stylePrefix}list-style-type: ${listStyleType};`);
  });

  $fragment('ul').each((_, element) => {
    if ($fragment(element).attr('data-indent-group') === 'true') {
      const existingStyle = String($fragment(element).attr('style') || '');
      const styleWithoutListType = existingStyle
        .replace(/list-style-type\s*:\s*[^;]+;?/gi, '')
        .trim();
      const stylePrefix = styleWithoutListType ? `${styleWithoutListType.replace(/;?$/, ';')} ` : '';
      $fragment(element).attr('style', `${stylePrefix}list-style-type: none;`);
      return;
    }

    const directItems = $fragment(element).children('li').toArray();
    if (directItems.length > 0) {
      const dashStyleCount = directItems.filter((item) => isDashStyleListItem($fragment, item)).length;
      if (dashStyleCount > 0 && dashStyleCount === directItems.length) {
        const existingStyle = String($fragment(element).attr('style') || '');
        const styleWithoutListType = existingStyle
          .replace(/list-style-type\s*:\s*[^;]+;?/gi, '')
          .trim();
        const stylePrefix = styleWithoutListType ? `${styleWithoutListType.replace(/;?$/, ';')} ` : '';
        $fragment(element).attr('style', `${stylePrefix}list-style-type: none;`);
        directItems.forEach((item) => {
          const existingItemStyle = String($fragment(item).attr('style') || '');
          const itemStyleWithoutRules = existingItemStyle
            .replace(/list-style-type\s*:\s*[^;]+;?/gi, '')
            .replace(/margin\s*:\s*0\.2rem\s+0;?/gi, '')
            .trim();
          const itemStylePrefix = itemStyleWithoutRules ? `${itemStyleWithoutRules.replace(/;?$/, ';')} ` : '';
          $fragment(item).attr('style', `${itemStylePrefix}list-style-type: none; margin: 0.2rem 0;`);
        });
        return;
      }
    }

    const depth = $fragment(element).parents('ul').length + 1;
    const listStyleType = depth === 1 ? 'disc' : depth === 2 ? 'circle' : 'square';
    const existingStyle = String($fragment(element).attr('style') || '');
    const styleWithoutListType = existingStyle
      .replace(/list-style-type\s*:\s*[^;]+;?/gi, '')
      .trim();
    const stylePrefix = styleWithoutListType ? `${styleWithoutListType.replace(/;?$/, ';')} ` : '';
    $fragment(element).attr('style', `${stylePrefix}list-style-type: ${listStyleType};`);
  });
};

const MEDIA_ELEMENT_SELECTOR = 'img,figure,svg,video,audio,iframe,object,embed,canvas';

const stripMediaElements = ($fragment, { preserveMedia = false } = {}) => {
  if (!preserveMedia) {
    $fragment(MEDIA_ELEMENT_SELECTOR).remove();
  }

  $fragment('*').each((_, element) => {
    const attrs = Object.keys(element.attribs || {});

    attrs.forEach((attrName) => {
      const attrValue = String($fragment(element).attr(attrName) || '');
      if (/^on/i.test(attrName)) {
        $fragment(element).removeAttr(attrName);
        return;
      }

      if (!preserveMedia && /data:image/i.test(attrValue)) {
        $fragment(element).removeAttr(attrName);
      }
    });
  });
};

const normalizeRichHtml = (rawHtml = '', { preserveMedia = false } = {}) => {
  const html = String(rawHtml || '').trim();
  if (!html) return '';

  const $fragment = cheerio.load(`<div id="root">${html}</div>`);
  stripMediaElements($fragment, { preserveMedia });
  normalizeHeadingBulletGroups($fragment);
  setListStyles($fragment);

  let cleanedHtml = ($fragment('#root').html() || '').trim();

  // Fix malformed citation fragments like "1][2]" -> "[1][2]".
  cleanedHtml = cleanedHtml.replace(/([\s>.;:,!?])(\d+\]\[\d+\])/g, '$1[$2');

  // Wrap plain bracket citations in superscript when they are not already wrapped.
  cleanedHtml = cleanedHtml.replace(/(^|[^>])\[((?:\d+\](?:\[\d+\])*))\](?!<\/sup>)/g, '$1<sup>[$2]</sup>');

  // Remove any remaining malformed orphan citation tokens.
  cleanedHtml = cleanedHtml.replace(/([\s>.;:,!?])\d+\]\[\d+\](?=[\s<.;:,!?]|$)/g, '$1');

  return cleanedHtml;
};

const hasMeaningfulText = (rawHtml = '', { includeMedia = false } = {}) => {
  const $fragment = cheerio.load(`<div id="root">${String(rawHtml || '')}</div>`);
  const textContent = normalizeWhitespace($fragment('#root').text());
  if (textContent.length > 0) {
    return true;
  }

  if (!includeMedia) {
    return false;
  }

  return $fragment(`#root ${MEDIA_ELEMENT_SELECTOR}`).length > 0;
};

const htmlToText = (rawHtml = '') => {
  const $fragment = cheerio.load(`<div id="root">${String(rawHtml || '')}</div>`);
  return normalizeWhitespace($fragment('#root').text());
};

const shouldTreatFirstTableRowAsHeader = (rows = []) => {
  if (!rows.length) return false;

  const firstRowText = rows[0].map((cell) => htmlToText(cell));

  if (firstRowText.some((cell) => /:$/.test(cell))) {
    return true;
  }

  if (rows.length === 2) {
    const secondRowText = rows[1].map((cell) => htmlToText(cell));
    const firstAvg = firstRowText.reduce((sum, cell) => sum + cell.length, 0) / Math.max(firstRowText.length, 1);
    const secondAvg = secondRowText.reduce((sum, cell) => sum + cell.length, 0) / Math.max(secondRowText.length, 1);
    return secondAvg > firstAvg * 1.35;
  }

  return false;
};

const parseTableData = (dom, tableNode) => {
  const rowNodes = dom(tableNode).find('tr').toArray();
  if (rowNodes.length === 0) {
    return null;
  }

  const rows = rowNodes
    .map((rowNode) =>
      dom(rowNode)
        .children('th,td')
        .toArray()
        .map((cellNode) => normalizeRichHtml(dom(cellNode).html() || ''))
    )
    .filter((row) => row.length > 0);

  if (rows.length < 2) {
    return null;
  }

  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (columnCount === 0) {
    return null;
  }

  const paddedRows = rows.map((row) => {
    const padded = [...row];
    while (padded.length < columnCount) {
      padded.push('');
    }
    return padded.slice(0, columnCount);
  });

  const hasThHeader = dom(tableNode).find('thead th').length > 0 || dom(tableNode).find('tr').first().children('th').length > 0;
  const useFirstRowAsHeader = hasThHeader || shouldTreatFirstTableRowAsHeader(paddedRows);

  const headers = useFirstRowAsHeader
    ? paddedRows[0].map((header) => header || '')
    : Array.from({ length: columnCount }, (_, idx) => `Column ${idx + 1}`);

  const bodyRows = (useFirstRowAsHeader ? paddedRows.slice(1) : paddedRows).map((row) => {
    const normalized = [...row];
    while (normalized.length < headers.length) {
      normalized.push('');
    }
    return normalized.slice(0, headers.length);
  });

  if (bodyRows.length === 0) {
    return null;
  }

  return {
    headers,
    rows: bodyRows,
  };
};

const parseReferencesFromNodes = (dom, nodes = []) => {
  const links = [];

  nodes.forEach((node) => {
    dom(node)
      .find('a[href]')
      .each((_, anchor) => {
        const href = normalizeWhitespace(dom(anchor).attr('href') || '');
        if (/^https?:\/\//i.test(href) && !links.includes(href)) {
          links.push(href);
        }
      });
  });

  if (links.length) {
    return links.join('\n');
  }

  const textBlob = nodes
    .map((node) => normalizeWhitespace(dom(node).text()))
    .filter(Boolean)
    .join(' ');

  const textLinks = [...textBlob.matchAll(/https?:\/\/[^\s)]+/gi)].map((match) => normalizeWhitespace(match[0]));
  const uniqueTextLinks = [...new Set(textLinks)];
  return uniqueTextLinks.join('\n');
};

const URL_TEXT_REGEX = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;
const VIDEO_HOST_HINTS = ['youtube.com', 'youtu.be', 'vimeo.com', 'dailymotion.com', 'loom.com', 'wistia.com'];

const normalizeUrlForParsing = (rawValue = '') => {
  const trimmed = String(rawValue || '').trim().replace(/[),.;]+$/, '');
  if (!trimmed) return null;

  try {
    return new URL(trimmed).toString();
  } catch {
    try {
      return new URL(`https://${trimmed}`).toString();
    } catch {
      return null;
    }
  }
};

const isLikelyVideoUrl = (rawUrl = '') => {
  const value = String(rawUrl || '').trim();
  if (!value) return false;

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    if (VIDEO_HOST_HINTS.some((hint) => host.includes(hint))) return true;
    if (pathname.includes('/embed/') || pathname.includes('/shorts/')) return true;

    return /\.(mp4|webm|ogg|mov|m4v|m3u8)(\?|#|$)/i.test(value);
  } catch {
    const lowered = value.toLowerCase();
    if (lowered.includes('youtube') || lowered.includes('vimeo') || lowered.includes('/embed/')) {
      return true;
    }

    return /\.(mp4|webm|ogg|mov|m4v|m3u8)(\?|#|$)/i.test(lowered);
  }
};

const extractVideoUrlsFromText = (rawText = '') => {
  const source = String(rawText || '');
  if (!source) return [];

  const matcher = new RegExp(URL_TEXT_REGEX.source, 'gi');
  const seen = new Set();
  const videoUrls = [];

  for (const match of source.matchAll(matcher)) {
    const normalizedUrl = normalizeUrlForParsing(match[0]);
    if (!normalizedUrl || !isLikelyVideoUrl(normalizedUrl)) continue;

    const dedupeKey = normalizedUrl.toLowerCase();
    if (seen.has(dedupeKey)) continue;

    seen.add(dedupeKey);
    videoUrls.push(normalizedUrl);
  }

  return videoUrls;
};

const stripUrlsFromText = (rawText = '') => {
  const source = String(rawText || '');
  if (!source) return '';

  const matcher = new RegExp(URL_TEXT_REGEX.source, 'gi');
  return normalizeWhitespace(source.replace(matcher, ' '));
};

const splitHeadingAndVideoUrls = (rawText = '') => ({
  heading: stripUrlsFromText(rawText),
  videoUrls: extractVideoUrlsFromText(rawText),
});

const isAssessmentContent = (text = '') => /^(?:Quick\s+Assessment|Final\s+Assessment|Review\s+Assessments|Note\s*:\s*Highlight)/i.test(text);

const shouldUseSubtopicType = (headingText = '') => {
  const text = normalizeWhitespace(headingText);
  const textWithoutUrls = stripUrlsFromText(text);
  const candidateText = textWithoutUrls || text;

  if (!candidateText) return false;
  if (/^https?:\/\//i.test(candidateText)) return false;
  if (isAssessmentContent(candidateText)) return false;
  if (/^(?:Topic|Paksa)\s+\d+\s*:/i.test(candidateText)) return false;
  if (/^[a-z]\s*[.)]/i.test(candidateText)) return false;

  const words = candidateText.split(' ').filter(Boolean);
  if (words.length > 12) return false;
  if (candidateText.length > 95) return false;
  if (/[.!?]$/.test(candidateText)) return false;

  return true;
};

const stripChoicePrefix = (value = '') => String(value || '').replace(/^(?:[a-d]|[1-4])\s*[.):-]\s*/i, '').trim();

const parseChoiceOptionsFromLines = (choiceLines = []) => {
  const normalizedLines = choiceLines.map((line) => normalizeWhitespace(line)).filter(Boolean);
  if (!normalizedLines.length) return [];

  const mergedLines = [];
  for (let i = 0; i < normalizedLines.length; i += 1) {
    const line = normalizedLines[i];
    if (/^(?:[a-d]|[1-4])\s*[.):-]?\s*$/i.test(line) && normalizedLines[i + 1]) {
      mergedLines.push(`${line} ${normalizedLines[i + 1]}`);
      i += 1;
      continue;
    }

    mergedLines.push(line);
  }

  const flattened = normalizeWhitespace(mergedLines.join(' '))
    .replace(/([^\s])([A-Da-d][).:-]\s*)/g, '$1 $2')
    .replace(/([^\s])([1-4][).:-]\s*)/g, '$1 $2');
  const markerRegex = /(?:^|\s)([a-d]|[1-4])\s*[.):-]\s*/gi;
  const markerMatches = [...flattened.matchAll(markerRegex)];

  if (markerMatches.length >= 2) {
    const parsed = [];
    markerMatches.forEach((match, index) => {
      const start = (match.index || 0) + match[0].length;
      const end = index + 1 < markerMatches.length
        ? (markerMatches[index + 1].index || flattened.length)
        : flattened.length;
      const choice = normalizeWhitespace(flattened.slice(start, end));
      if (choice) {
        parsed.push(choice);
      }
    });

    if (parsed.length > 0) {
      return parsed.slice(0, 4);
    }
  }

  return mergedLines
    .map((line) => stripChoicePrefix(line))
    .filter(Boolean)
    .slice(0, 4);
};

const normalizeChoiceComparisonValue = (value = '') =>
  normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isNonChoiceStrongText = (value = '') => {
  const text = normalizeWhitespace(value);
  if (!text) return true;

  return /^(?:Choices|Mga\s+Pagpipilian|Item|Bilang|Aytem|Skill|Kasanayan|EASY|MADALI|SITUATIONAL|SITWASYONAL|SITUWASYONAL|Statement|Pahayag|Question|Tanong)\b/i.test(text)
    || /^(?:Item\s*#?\s*:?|Bilang|Aytem\s*#?\s*:?)\s*\d+/i.test(text);
};

const extractChoiceLinesFromHtmlSegment = (htmlSegment = '') => {
  const textWithLineBreaks = String(htmlSegment || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]+>/g, ' ');

  return textWithLineBreaks
    .split('\n')
    .map((line, index) => {
      const normalizedLine = normalizeWhitespace(line);
      if (!normalizedLine) return '';
      if (index === 0) {
        return normalizedLine.replace(/^(?:Choices|Mga\s+Pagpipilian)\s*:?\s*/i, '');
      }
      return normalizedLine;
    })
    .filter(Boolean);
};

const findOptionIndexFromStrongTexts = (options = [], strongTexts = []) => {
  const normalizedOptions = options.map((option) => normalizeChoiceComparisonValue(option));

  for (const strongText of strongTexts) {
    const candidate = normalizeChoiceComparisonValue(strongText);
    if (!candidate) continue;

    const exactIndex = normalizedOptions.findIndex((option) => option === candidate);
    if (exactIndex >= 0) {
      return exactIndex;
    }

    const partialIndex = normalizedOptions.findIndex(
      (option) => option.includes(candidate) || candidate.includes(option)
    );
    if (partialIndex >= 0) {
      return partialIndex;
    }
  }

  return -1;
};

const extractBoldAnswerMapFromSectionNodes = (assessmentDom, sectionNodes = []) => {
  const itemRegex = /(?:Item\s*#?\s*:?|Bilang|Aytem\s*#?\s*:?)\s*(\d+)/i;
  const stopRegex = /^(?:Statement|Pahayag|Item\s*#|Bilang\s+\d+|Aytem\s*#?\s*:?\s*\d+|Final\s+Assessment|Panghuling\s+Pagtatasa|Review\s+Assessments|Mga\s+Pagtatasa\s+sa\s+Pagsusuri)/i;
  const map = {};

  const getNodeText = (node) => normalizeWhitespace(assessmentDom(node).text());

  for (let i = 0; i < sectionNodes.length; i += 1) {
    const itemMatch = getNodeText(sectionNodes[i]).match(itemRegex);
    if (!itemMatch) continue;

    const itemNumber = Number(itemMatch[1]);
    if (!Number.isInteger(itemNumber)) continue;

    let choicesStartIndex = -1;
    for (let j = i; j < sectionNodes.length; j += 1) {
      const text = getNodeText(sectionNodes[j]);
      if (j > i && itemRegex.test(text)) {
        break;
      }
      if (/(?:Choices|Mga\s+Pagpipilian)\s*:?/i.test(text)) {
        choicesStartIndex = j;
        break;
      }
    }

    if (choicesStartIndex < 0) continue;

    const choiceNodes = [];
    for (let j = choicesStartIndex; j < sectionNodes.length; j += 1) {
      const text = getNodeText(sectionNodes[j]);
      if (j > choicesStartIndex && stopRegex.test(text)) {
        break;
      }
      choiceNodes.push(sectionNodes[j]);
    }

    if (!choiceNodes.length) continue;

    const choiceHtml = choiceNodes.map((node) => assessmentDom.html(node) || '').join('\n');
    const choiceLines = extractChoiceLinesFromHtmlSegment(choiceHtml);
    const options = parseChoiceOptionsFromLines(choiceLines);
    if (options.length < 2) continue;

    const fragmentDom = cheerio.load(`<div>${choiceHtml}</div>`);
    const strongTexts = fragmentDom('strong')
      .toArray()
      .map((element) => normalizeWhitespace(fragmentDom(element).text()))
      .filter((text) => text && !isNonChoiceStrongText(text));

    const matchedIndex = findOptionIndexFromStrongTexts(options, strongTexts);
    if (matchedIndex >= 0) {
      map[itemNumber] = matchedIndex;
    }
  }

  return map;
};

const extractBoldAnswerMapsFromAssessmentHtml = (assessmentHtml = '') => {
  const assessmentDom = cheerio.load(assessmentHtml || '');
  const topNodes = assessmentDom('body').children().toArray();
  const getNodeText = (node) => normalizeWhitespace(assessmentDom(node).text());

  const taglishMarkerIndex = topNodes.findIndex((node) => /^TAGLISH\s+VERSION$/i.test(getNodeText(node)));
  const englishNodes = taglishMarkerIndex >= 0 ? topNodes.slice(0, taglishMarkerIndex) : topNodes;
  const taglishNodes = taglishMarkerIndex >= 0 ? topNodes.slice(taglishMarkerIndex + 1) : [];

  const splitLanguageSections = (languageNodes = [], isTaglish = false) => {
    const reviewRegex = isTaglish
      ? /^(?:Review\s+Assessments|Mga\s+Pagtatasa\s+sa\s+Pagsusuri)/i
      : /^Review\s+Assessments/i;
    const finalRegex = isTaglish
      ? /^(?:Final\s+Assessment|Panghuling\s+Pagtatasa)/i
      : /^Final\s+Assessment/i;

    const reviewStart = languageNodes.findIndex((node) => reviewRegex.test(getNodeText(node)));
    const finalStart = languageNodes.findIndex((node) => finalRegex.test(getNodeText(node)));

    const reviewNodes = reviewStart >= 0 && finalStart > reviewStart
      ? languageNodes.slice(reviewStart + 1, finalStart)
      : [];

    const finalNodes = finalStart >= 0
      ? languageNodes.slice(finalStart + 1)
      : [];

    return { reviewNodes, finalNodes };
  };

  const englishSections = splitLanguageSections(englishNodes, false);
  const taglishSections = splitLanguageSections(taglishNodes, true);

  return {
    english: {
      review: extractBoldAnswerMapFromSectionNodes(assessmentDom, englishSections.reviewNodes),
      final: extractBoldAnswerMapFromSectionNodes(assessmentDom, englishSections.finalNodes),
    },
    taglish: {
      review: extractBoldAnswerMapFromSectionNodes(assessmentDom, taglishSections.reviewNodes),
      final: extractBoldAnswerMapFromSectionNodes(assessmentDom, taglishSections.finalNodes),
    },
  };
};

const splitRawLines = (rawText = '') => String(rawText || '').replace(/\r/g, '').split('\n');

const compactNonEmpty = (lines = []) => lines.map((line) => normalizeWhitespace(line)).filter(Boolean);

const toParagraphHtml = (lines = []) => {
  const cleaned = lines.map((line) => normalizeWhitespace(line)).filter(Boolean);
  if (!cleaned.length) return '';
  return cleaned.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
};

const toTopicKey = (value = '') => {
  const match = String(value || '').match(/(?:Topic|Paksa)\s+(\d+)/i);
  return match ? Number(match[1]) : null;
};

const findLineIndex = (lines = [], matcher) => lines.findIndex((line) => matcher.test(normalizeWhitespace(line)));

const matchSkillFromText = (value = '') => {
  const source = String(value || '').trim().toLowerCase();
  if (!source) return null;

  let best = null;

  Object.entries(SKILL_MAP).forEach(([alias, mappedSkill]) => {
    const idx = source.indexOf(alias);
    if (idx < 0) return;

    if (!best || idx < best.index) {
      best = { index: idx, mappedSkill };
    }
  });

  return best ? best.mappedSkill : null;
};

const normalizeSkill = (rawSkill = '') => {
  const value = String(rawSkill || '').trim();
  if (!value) return 'Memorization';

  const directMatch = matchSkillFromText(value);
  if (directMatch) return directMatch;

  const labelMatch = value.match(/(?:Skill|Kasanayan)\s*(?:\([^)]+\))?\s*:?\s*/i);
  let segment = labelMatch
    ? value.slice((labelMatch.index || 0) + labelMatch[0].length)
    : value;

  const stopMatch = segment.match(/\b(?:Type|Uri|Question|Tanong|Choices|Mga\s+Pagpipilian|Statement|Pahayag|EASY|MADALI|SITUATIONAL|SITWASYONAL|SITUWASYONAL)\b/i);
  if (stopMatch && typeof stopMatch.index === 'number') {
    segment = segment.slice(0, stopMatch.index);
  }

  const segmentMatch = matchSkillFromText(segment);
  if (segmentMatch) return segmentMatch;

  return 'Memorization';
};

const isLikelySubtopic = (line = '') => {
  const text = normalizeWhitespace(line);
  if (!text) return false;
  if (/^https?:\/\//i.test(text)) return false;
  if (/^(?:Topic|Paksa)\s+\d+:/i.test(text)) return false;
  if (/^(?:Quick Assessment|Final Assessment|References|Review Assessments|Mga Paksa|Topics)/i.test(text)) return false;
  if (/^(?:a|b|c|d)\s*[.)]\s+/i.test(text)) return false;
  if (text.length > 110) return false;
  return /:$/.test(text);
};

const parseQuickAssessmentItemMap = (englishAssessmentLines = []) => {
  const start = findLineIndex(englishAssessmentLines, /^(?:QUICK\s+ASSESSMENTS|Review\s+Assessments)/i);
  const end = findLineIndex(englishAssessmentLines, /^Final\s+Assessment/i);

  if (start < 0 || end < 0 || end <= start) {
    return {
      orderedSelectedItems: [],
      topicItemMap: {},
    };
  }

  const lines = englishAssessmentLines.slice(start, end);
  const topicItemMap = {};
  const ordered = [];
  let currentTopic = null;

  lines.forEach((line) => {
    const text = normalizeWhitespace(line);
    if (!text) return;

    const topicMatch = text.match(/Topic\s+(\d+)/i);
    if (topicMatch) {
      currentTopic = Number(topicMatch[1]);
      if (!topicItemMap[currentTopic]) topicItemMap[currentTopic] = [];
    }

    const itemMatches = [...text.matchAll(/Item\s*#\s*(\d+)/gi)].map((m) => Number(m[1]));
    if (!itemMatches.length) return;

    itemMatches.forEach((num) => {
      if (!ordered.includes(num)) ordered.push(num);
      if (currentTopic) {
        if (!topicItemMap[currentTopic]) topicItemMap[currentTopic] = [];
        if (!topicItemMap[currentTopic].includes(num)) {
          topicItemMap[currentTopic].push(num);
        }
      }
    });
  });

  return {
    orderedSelectedItems: ordered,
    topicItemMap,
  };
};

const buildFallbackTopicItemMap = ({ topicNumbers = [], reviewItemNumbers = [] }) => {
  const topicList = topicNumbers.filter((num) => Number.isInteger(num));
  const itemList = reviewItemNumbers.filter((num) => Number.isInteger(num));

  if (!topicList.length || !itemList.length) {
    return {};
  }

  const map = {};
  const chunkSize = Math.ceil(itemList.length / topicList.length);

  topicList.forEach((topicNumber, index) => {
    const start = index * chunkSize;
    const end = start + chunkSize;
    map[topicNumber] = itemList.slice(start, end);
  });

  return map;
};

const normalizeAssessmentQuestionType = (rawType = '', fallback = 'Easy') => {
  const text = normalizeWhitespace(rawType).toLowerCase();
  if (!text) return fallback;

  if (/situational|sitwasyonal|situwasyonal/.test(text)) return 'Situational';
  if (/easy|madali/.test(text)) return 'Easy';

  return fallback;
};

const normalizeQuestionMatchKey = (value = '') =>
  normalizeWhitespace(
    String(value || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  );

const cleanAssessmentQuestionText = (value = '') => {
  let text = normalizeWhitespace(value)
    .replace(/^(?:\d+\s*[.)-]\s*)/, '')
    .replace(/^(?:Item\s*#?\s*:?\s*\d+|Bilang\s+\d+|Aytem\s*#?\s*:?\s*\d+)\s*/i, '')
    .replace(/^(?:Question|Tanong)\s*:\s*/i, '')
    .replace(/^(?:Quick\s+Assessment|Final\s+Assessment|Review\s+Assessments|Mga\s+Pagtatasa\s+sa\s+Pagsusuri|Panghuling\s+Pagtatasa)[^:]*:\s*/i, '')
    .trim();

  text = text.replace(/^(?:Choices|Mga\s+Pagpipilian)\s*:\s*/i, '').trim();
  return text;
};

const looksLikeQuestionText = (value = '') => {
  const text = cleanAssessmentQuestionText(value);
  if (!text || text.length < 8) return false;
  if (/^(?:Quick\s+Assessment|Final\s+Assessment|Review\s+Assessments|Mga\s+Pagtatasa\s+sa\s+Pagsusuri|Panghuling\s+Pagtatasa)/i.test(text)) return false;
  if (/^(?:Choices|Mga\s+Pagpipilian)\s*:/i.test(text)) return false;
  if (/^(?:[a-d]|[1-4])\s*[.)-:]/i.test(text)) return false;

  return /\?/.test(text)
    || /^(?:what|which|why|how|when|where|who|ano|alin|bakit|paano|kailan|saan|sino)\b/i.test(text);
};

const extractLessonQuickAssessmentQuestionsFromNode = (dom, node) => {
  const nodeHtml = String(dom.html(node) || '');
  if (!nodeHtml) return [];

  const fragment = cheerio.load(`<div id="root">${nodeHtml}</div>`);
  const seen = new Set();
  const questions = [];

  const pushQuestion = (value = '') => {
    if (!looksLikeQuestionText(value)) return;
    const cleaned = cleanAssessmentQuestionText(value);
    const key = normalizeQuestionMatchKey(cleaned);
    if (!key || seen.has(key)) return;
    seen.add(key);
    questions.push(cleaned);
  };

  fragment('#root li').each((_, li) => {
    pushQuestion(fragment(li).text());
  });

  if (questions.length > 0) {
    return questions;
  }

  const textBlob = normalizeWhitespace(fragment('#root').text() || '')
    .replace(/(?:Quick\s+Assessment|Final\s+Assessment|Review\s+Assessments|Mga\s+Pagtatasa\s+sa\s+Pagsusuri|Panghuling\s+Pagtatasa)[^:]*:/gi, '|');

  textBlob.split('|').forEach((segment) => {
    const parts = String(segment || '').match(/[^?]+\?/g) || [segment];
    parts.forEach((part) => pushQuestion(part));
  });

  return questions;
};

const buildReviewQuestionLookup = (reviewEasyByNumber = new Map()) => {
  const lookup = new Map();

  const register = (questionText, itemNumber) => {
    const key = normalizeQuestionMatchKey(questionText);
    if (!key) return;

    if (!lookup.has(key)) {
      lookup.set(key, []);
    }

    const bucket = lookup.get(key);
    if (!bucket.includes(itemNumber)) {
      bucket.push(itemNumber);
    }
  };

  reviewEasyByNumber.forEach((item, itemNumber) => {
    register(item.easyQuestion, itemNumber);
    register(item.situationalQuestion, itemNumber);
  });

  return lookup;
};

const mapLessonQuestionsToReviewItemNumbers = ({
  lessonQuestionTexts = [],
  reviewEasyByNumber = new Map(),
  reviewQuestionLookup = new Map(),
  usedItemNumbers = new Set(),
}) => {
  const mapped = [];

  lessonQuestionTexts.forEach((questionText) => {
    const key = normalizeQuestionMatchKey(questionText);
    if (!key) return;

    const exactCandidates = reviewQuestionLookup.get(key) || [];
    let matchedItemNumber = exactCandidates.find((itemNumber) => !usedItemNumbers.has(itemNumber));

    if (!Number.isInteger(matchedItemNumber)) {
      reviewEasyByNumber.forEach((item, itemNumber) => {
        if (Number.isInteger(matchedItemNumber) || usedItemNumbers.has(itemNumber)) return;

        const easyKey = normalizeQuestionMatchKey(item.easyQuestion);
        const situationalKey = normalizeQuestionMatchKey(item.situationalQuestion);
        const isCloseMatch =
          (easyKey && (easyKey.includes(key) || key.includes(easyKey)))
          || (situationalKey && (situationalKey.includes(key) || key.includes(situationalKey)));

        if (isCloseMatch) {
          matchedItemNumber = itemNumber;
        }
      });
    }

    if (Number.isInteger(matchedItemNumber) && !usedItemNumbers.has(matchedItemNumber)) {
      usedItemNumbers.add(matchedItemNumber);
      mapped.push(matchedItemNumber);
    }
  });

  return mapped;
};

const parseQuestionItems = ({ lines = [], itemRegex, isTaglish = false, boldAnswerMap = {} }) => {
  const itemStartIndexes = [];
  lines.forEach((line, index) => {
    const text = normalizeWhitespace(line);
    if (itemRegex.test(text)) itemStartIndexes.push(index);
  });

  const items = [];

  itemStartIndexes.forEach((startIndex, idx) => {
    const endIndex = idx + 1 < itemStartIndexes.length ? itemStartIndexes[idx + 1] : lines.length;
    const block = lines.slice(startIndex, endIndex).map((line) => normalizeWhitespace(line)).filter(Boolean);
    if (!block.length) return;

    const itemNumberMatch = block[0].match(/(?:Item\s*#?\s*:?|Bilang|Aytem\s*#?\s*:?)\s*(\d+)/i);
    const itemNumber = itemNumberMatch ? Number(itemNumberMatch[1]) : idx + 1;

    const skillLine =
      block.find((line) => /^(?:Skill|Kasanayan)/i.test(line)) ||
      block.find((line) => /(?:Skill|Kasanayan)\s*\(/i.test(line)) ||
      '';
    const skill = normalizeSkill(skillLine);

    let easyQuestion = '';
    let situationalQuestion = '';
    let statementText = '';
    let sawSituationalMarker = false;

    for (let i = 0; i < block.length; i += 1) {
      const line = block[i];

      if (/SITUATIONAL|SITUWASYONAL/i.test(line)) {
        sawSituationalMarker = true;
        const merged = line
          .replace(/.*?(SITUATIONAL|SITUWASYONAL)\s*/i, '')
          .replace(/^Tanong\s*:\s*/i, '')
          .trim();
        if (merged) {
          situationalQuestion = merged;
        }
        continue;
      }

      const questionMatch = line.match(/(?:Question|Tanong)\s*:\s*(.+)$/i);
      if (questionMatch) {
        if (!sawSituationalMarker && !easyQuestion) {
          easyQuestion = questionMatch[1].trim();
        } else if (sawSituationalMarker && !situationalQuestion) {
          situationalQuestion = questionMatch[1].trim();
        }
        continue;
      }

      const statementMatch = line.match(/(?:Statement|Pahayag)\s*:\s*(.+)$/i);
      if (statementMatch) {
        statementText = statementMatch[1].trim();
        continue;
      }

      const isControlLine = /^(?:Choices|Mga Pagpipilian|Statement|Pahayag|Type|Uri|Skill|Kasanayan|EASY|MADALI|MODERATE|KATAMTAMAN|HARD|MAHIRAP|SITUATIONAL|SITUWASYONAL|SITWASYONAL|Item\s*#|Bilang\s+\d+|Aytem\s*#?\s*:?\s*\d+|Final\s+Assessment|Panghuling\s+Pagtatasa|Review\s+Assessments|Mga\s+Pagtatasa\s+sa\s+Pagsusuri)/i.test(line);
      const isChoiceLine = /^(?:[a-d]|[1-9])\s*[.):-]/i.test(line);

      if (!isControlLine && !isChoiceLine) {
        if (sawSituationalMarker && situationalQuestion) {
          situationalQuestion = normalizeWhitespace(`${situationalQuestion} ${line}`);
          continue;
        }

        if (!sawSituationalMarker && easyQuestion) {
          easyQuestion = normalizeWhitespace(`${easyQuestion} ${line}`);
          continue;
        }
      }

      if (sawSituationalMarker && !situationalQuestion && !/^(?:Choices|Mga Pagpipilian|Statement|Pahayag|Type|Uri|Skill|Kasanayan|EASY|MADALI|MODERATE|KATAMTAMAN|HARD|MAHIRAP)/i.test(line)) {
        situationalQuestion = line;
      }
    }

    const choicesStartIndex = block.findIndex((line) => /^(?:Choices|Mga\s+Pagpipilian)\s*:?/i.test(line));
    const options = [];

    if (choicesStartIndex >= 0) {
      const choiceLines = [];
      for (let i = choicesStartIndex; i < block.length; i += 1) {
        let line = block[i];
        if (!line) continue;
        if (
          i > choicesStartIndex
          && /^(?:Statement|Pahayag|Item\s*#|Bilang\s+\d+|Aytem\s*#?\s*:?\s*\d+|Final\s+Assessment|Panghuling\s+Pagtatasa|Review\s+Assessments|Mga\s+Pagtatasa\s+sa\s+Pagsusuri)/i.test(line)
        ) {
          break;
        }

        if (i === choicesStartIndex) {
          line = line.replace(/^(?:Choices|Mga\s+Pagpipilian)\s*:?\s*/i, '');
        }

        choiceLines.push(line);
      }

      options.push(...parseChoiceOptionsFromLines(choiceLines));
    }

    while (options.length < 4) options.push('');

    const answerReference = [easyQuestion, situationalQuestion, statementText].filter(Boolean).join(' ');
    const mappedBoldAnswer = Number.isInteger(boldAnswerMap[itemNumber])
      ? boldAnswerMap[itemNumber]
      : null;
    const reviewCorrect = Number.isInteger(mappedBoldAnswer)
      ? mappedBoldAnswer
      : inferCorrectAnswerIndex({ referenceText: answerReference, options });
    const finalCorrect = Number.isInteger(mappedBoldAnswer)
      ? mappedBoldAnswer
      : inferCorrectAnswerIndex({ referenceText: answerReference, options });
    const typeLine = block.find((line) => /^(?:Type|Uri)\s*:/i.test(line)) || '';
    const easyQuestionType = normalizeAssessmentQuestionType(typeLine, 'Easy');
    const situationalQuestionType = normalizeAssessmentQuestionType(typeLine, 'Situational');
    const normalizedEasyQuestion = normalizeWhitespace(easyQuestion);
    const normalizedSituationalQuestion = normalizeWhitespace(situationalQuestion);
    const normalizedStatementText = normalizeWhitespace(statementText);
    const fallbackQuestion = normalizedEasyQuestion || normalizedSituationalQuestion || normalizedStatementText;

    items.push({
      itemNumber,
      skill,
      easyQuestion: normalizedEasyQuestion || fallbackQuestion || (isTaglish ? `Tanong ${itemNumber}` : `Question ${itemNumber}`),
      situationalQuestion: normalizedSituationalQuestion
        || normalizedEasyQuestion
        || normalizedStatementText
        || fallbackQuestion
        || (isTaglish ? `Situwasyonal na Tanong ${itemNumber}` : `Situational Question ${itemNumber}`),
      easyQuestionType,
      situationalQuestionType,
      options,
      reviewCorrect,
      finalCorrect,
    });
  });

  return items;
};

const parseAssessmentByLanguage = (rawAssessmentText = '', assessmentHtml = '') => {
  const lines = compactNonEmpty(splitRawLines(rawAssessmentText));
  const taglishIndex = findLineIndex(lines, /^TAGLISH\s+VERSION/i);
  const boldAnswerMaps = extractBoldAnswerMapsFromAssessmentHtml(assessmentHtml);

  const englishLines = taglishIndex >= 0 ? lines.slice(0, taglishIndex) : lines;
  const taglishLines = taglishIndex >= 0 ? lines.slice(taglishIndex + 1) : [];

  const parseLanguageBlock = (languageLines, isTaglish = false, languageBoldMaps = { review: {}, final: {} }) => {
    const reviewStart = findLineIndex(
      languageLines,
      isTaglish ? /^(?:Review\s+Assessments|Mga\s+Pagtatasa\s+sa\s+Pagsusuri)/i : /^Review\s+Assessments/i
    );
    const finalStart = findLineIndex(
      languageLines,
      isTaglish ? /^(?:Final\s+Assessment|Panghuling\s+Pagtatasa)/i : /^Final\s+Assessment/i
    );

    const reviewLines = reviewStart >= 0 && finalStart > reviewStart
      ? languageLines.slice(reviewStart + 1, finalStart)
      : [];

    const finalLines = finalStart >= 0
      ? languageLines.slice(finalStart + 1)
      : [];

    const itemRegex = /^(?:Item\s*#\s*\d+|Bilang\s*\d+)/i;

    const reviewItems = parseQuestionItems({
      lines: reviewLines,
      itemRegex,
      isTaglish,
      boldAnswerMap: languageBoldMaps.review || {},
    });
    const finalItems = parseQuestionItems({
      lines: finalLines,
      itemRegex,
      isTaglish,
      boldAnswerMap: languageBoldMaps.final || {},
    });

    return {
      reviewItems,
      finalItems,
      languageLines,
    };
  };

  const english = parseLanguageBlock(englishLines, false, boldAnswerMaps.english);
  const rawTaglish = parseLanguageBlock(taglishLines, true, boldAnswerMaps.taglish);
  const taglish = {
    ...rawTaglish,
    reviewItems: rawTaglish.reviewItems.length ? rawTaglish.reviewItems : english.reviewItems,
    finalItems: rawTaglish.finalItems.length ? rawTaglish.finalItems : english.finalItems,
  };

  const quickAssessmentMap = parseQuickAssessmentItemMap(englishLines);

  return {
    english,
    taglish,
    quickAssessmentMap,
  };
};

const buildQuestionObject = ({
  questionSeed,
  questionText,
  options,
  correctAnswer,
  skill,
  questionType,
}) => ({
  id: questionSeed(),
  question: String(questionText || ''),
  options: Array.isArray(options) ? options.slice(0, 4) : ['', '', '', ''],
  correctAnswer: Number.isInteger(correctAnswer) ? correctAnswer : 0,
  skill: skill || 'Memorization',
  questionType,
});

const isPlaceholderQuestionText = (questionText = '') => /^(?:Question|Tanong)\s+\d+$/i.test(normalizeWhitespace(questionText));

const assertNoPlaceholderQuestions = ({
  reviewQuestions = [],
  finalQuestions = [],
  diagnosticQuestions = [],
  contextLabel = 'Assessment payload',
}) => {
  const placeholders = [];
  const collect = (questions = [], poolName = 'questions') => {
    questions.forEach((question, index) => {
      const text = String(question?.question || '');
      if (isPlaceholderQuestionText(text)) {
        placeholders.push(`${poolName} #${index + 1} (${normalizeWhitespace(text)})`);
      }
    });
  };

  collect(reviewQuestions, 'review');
  collect(finalQuestions, 'final');
  collect(diagnosticQuestions, 'diagnostic');

  if (placeholders.length > 0) {
    const preview = placeholders.slice(0, 8).join(', ');
    const remaining = placeholders.length - 8;
    throw new Error(
      `${contextLabel} contains placeholder assessment prompts: ${preview}${remaining > 0 ? ` (+${remaining} more)` : ''}`
    );
  }
};

const buildAssessmentPayload = ({
  reviewItems = [],
  finalItems = [],
  selectedReviewItemNumbers = [],
  reviewOrderItemNumbers = [],
  questionSeed,
}) => {
  const reviewByNumber = new Map(reviewItems.map((item) => [item.itemNumber, item]));
  const orderedReviewItemNumbers = [];

  reviewOrderItemNumbers.forEach((num) => {
    if (reviewByNumber.has(num) && !orderedReviewItemNumbers.includes(num)) {
      orderedReviewItemNumbers.push(num);
    }
  });

  reviewItems.forEach((item) => {
    if (!orderedReviewItemNumbers.includes(item.itemNumber)) {
      orderedReviewItemNumbers.push(item.itemNumber);
    }
  });

  const orderedReviewItems = orderedReviewItemNumbers
    .map((itemNumber) => reviewByNumber.get(itemNumber))
    .filter(Boolean);

  const reviewEasyQuestions = orderedReviewItems.map((item) =>
    buildQuestionObject({
      questionSeed,
      questionText: item.easyQuestion,
      options: item.options,
      correctAnswer: item.reviewCorrect,
      skill: item.skill,
      questionType: item.easyQuestionType || 'Easy',
    })
  );

  const finalSituationalQuestions = finalItems.map((item) =>
    buildQuestionObject({
      questionSeed,
      questionText: item.situationalQuestion,
      options: item.options,
      correctAnswer: item.finalCorrect,
      skill: item.skill,
      questionType: item.situationalQuestionType || 'Situational',
    })
  );

  const finalEasyQuestions = finalItems.map((item) =>
    buildQuestionObject({
      questionSeed,
      questionText: item.easyQuestion,
      options: item.options,
      correctAnswer: item.finalCorrect,
      skill: item.skill,
      questionType: item.easyQuestionType || 'Easy',
    })
  );

  const uniqueSelected = [];
  selectedReviewItemNumbers.forEach((num) => {
    if (!uniqueSelected.includes(num)) uniqueSelected.push(num);
  });

  // Required composition target is 15 situational review items.
  const selectedSituationalReview = uniqueSelected
    .map((num) => reviewByNumber.get(num))
    .filter(Boolean)
    .slice(0, 15)
    .map((item) =>
      buildQuestionObject({
        questionSeed,
        questionText: item.situationalQuestion,
        options: item.options,
        correctAnswer: item.reviewCorrect,
        skill: item.skill,
        questionType: item.situationalQuestionType || 'Situational',
      })
    );

  const finalQuestions = [
    ...finalSituationalQuestions.slice(0, 15),
    ...selectedSituationalReview,
    ...finalEasyQuestions.slice(0, 15),
  ];

  const diagnosticTarget = reviewEasyQuestions.length >= 20 ? 10 : 5;
  const diagnosticQuestions = reviewEasyQuestions.slice(0, diagnosticTarget).map((question) => ({
    ...question,
    id: questionSeed(),
  }));

  assertNoPlaceholderQuestions({
    reviewQuestions: reviewEasyQuestions,
    finalQuestions,
    diagnosticQuestions,
    contextLabel: `Lesson ${TARGET_LESSON_ORDER}`,
  });

  return {
    reviewQuestions: reviewEasyQuestions,
    finalQuestions,
    diagnosticQuestions,
  };
};

const parseLessonLanguageBlock = ({
  dom,
  nodes = [],
  isTaglish = false,
  topicItemMap = {},
  reviewEasyByNumber = new Map(),
  questionSeed,
  sectionSeed,
  fallbackReferences = '',
}) => {
  const textForNode = (node) => normalizeWhitespace(dom(node).text());
  const htmlForNode = (node) => String(dom.html(node) || '');
  const hasMediaInHtml = (rawHtml = '') => /<(?:img|figure|svg|video|audio|iframe|object|embed|canvas)\b/i.test(String(rawHtml || ''));

  const titleRegex = isTaglish ? /^Aralin\s*\d+\s*:/i : /^Lesson\s*\d+\s*:/i;
  const titleIndex = nodes.findIndex((node) => titleRegex.test(textForNode(node)));
  const lessonNodes = titleIndex >= 0 ? nodes.slice(titleIndex) : nodes;

  const descriptionLabel = isTaglish ? /^Paglalarawan\s*:/i : /^Description\s*:/i;
  const objectivesLabel = isTaglish ? /^Mga\s+Layunin\s*:/i : /^Objectives\s*:/i;
  const topicsLabel = isTaglish ? /^Mga\s+Paksa\s*:?$/i : /^Topics\s*:?$/i;
  const referencesLabel = isTaglish ? /^(?:Sanggunian|References)\s*:?$/i : /^References\s*:?$/i;
  const finalAssessmentLabel = /^Final\s+Assessment\s*:?/i;

  const titleLine = textForNode(lessonNodes[0] || '');
  const moduleTitle = isTaglish
    ? titleLine.replace(/^Aralin\s*\d+\s*:\s*/i, '').trim() || 'Network'
    : titleLine.replace(/^Lesson\s*\d+\s*:\s*/i, '').trim() || 'Network';

  const descriptionIndex = lessonNodes.findIndex((node) => descriptionLabel.test(textForNode(node)));
  const objectivesIndex = lessonNodes.findIndex((node) => objectivesLabel.test(textForNode(node)));
  const topicsIndex = lessonNodes.findIndex((node) => topicsLabel.test(textForNode(node)));
  const referencesIndex = lessonNodes.findIndex((node) => referencesLabel.test(textForNode(node)));
  const finalAssessmentIndex = lessonNodes.findIndex((node) => finalAssessmentLabel.test(textForNode(node)));

  const descriptionText = descriptionIndex >= 0
    ? textForNode(lessonNodes[descriptionIndex]).replace(descriptionLabel, '').trim()
    : '';

  const objectiveHtmlParts = [];
  if (objectivesIndex >= 0) {
    const firstTopicIndex = lessonNodes.findIndex((node, index) =>
      index > objectivesIndex && /^(?:Topic|Paksa)\s+\d+\s*:/i.test(textForNode(node))
    );

    const objectiveEndIndex = [firstTopicIndex, topicsIndex, referencesIndex, finalAssessmentIndex]
      .filter((idx) => idx > objectivesIndex)
      .sort((a, b) => a - b)[0] || lessonNodes.length;

    for (let index = objectivesIndex; index < objectiveEndIndex; index += 1) {
      const node = lessonNodes[index];

      if (index === objectivesIndex) {
        const objectiveIntro = textForNode(node).replace(objectivesLabel, '').trim();
        if (objectiveIntro) {
          objectiveHtmlParts.push(`<p>${formatPlainTextWithCitations(objectiveIntro)}</p>`);
        }
        continue;
      }

      const richHtml = normalizeRichHtml(htmlForNode(node), { preserveMedia: true });
      if (hasMeaningfulText(richHtml, { includeMedia: true })) {
        objectiveHtmlParts.push(richHtml);
      }
    }
  }

  const objectivesHtml = objectiveHtmlParts.join('').trim();
  const objectivesTitle = isTaglish ? 'Mga Layunin' : 'Learning Objectives';

  const combinedDescription = [
    descriptionText ? `<div>${formatPlainTextWithCitations(descriptionText)}</div>` : '',
    objectivesHtml ? `<p><br></p><p><strong>${objectivesTitle}:</strong></p>` : '',
    objectivesHtml,
  ].join('');

  const contentStart = topicsIndex >= 0 ? topicsIndex + 1 : 0;
  const contentStopCandidates = [referencesIndex, finalAssessmentIndex]
    .filter((idx) => idx >= 0)
    .sort((a, b) => a - b);
  const contentEnd = contentStopCandidates.length ? contentStopCandidates[0] : lessonNodes.length;

  const sectionRows = [];

  const topicRegex = isTaglish ? /^Paksa\s+\d+\s*:/i : /^Topic\s+\d+\s*:/i;

  const topicIndexes = [];
  for (let i = contentStart; i < contentEnd; i += 1) {
    const line = textForNode(lessonNodes[i]);
    if (topicRegex.test(line)) {
      topicIndexes.push(i);
    }
  }

  const buildParagraphSection = ({ html = '', id = sectionSeed() } = {}) => ({
    id,
    file: null,
    type: 'paragraph',
    title: '',
    caption: '',
    content: html,
    fileName: null,
    contentLayout: 'text',
    tableData: null,
  });

  const buildVideoSection = ({ url = '', caption = '', id = sectionSeed() } = {}) => ({
    id,
    file: null,
    type: 'video',
    title: '',
    caption: caption || '',
    content: url,
    fileName: null,
  });

  const inferTextImageLayoutFromNode = ($fragment, node) => {
    const tagName = String(node?.tagName || node?.name || '').toLowerCase();

    if (tagName === 'table') {
      const firstRowCells = $fragment(node).find('tr').first().children('th,td').toArray();
      const imageCellIndex = firstRowCells.findIndex((cell) => $fragment(cell).find('img').length > 0);
      const textCellIndex = firstRowCells.findIndex((cell) => normalizeWhitespace($fragment(cell).text()).length > 0);

      if (imageCellIndex >= 0 && textCellIndex >= 0 && imageCellIndex !== textCellIndex) {
        return imageCellIndex < textCellIndex ? 'text-right' : 'text-left';
      }
    }

    const directNodes = $fragment(node).contents().toArray();
    const firstImageNodeIndex = directNodes.findIndex((child) => {
      const childTag = String(child?.tagName || child?.name || '').toLowerCase();
      if (childTag === 'img' || childTag === 'figure') return true;
      return $fragment(child).find('img').length > 0;
    });
    const firstTextNodeIndex = directNodes.findIndex((child) => normalizeWhitespace($fragment(child).text()).length > 0);

    if (firstImageNodeIndex >= 0 && firstTextNodeIndex >= 0 && firstImageNodeIndex !== firstTextNodeIndex) {
      return firstImageNodeIndex < firstTextNodeIndex ? 'text-right' : 'text-left';
    }

    return 'text-right';
  };

  const extractImageItemsFromNode = ($fragment, node) => {
    const seen = new Set();
    const items = [];

    $fragment(node)
      .find('img')
      .addBack('img')
      .each((_, imgNode) => {
        const srcRaw = String($fragment(imgNode).attr('src') || '').trim();
        const imageUrl = normalizeImportedImageUrl(srcRaw);
        if (!imageUrl || seen.has(imageUrl)) return;
        seen.add(imageUrl);

        const figureCaption = normalizeWhitespace($fragment(imgNode).closest('figure').find('figcaption').first().text());
        const altCaption = normalizeWhitespace($fragment(imgNode).attr('alt'));
        const urlNoQuery = imageUrl.split('?')[0];
        const fileName = path.basename(urlNoQuery || '');

        items.push({
          url: imageUrl,
          fileName: fileName || '',
          caption: figureCaption || altCaption || '',
        });
      });

    return items;
  };

  const extractTextImageLayersFromTable = ($fragment, tableNode) => {
    const rows = $fragment(tableNode).find('tr').toArray();
    if (!rows.length) return null;

    const layerImages = [];
    const sideTexts = [];
    const layoutVotes = [];

    rows.forEach((rowNode) => {
      const cells = $fragment(rowNode).children('th,td').toArray();
      if (!cells.length) return;

      const rowImages = [];
      const seenRowImages = new Set();
      const textParts = [];
      let firstImageCellIndex = -1;
      let firstTextCellIndex = -1;

      cells.forEach((cellNode, cellIndex) => {
        const cellImageItems = extractImageItemsFromNode($fragment, cellNode);
        if (cellImageItems.length && firstImageCellIndex === -1) {
          firstImageCellIndex = cellIndex;
        }

        cellImageItems.forEach((item) => {
          if (!item?.url || seenRowImages.has(item.url)) return;
          seenRowImages.add(item.url);
          rowImages.push(item);
        });

        const textClone = $fragment(cellNode).clone();
        textClone.find(MEDIA_ELEMENT_SELECTOR).remove();
        const cellTextHtml = normalizeRichHtml(String($fragment.html(textClone) || ''), { preserveMedia: false });

        if (hasMeaningfulText(cellTextHtml)) {
          if (firstTextCellIndex === -1) {
            firstTextCellIndex = cellIndex;
          }
          textParts.push(cellTextHtml);
        }
      });

      if (!rowImages.length) return;

      if (firstImageCellIndex >= 0 && firstTextCellIndex >= 0 && firstImageCellIndex !== firstTextCellIndex) {
        layoutVotes.push(firstImageCellIndex < firstTextCellIndex ? 'text-right' : 'text-left');
      }

      layerImages.push(rowImages);
      sideTexts.push(textParts.join(''));
    });

    if (!layerImages.length) return null;

    const hasAnyText = sideTexts.some((html) => hasMeaningfulText(html));
    const textLeftVotes = layoutVotes.filter((value) => value === 'text-left').length;
    const textRightVotes = layoutVotes.filter((value) => value === 'text-right').length;

    return {
      layout: textLeftVotes > textRightVotes ? 'text-left' : 'text-right',
      layerImages,
      sideTexts: hasAnyText ? sideTexts : [],
      hasAnyText,
    };
  };

  const appendRichContentAsSections = (rawHtml = '', preferredId = null) => {
    const normalizedHtml = normalizeRichHtml(rawHtml, { preserveMedia: true });
    if (!hasMeaningfulText(normalizedHtml, { includeMedia: true })) return;

    const $fragment = cheerio.load(`<div id="root">${normalizedHtml}</div>`);
    const hasImages = $fragment(`#root ${MEDIA_ELEMENT_SELECTOR}`).length > 0;

    if (!hasImages) {
      const textOnlyHtml = normalizeRichHtml($fragment('#root').html() || '', { preserveMedia: false });
      if (hasMeaningfulText(textOnlyHtml)) {
        sectionRows.push(buildParagraphSection({ id: preferredId || sectionSeed(), html: textOnlyHtml }));
      }
      return;
    }

    const nodes = $fragment('#root')
      .contents()
      .toArray()
      .filter((node) => {
        if (node.type === 'text') {
          return normalizeWhitespace(node.data || '').length > 0;
        }
        return true;
      });

    const textBuffer = [];
    let usedPreferredId = false;

    const takeSectionId = () => {
      if (!usedPreferredId && preferredId) {
        usedPreferredId = true;
        return preferredId;
      }
      return sectionSeed();
    };

    const flushTextBuffer = () => {
      if (!textBuffer.length) return;
      const bufferedHtml = normalizeRichHtml(textBuffer.join(''), { preserveMedia: false });
      textBuffer.length = 0;
      if (!hasMeaningfulText(bufferedHtml)) return;
      sectionRows.push(buildParagraphSection({ id: takeSectionId(), html: bufferedHtml }));
    };

    nodes.forEach((node) => {
      const nodeTag = String(node?.tagName || node?.name || '').toLowerCase();
      const nodeHasImages =
        nodeTag === 'img' ||
        nodeTag === 'figure' ||
        $fragment(node).find('img').length > 0;

      const nodeHtml =
        node.type === 'text'
          ? `<p>${escapeHtml(String(node.data || ''))}</p>`
          : String($fragment.html(node) || '').trim();

      if (!nodeHtml) return;

      if (!nodeHasImages) {
        textBuffer.push(nodeHtml);
        return;
      }

      flushTextBuffer();

      const imageItems = extractImageItemsFromNode($fragment, node);
      if (!imageItems.length) {
        const fallbackHtml = normalizeRichHtml(nodeHtml, { preserveMedia: false });
        if (hasMeaningfulText(fallbackHtml)) {
          sectionRows.push(buildParagraphSection({ id: takeSectionId(), html: fallbackHtml }));
        }
        return;
      }

      const tableLayerInfo = nodeTag === 'table' ? extractTextImageLayersFromTable($fragment, node) : null;
      const textClone = $fragment(node).clone();
      textClone.find(MEDIA_ELEMENT_SELECTOR).remove();
      const textHtml = normalizeRichHtml(String($fragment.html(textClone) || ''), { preserveMedia: false });
      const hasTextInNode = hasMeaningfulText(textHtml);
      const hasTableLayerText = Boolean(tableLayerInfo?.hasAnyText);
      const hasTextForLayout = hasTableLayerText || hasTextInNode;

      const imageSection = {
        id: takeSectionId(),
        file: null,
        type: 'image',
        title: '',
        caption: '',
        content: imageItems[0].url,
        fileName: imageItems[0].fileName || null,
        images: imageItems,
        layout: hasTextForLayout
          ? (hasTableLayerText ? tableLayerInfo.layout : inferTextImageLayoutFromNode($fragment, node))
          : inferImageLayoutFromCount(imageItems.length),
      };

      if (hasTextForLayout) {
        if (hasTableLayerText) {
          imageSection.sideTexts = tableLayerInfo.sideTexts;
          imageSection.layerImages = tableLayerInfo.layerImages;
        } else {
          imageSection.sideTexts = [textHtml];
          imageSection.layerImages = [imageItems];
        }
      }

      sectionRows.push(imageSection);
    });

    flushTextBuffer();

    if (!usedPreferredId && preferredId) {
      const fallbackHtml = normalizeRichHtml($fragment('#root').html() || '', { preserveMedia: false });
      if (hasMeaningfulText(fallbackHtml)) {
        sectionRows.push(buildParagraphSection({ id: preferredId, html: fallbackHtml }));
      }
    }
  };

  const pushParagraphSection = (bufferHtml = []) => {
    if (!bufferHtml.length) return;
    appendRichContentAsSections(bufferHtml.join(''));
  };

  const shouldContinueSkippingAssessment = ({
    line = '',
    tagName = '',
    extractedQuestions = [],
  }) => {
    if (!line) return true;
    if (isAssessmentContent(line)) return true;
    if (topicRegex.test(line)) return false;
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) return false;
    if (shouldUseSubtopicType(line)) return false;
    if (extractedQuestions.length > 0) return true;
    if (/^(?:Question|Tanong|Choices|Mga\s+Pagpipilian|Answer|Sagot)\s*:/i.test(line)) return true;
    if (/^(?:[A-Da-d]|[1-9])\s*[.):-]/.test(line)) return true;
    if (/^(?:true|false|tama|mali)\b/i.test(line)) return true;

    const cleaned = cleanAssessmentQuestionText(line);
    if (!cleaned) return true;
    if (looksLikeQuestionText(cleaned)) return true;

    const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
    if (wordCount <= 8) return true;
    if (wordCount <= 14 && !/[.!?]$/.test(cleaned)) return true;

    return false;
  };

  const topicNumbersInOrder = topicIndexes.map((topicStart, idx) => {
    const topicLine = textForNode(lessonNodes[topicStart]);
    return toTopicKey(topicLine) || idx + 1;
  });

  const reviewItemNumbersInOrder = [...reviewEasyByNumber.keys()].sort((a, b) => a - b);
  const hasExplicitTopicMap = topicNumbersInOrder.some((topicNumber) => Array.isArray(topicItemMap[topicNumber]) && topicItemMap[topicNumber].length > 0);
  const fallbackTopicItemMap = hasExplicitTopicMap
    ? {}
    : buildFallbackTopicItemMap({
      topicNumbers: topicNumbersInOrder,
      reviewItemNumbers: reviewItemNumbersInOrder,
    });
  const reviewQuestionLookup = buildReviewQuestionLookup(reviewEasyByNumber);
  const orderedReviewItemNumbers = [];
  const usedReviewItemNumbers = new Set();

  topicIndexes.forEach((topicStart, idx) => {
    const topicLine = textForNode(lessonNodes[topicStart]);
    if (!topicLine) return;

    sectionRows.push({
      id: sectionSeed(),
      file: null,
      type: 'topic',
      title: topicLine,
      caption: '',
      content: '',
      fileName: null,
    });

    const topicNumber = toTopicKey(topicLine) || idx + 1;
    const nextTopicStart = idx + 1 < topicIndexes.length ? topicIndexes[idx + 1] : contentEnd;

    let paragraphBuffer = [];
    let skippingGuideQuestions = false;
    const topicLessonQuestionTexts = [];

    for (let i = topicStart + 1; i < nextTopicStart; i += 1) {
      const node = lessonNodes[i];
      const tagName = String(node?.tagName || '').toLowerCase();
      const line = textForNode(node);
      const nodeHtmlRaw = htmlForNode(node);
      const nodeHasMedia = hasMediaInHtml(nodeHtmlRaw);

      if (!line && !nodeHasMedia) {
        continue;
      }

      if (isAssessmentContent(line)) {
        pushParagraphSection(paragraphBuffer);
        paragraphBuffer = [];
        const extractedQuestions = extractLessonQuickAssessmentQuestionsFromNode(dom, node);
        topicLessonQuestionTexts.push(...extractedQuestions);
        skippingGuideQuestions = true;
        continue;
      }

      if (skippingGuideQuestions) {
        const extractedQuestions = extractLessonQuickAssessmentQuestionsFromNode(dom, node);
        topicLessonQuestionTexts.push(...extractedQuestions);

        if (shouldContinueSkippingAssessment({ line, tagName, extractedQuestions })) {
          continue;
        }

        skippingGuideQuestions = false;
      }

      if (tagName === 'table') {
        const tableHasImages = dom(node).find('img').length > 0;
        if (tableHasImages) {
          pushParagraphSection(paragraphBuffer);
          paragraphBuffer = [];

          appendRichContentAsSections(nodeHtmlRaw);
          continue;
        }

        if (/quick\s+assessment|final\s+assessment/i.test(line)) {
          continue;
        }

        const tableData = parseTableData(dom, node);
        if (tableData) {
          pushParagraphSection(paragraphBuffer);
          paragraphBuffer = [];

          sectionRows.push({
            id: sectionSeed(),
            file: null,
            type: 'paragraph',
            title: '',
            caption: '',
            content: '',
            fileName: null,
            contentLayout: 'table',
            tableData,
          });
          continue;
        }

        const tableFallbackHtml = normalizeRichHtml(nodeHtmlRaw, { preserveMedia: true });
        if (hasMeaningfulText(tableFallbackHtml, { includeMedia: true })) {
          paragraphBuffer.push(tableFallbackHtml);
        }
        continue;
      }

      const videoUrlsFromLine = !nodeHasMedia ? extractVideoUrlsFromText(line) : [];
      const strippedLineText = stripUrlsFromText(line);
      if (videoUrlsFromLine.length > 0 && !strippedLineText) {
        pushParagraphSection(paragraphBuffer);
        paragraphBuffer = [];

        videoUrlsFromLine.forEach((videoUrl) => {
          sectionRows.push(buildVideoSection({ url: videoUrl }));
        });
        continue;
      }

      if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
        if (topicRegex.test(line)) {
          continue;
        }

        if (shouldUseSubtopicType(line)) {
          pushParagraphSection(paragraphBuffer);
          paragraphBuffer = [];

          const { heading, videoUrls } = splitHeadingAndVideoUrls(line);
          const subtopicTitle = (heading || line).replace(/:$/, '').trim();

          if (subtopicTitle) {
            sectionRows.push({
              id: sectionSeed(),
              file: null,
              type: 'subtopic',
              title: subtopicTitle,
              caption: '',
              content: '',
              fileName: null,
            });
          }

          videoUrls.forEach((videoUrl) => {
            sectionRows.push(buildVideoSection({ url: videoUrl }));
          });

          continue;
        }

        const headingHtml = normalizeRichHtml(nodeHtmlRaw, { preserveMedia: true });
        if (hasMeaningfulText(headingHtml, { includeMedia: true })) {
          paragraphBuffer.push(headingHtml);
        }
        continue;
      }

      if (tagName === 'p' && shouldUseSubtopicType(line)) {
        pushParagraphSection(paragraphBuffer);
        paragraphBuffer = [];

        const { heading, videoUrls } = splitHeadingAndVideoUrls(line);
        const subtopicTitle = (heading || line).replace(/:$/, '').trim();

        if (subtopicTitle) {
          sectionRows.push({
            id: sectionSeed(),
            file: null,
            type: 'subtopic',
            title: subtopicTitle,
            caption: '',
            content: '',
            fileName: null,
          });
        }

        videoUrls.forEach((videoUrl) => {
          sectionRows.push(buildVideoSection({ url: videoUrl }));
        });

        continue;
      }

      const nodeHtml = normalizeRichHtml(nodeHtmlRaw, { preserveMedia: true });
      if (hasMeaningfulText(nodeHtml, { includeMedia: true })) {
        paragraphBuffer.push(nodeHtml);
      }
    }

    pushParagraphSection(paragraphBuffer);

    const mappedFromLesson = mapLessonQuestionsToReviewItemNumbers({
      lessonQuestionTexts: topicLessonQuestionTexts,
      reviewEasyByNumber,
      reviewQuestionLookup,
      usedItemNumbers: usedReviewItemNumbers,
    });

    const mappedItemsFromMap = Array.isArray(topicItemMap[topicNumber]) && topicItemMap[topicNumber].length > 0
      ? topicItemMap[topicNumber]
      : (Array.isArray(fallbackTopicItemMap[topicNumber]) ? fallbackTopicItemMap[topicNumber] : []);
    const mappedFromFallback = mappedItemsFromMap
      .filter((itemNumber) => Number.isInteger(itemNumber) && reviewEasyByNumber.has(itemNumber) && !usedReviewItemNumbers.has(itemNumber));

    const mappedItems = mappedFromLesson.length > 0 ? mappedFromLesson : mappedFromFallback;
    mappedItems.forEach((itemNumber) => {
      if (!orderedReviewItemNumbers.includes(itemNumber)) {
        orderedReviewItemNumbers.push(itemNumber);
      }
      usedReviewItemNumbers.add(itemNumber);
    });

    const topicReviewQuestions = mappedItems
      .map((itemNumber) => reviewEasyByNumber.get(itemNumber))
      .filter(Boolean)
      .map((item) =>
        buildQuestionObject({
          questionSeed,
          questionText: item.easyQuestion,
          options: item.options,
          correctAnswer: item.reviewCorrect,
          skill: item.skill,
          questionType: item.easyQuestionType || 'Easy',
        })
      );

    if (topicReviewQuestions.length > 0) {
      sectionRows.push({
        id: sectionSeed(),
        file: null,
        type: 'review-multiple-choice',
        title: '',
        caption: '',
        content: '',
        fileName: null,
        questions: topicReviewQuestions,
      });
    }
  });

  let referencesText = '';
  if (referencesIndex >= 0) {
    referencesText = parseReferencesFromNodes(dom, lessonNodes.slice(referencesIndex + 1));
  }

  if (!referencesText && fallbackReferences) {
    referencesText = fallbackReferences;
  }

  if (referencesText) {
    sectionRows.push({
      id: sectionSeed(),
      file: null,
      type: 'references',
      title: '',
      caption: '',
      content: referencesText,
      fileName: null,
    });
  }

  const sections = sectionRows.map((section, index) => ({
    ...section,
    order: index + 1,
  }));

  return {
    moduleTitle,
    combinedDescription,
    sections,
    referencesText,
    orderedReviewItemNumbers,
  };
};

const ensureLessonLanguageColumn = async () => {
  const columns = await query(
    `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'module'
        AND COLUMN_NAME IN ('LessonLanguage', 'Is_Completed')`
  );

  const columnSet = new Set(columns.map((col) => String(col.COLUMN_NAME || '')));

  if (!columnSet.has('Is_Completed')) {
    await query(
      `ALTER TABLE module
       ADD COLUMN Is_Completed BOOLEAN NOT NULL DEFAULT FALSE AFTER Is_Unlocked`
    );
    console.log('Added Is_Completed column to module table.');
  }

  if (!columnSet.has('LessonLanguage')) {
    await query(
      `ALTER TABLE module
       ADD COLUMN LessonLanguage VARCHAR(20) NOT NULL DEFAULT 'English' AFTER Is_Completed`
    );
    console.log('Added LessonLanguage column to module table.');
  }
};

const upsertLanguageLesson = async ({
  language,
  moduleTitle,
  combinedDescription,
  sections,
  reviewQuestions,
  finalQuestions,
  diagnosticQuestions,
}) => {
  const rows = await query(
    `SELECT ModuleID
       FROM module
      WHERE LessonOrder = ?
        AND LessonLanguage = ?
      LIMIT 1`,
    [TARGET_LESSON_ORDER, language]
  );

  const lessonTime = JSON.stringify({ hours: 0, minutes: 30 });
  const roadmapStages = JSON.stringify(LESSON_STAGE_DEFAULTS);

  if (!rows.length) {
    const insertResult = await query(
      `INSERT INTO module (
        ModuleTitle,
        Description,
        LessonOrder,
        Tesda_Reference,
        Is_Unlocked,
        Is_Completed,
        LessonLanguage,
        LessonTime,
        Difficulty,
        sections,
        diagnosticQuestions,
        reviewQuestions,
        finalQuestions,
        finalInstruction,
        roadmapStages
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        moduleTitle,
        combinedDescription,
        TARGET_LESSON_ORDER,
        '',
        true,
        false,
        language,
        lessonTime,
        'Easy',
        JSON.stringify(sections),
        JSON.stringify(diagnosticQuestions),
        JSON.stringify(reviewQuestions),
        JSON.stringify(finalQuestions),
        null,
        roadmapStages,
      ]
    );

    return insertResult.insertId;
  }

  const moduleId = rows[0].ModuleID;

  await query(
    `UPDATE module
        SET ModuleTitle = ?,
            Description = ?,
            LessonOrder = ?,
            Tesda_Reference = ?,
            Is_Unlocked = ?,
            LessonLanguage = ?,
            LessonTime = ?,
            Difficulty = ?,
            sections = ?,
            diagnosticQuestions = ?,
            reviewQuestions = ?,
            finalQuestions = ?,
            finalInstruction = ?,
            roadmapStages = ?
      WHERE ModuleID = ?`,
    [
      moduleTitle,
      combinedDescription,
      TARGET_LESSON_ORDER,
      '',
      true,
      language,
      lessonTime,
      'Easy',
      JSON.stringify(sections),
      JSON.stringify(diagnosticQuestions),
      JSON.stringify(reviewQuestions),
      JSON.stringify(finalQuestions),
      null,
      roadmapStages,
      moduleId,
    ]
  );

  return moduleId;
};

const main = async () => {
  try {
    await ensureLessonLanguageColumn();

    const lessonHtmlResult = await mammoth.convertToHtml({ path: LESSON_DOCX_PATH });
    const assessmentTextResult = await mammoth.extractRawText({ path: ASSESSMENT_DOCX_PATH });
    const assessmentHtmlResult = await mammoth.convertToHtml({ path: ASSESSMENT_DOCX_PATH });

    const lessonDom = cheerio.load(lessonHtmlResult.value || '');
    const lessonTopNodes = lessonDom('body').children().toArray();
    const nodeText = (node) => normalizeWhitespace(lessonDom(node).text());

    const taglishMarkerIndex = lessonTopNodes.findIndex((node) => /^TAGLISH\s+VERSION$/i.test(nodeText(node)));

    if (taglishMarkerIndex < 0) {
      throw new Error('Could not find TAGLISH VERSION marker in Lessons_7.docx.');
    }

    const englishRawNodes = lessonTopNodes.slice(0, taglishMarkerIndex);
    const taglishRawNodes = lessonTopNodes.slice(taglishMarkerIndex + 1);

    const englishStart = englishRawNodes.findIndex((node) => /^Lesson\s*7\s*:/i.test(nodeText(node)));
    const taglishStart = taglishRawNodes.findIndex((node) => /^Aralin\s*7\s*:/i.test(nodeText(node)));

    const englishLessonNodes = englishStart >= 0 ? englishRawNodes.slice(englishStart) : englishRawNodes;
    const taglishLessonNodes = taglishStart >= 0 ? taglishRawNodes.slice(taglishStart) : taglishRawNodes;

    const assessmentByLanguage = parseAssessmentByLanguage(
      assessmentTextResult.value,
      assessmentHtmlResult.value || ''
    );
    const topicItemMap = assessmentByLanguage.quickAssessmentMap.topicItemMap;

    if (!assessmentByLanguage.english.reviewItems.length || !assessmentByLanguage.english.finalItems.length) {
      throw new Error('Failed to parse English assessment items from Assessments_lesson_7.docx.');
    }

    if (!assessmentByLanguage.taglish.reviewItems.length || !assessmentByLanguage.taglish.finalItems.length) {
      throw new Error('Failed to parse Taglish assessment items from Assessments_lesson_7.docx.');
    }

    let numericSeed = Date.now();
    const nextId = () => {
      numericSeed += 1;
      return numericSeed;
    };

    const englishReviewByNumber = new Map(
      assessmentByLanguage.english.reviewItems.map((item) => [item.itemNumber, item])
    );
    const taglishReviewByNumber = new Map(
      assessmentByLanguage.taglish.reviewItems.map((item) => [item.itemNumber, item])
    );

    const englishLesson = parseLessonLanguageBlock({
      dom: lessonDom,
      nodes: englishLessonNodes,
      isTaglish: false,
      topicItemMap,
      reviewEasyByNumber: englishReviewByNumber,
      questionSeed: nextId,
      sectionSeed: nextId,
    });

    const taglishLesson = parseLessonLanguageBlock({
      dom: lessonDom,
      nodes: taglishLessonNodes,
      isTaglish: true,
      topicItemMap,
      reviewEasyByNumber: taglishReviewByNumber,
      questionSeed: nextId,
      sectionSeed: nextId,
      fallbackReferences: englishLesson.referencesText,
    });

    const englishReviewOrder = englishLesson.orderedReviewItemNumbers || [];
    const taglishReviewOrder = (taglishLesson.orderedReviewItemNumbers && taglishLesson.orderedReviewItemNumbers.length > 0)
      ? taglishLesson.orderedReviewItemNumbers
      : englishReviewOrder;

    const selectedReviewItemNumbers = (() => {
      const ordered = assessmentByLanguage.quickAssessmentMap.orderedSelectedItems.slice();
      const unique = [];

      englishReviewOrder.forEach((num) => {
        if (!unique.includes(num)) unique.push(num);
      });

      ordered.forEach((num) => {
        if (!unique.includes(num)) unique.push(num);
      });

      // Required final composition needs 15 situational review questions.
      if (unique.length >= 15) return unique.slice(0, 15);

      for (let i = 1; i <= 20 && unique.length < 15; i += 1) {
        if (!unique.includes(i)) unique.push(i);
      }

      return unique;
    })();

    const englishAssessment = buildAssessmentPayload({
      reviewItems: assessmentByLanguage.english.reviewItems,
      finalItems: assessmentByLanguage.english.finalItems,
      selectedReviewItemNumbers,
      reviewOrderItemNumbers: englishReviewOrder,
      questionSeed: nextId,
    });

    const taglishAssessment = buildAssessmentPayload({
      reviewItems: assessmentByLanguage.taglish.reviewItems,
      finalItems: assessmentByLanguage.taglish.finalItems,
      selectedReviewItemNumbers,
      reviewOrderItemNumbers: taglishReviewOrder,
      questionSeed: nextId,
    });

    const englishModuleId = await upsertLanguageLesson({
      language: 'English',
      moduleTitle: englishLesson.moduleTitle,
      combinedDescription: englishLesson.combinedDescription,
      sections: englishLesson.sections,
      reviewQuestions: englishAssessment.reviewQuestions,
      finalQuestions: englishAssessment.finalQuestions,
      diagnosticQuestions: englishAssessment.diagnosticQuestions,
    });

    const taglishModuleId = await upsertLanguageLesson({
      language: 'Taglish',
      moduleTitle: taglishLesson.moduleTitle,
      combinedDescription: taglishLesson.combinedDescription,
      sections: taglishLesson.sections,
      reviewQuestions: taglishAssessment.reviewQuestions,
      finalQuestions: taglishAssessment.finalQuestions,
      diagnosticQuestions: taglishAssessment.diagnosticQuestions,
    });

    const summaryRowsRaw = await query(
      `SELECT ModuleID, ModuleTitle, LessonOrder, LessonLanguage, JSON_LENGTH(sections) AS sectionCount,
              JSON_LENGTH(reviewQuestions) AS reviewCount, JSON_LENGTH(finalQuestions) AS finalCount
         FROM module
        WHERE ModuleID IN (?, ?)`,
      [englishModuleId, taglishModuleId]
    );

    const summaryRows = [...summaryRowsRaw].sort((a, b) =>
      String(a?.LessonLanguage || '').localeCompare(String(b?.LessonLanguage || ''))
    );

    console.log('Lesson 7 import complete.');
    console.log(JSON.stringify(summaryRows, null, 2));

    const snapshotsRaw = await query(
      `SELECT ModuleID, ModuleTitle, LessonOrder, LessonLanguage, Description,
              sections, diagnosticQuestions, reviewQuestions, finalQuestions
         FROM module
        WHERE ModuleID IN (?, ?)`,
      [englishModuleId, taglishModuleId]
    );

    const snapshots = [...snapshotsRaw].sort((a, b) =>
      String(a?.LessonLanguage || '').localeCompare(String(b?.LessonLanguage || ''))
    );

    const snapshotPath = path.join(__dirname, '..', 'lessons', 'lesson7_after_import_snapshot.json');
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshots, null, 2));
    console.log(`Saved snapshot: ${snapshotPath}`);
  } finally {
    await closePool();
  }
};

main().catch((error) => {
  console.error('Lesson 7 import failed:', error.message);
  process.exit(1);
});
