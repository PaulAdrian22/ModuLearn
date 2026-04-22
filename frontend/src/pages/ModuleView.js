import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../App';
import Navbar from '../components/Navbar';
import QuickAssessment from '../components/QuickAssessment';
import Diagnostic from '../components/Diagnostic';
import { API_SERVER_URL } from '../config/api';
import { withPreferredLanguage, getPreferredLanguage } from '../utils/languagePreference';
import { 
  getPerformance, 
  shouldShowChallenge, 
  getDifficultyLevel, 
  getEasierContent, 
  getChallengeContent,
  DIFFICULTY_LEVELS,
  getFinalAssessment
} from '../services/adaptiveLearning';

const ModuleView = () => {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [module, setModule] = useState(null);
  const [currentTopic, setCurrentTopic] = useState(0);
  const [showQuickAssessment, setShowQuickAssessment] = useState(false);
  const [topicCompleted, setTopicCompleted] = useState({});
  const [loading, setLoading] = useState(true);
  const [showChallengeMode, setShowChallengeMode] = useState(false);
  const [currentDifficulty, setCurrentDifficulty] = useState(DIFFICULTY_LEVELS.NORMAL);
  const [topicPerformance, setTopicPerformance] = useState(null);
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [diagnosticCompleted, setDiagnosticCompleted] = useState(false);
  const [diagnosticScore, setDiagnosticScore] = useState(null);
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [showReferencesPanel, setShowReferencesPanel] = useState(false);
  const [currentTopicPage, setCurrentTopicPage] = useState(0);
  const [showLessonIntro, setShowLessonIntro] = useState(true);
  const contentScrollRef = useRef(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportType, setReportType] = useState('Lesson Content');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [showReportSuccess, setShowReportSuccess] = useState(false);
  const [reportError, setReportError] = useState('');
  const [completedReviews, setCompletedReviews] = useState({});
  const [activeReview, setActiveReview] = useState(null);
  const [reviewAnswers, setReviewAnswers] = useState({});
  const [reviewScore, setReviewScore] = useState(null);
  const [reviewResults, setReviewResults] = useState({});
  const [reviewCooldowns, setReviewCooldowns] = useState({});
  const [cooldownNow, setCooldownNow] = useState(Date.now());
  const [reviewAttempts, setReviewAttempts] = useState({});
  const [shuffledQuestions, setShuffledQuestions] = useState({});
  const [activeReviewQuestionIndex, setActiveReviewQuestionIndex] = useState(0);
  const [activeReviewQuestionStartTime, setActiveReviewQuestionStartTime] = useState(null);
  const [activeReviewQuestionTimes, setActiveReviewQuestionTimes] = useState({});
  const lessonProgressStorageKey = useMemo(() => {
    if (!moduleId || !user?.userId) return null;
    const language = getPreferredLanguage() || 'English';
    return `lesson_progress_u${user.userId}_m${moduleId}_lang${language}`;
  }, [moduleId, user?.userId]);
  const progressHydratedRef = useRef(false);
  const progressSyncRef = useRef({ moduleId: null, completionRate: null });
  const lessonTimeBufferRef = useRef(0);
  const lessonTimeFlushInFlightRef = useRef(false);

  useEffect(() => {
    const hasActiveCooldown = Object.values(reviewCooldowns).some((endAt) => endAt > Date.now());
    if (!hasActiveCooldown) return;

    const timer = setInterval(() => {
      setCooldownNow(Date.now());
    }, 250);

    return () => clearInterval(timer);
  }, [reviewCooldowns]);

  const getCooldownSecondsLeft = (reviewId) => {
    const endAt = reviewCooldowns[reviewId] || 0;
    const remainingMs = endAt - cooldownNow;
    return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
  };

  const formatDuration = (seconds = 0) => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    return `${Math.floor(safeSeconds / 60)}m ${safeSeconds % 60}s`;
  };

  useEffect(() => {
    if (!activeReview) return;
    setActiveReviewQuestionStartTime(Date.now());
  }, [activeReview, activeReviewQuestionIndex]);

  const updateActiveReviewQuestionTime = (existingTimes = activeReviewQuestionTimes) => {
    const accumulated = existingTimes[activeReviewQuestionIndex] || 0;
    const additional = activeReviewQuestionStartTime
      ? Math.max(0, Math.floor((Date.now() - activeReviewQuestionStartTime) / 1000))
      : 0;

    return {
      ...existingTimes,
      [activeReviewQuestionIndex]: accumulated + additional,
    };
  };

  const getTotalTimeFromQuestionTimes = (times = {}) => {
    return Object.values(times).reduce((total, seconds) => total + Number(seconds || 0), 0);
  };

  const decodeHtmlEntities = (value) => {
    if (!value) return '';
    const textarea = document.createElement('textarea');
    textarea.innerHTML = String(value);
    return textarea.value;
  };

  const toPlainText = (value) => {
    const decoded = decodeHtmlEntities(value);
    return decoded.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  };

  const normalizeTableHeaderSpans = (rawSpans, colCount) => {
    const safeColCount = Math.max(0, Number.isFinite(colCount) ? Math.floor(colCount) : 0);
    if (safeColCount === 0) {
      return [];
    }

    const sourceSpans = Array.isArray(rawSpans) ? rawSpans : [];
    const normalizedSpans = [];
    let openSpanSlots = 0;

    for (let colIndex = 0; colIndex < safeColCount; colIndex += 1) {
      if (openSpanSlots > 0) {
        normalizedSpans.push(0);
        openSpanSlots -= 1;
        continue;
      }

      const rawValue = Number.parseInt(sourceSpans[colIndex], 10);
      const spanValue = Number.isFinite(rawValue) && rawValue > 1
        ? Math.min(rawValue, safeColCount - colIndex)
        : 1;

      normalizedSpans.push(spanValue);
      openSpanSlots = spanValue - 1;
    }

    return normalizedSpans;
  };

  const normalizeLessonSectionType = (rawType = '') => {
    const normalizedType = String(rawType || '').trim().toLowerCase();

    switch (normalizedType) {
      case 'topic title':
      case 'topic-title':
      case 'topic_title':
        return 'topic';
      case 'subtopic title':
      case 'subtopic-title':
      case 'subtopic_title':
        return 'subtopic';
      case 'review - multiple choice':
      case 'review multiple choice':
        return 'review-multiple-choice';
      case 'review-drag-drop':
      case 'review - drag and drop':
      case 'review drag and drop':
        return 'simulation';
      default:
        return normalizedType;
    }
  };

  const normalizeExternalVideoUrl = (rawUrl) => {
    if (!rawUrl) return '';
    const value = String(rawUrl).trim();
    if (!value) return '';

    try {
      const parsed = new URL(value);
      const host = parsed.hostname.toLowerCase();
      const pathname = parsed.pathname || '';

      if (host.includes('youtu.be')) {
        const videoId = pathname.replace('/', '').trim();
        if (videoId) return `https://www.youtube.com/embed/${videoId}`;
      }

      if (host.includes('youtube.com')) {
        if (pathname.includes('/embed/')) return parsed.toString();
        const videoId = parsed.searchParams.get('v');
        if (videoId) return `https://www.youtube.com/embed/${videoId}`;
      }

      if (host.includes('vimeo.com') && !pathname.includes('/video/')) {
        const videoId = pathname.split('/').filter(Boolean).pop();
        if (videoId) return `https://player.vimeo.com/video/${videoId}`;
      }

      if (host.includes('dropbox.com') || host.includes('dropboxusercontent.com')) {
        const directUrl = new URL(parsed.toString());

        if (host.includes('dropbox.com')) {
          directUrl.hostname = 'dl.dropboxusercontent.com';
        }

        directUrl.searchParams.delete('dl');
        directUrl.searchParams.set('raw', '1');
        return directUrl.toString();
      }

      if (host === 'imgur.com' || host.endsWith('.imgur.com')) {
        if (host.startsWith('i.')) {
          if (pathname.toLowerCase().endsWith('.gifv')) {
            return parsed.toString().replace(/\.gifv$/i, '.mp4');
          }
          return parsed.toString();
        }

        const pathParts = pathname.split('/').filter(Boolean);
        const isAlbumPath = pathParts[0] === 'a' || pathParts[0] === 'gallery';
        if (isAlbumPath) return parsed.toString();
        const candidateId = pathParts[pathParts.length - 1];

        if (candidateId) {
          const baseId = candidateId.replace(/\.(gifv|mp4|webm)$/i, '');
          return `https://i.imgur.com/${baseId}.mp4`;
        }
      }

      return parsed.toString();
    } catch {
      return value;
    }
  };

  const isIframeVideoUrl = (url) => {
    if (!url) return false;

    try {
      const parsed = new URL(String(url));
      const host = parsed.hostname.toLowerCase();
      const value = parsed.toString().toLowerCase();
      return (
        host.includes('youtube.com') ||
        host.includes('youtu.be') ||
        host.includes('vimeo.com') ||
        value.includes('/embed/')
      );
    } catch {
      const value = String(url).toLowerCase();
      return value.includes('youtube') || value.includes('vimeo') || value.includes('/embed/');
    }
  };

  const normalizeRichTextHtml = (value) => {
    if (!value) return '';

    let html = String(value).replace(/^\s+/, '');

    // Remove leading visual blank lines produced by editor paste/newline behavior.
    let prev = '';
    while (html !== prev) {
      prev = html;
      html = html
        .replace(/^(?:<br\s*\/?>\s*)+/i, '')
        .replace(/^<(p|div)>\s*(?:<br\s*\/?>\s*)*<\/\1>\s*/i, '');
    }

    // Remove accidental leading tabs/spaces inside common block tags from imported content.
    return html.replace(
      /<(p|li|h[1-6]|td|th|blockquote)([^>]*)>\s+/gi,
      '<$1$2>'
    );
  };

  const VIDEO_TEXT_URL_REGEX = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

  const normalizeVideoTextUrl = (rawValue = '') => {
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

  const isVideoTextUrl = (url = '') => {
    const normalizedUrl = String(url || '').toLowerCase();
    if (!normalizedUrl) return false;

    if (
      normalizedUrl.includes('youtube.com') ||
      normalizedUrl.includes('youtu.be') ||
      normalizedUrl.includes('vimeo.com') ||
      normalizedUrl.includes('dropbox.com') ||
      normalizedUrl.includes('dropboxusercontent.com') ||
      normalizedUrl.includes('imgur.com') ||
      normalizedUrl.includes('dailymotion.com') ||
      normalizedUrl.includes('loom.com') ||
      normalizedUrl.includes('/embed/')
    ) {
      return true;
    }

    return /\.(mp4|webm|ogg|mov|m4v|m3u8)(\?|#|$)/i.test(normalizedUrl);
  };

  const linkifyVideoUrlsInTextHtml = (html = '') => {
    const source = String(html || '');
    if (!source) return '';
    if (typeof document === 'undefined') return source;

    const container = document.createElement('div');
    container.innerHTML = source;

    const replaceTextNodeVideoLinks = (node) => {
      if (!node || node.nodeType !== Node.TEXT_NODE) return;

      const textValue = node.textContent || '';
      if (!textValue.trim()) return;

      const matcher = new RegExp(VIDEO_TEXT_URL_REGEX.source, 'gi');
      const matches = Array.from(textValue.matchAll(matcher));
      if (matches.length === 0) return;

      const fragment = document.createDocumentFragment();
      let cursor = 0;

      matches.forEach((match) => {
        const matchedText = String(match[0] || '');
        const startIndex = typeof match.index === 'number' ? match.index : cursor;

        if (startIndex > cursor) {
          fragment.appendChild(document.createTextNode(textValue.slice(cursor, startIndex)));
        }

        const href = normalizeVideoTextUrl(matchedText);
        if (href && isVideoTextUrl(href)) {
          const anchor = document.createElement('a');
          anchor.href = href;
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
          anchor.textContent = matchedText;
          anchor.style.color = '#346C9A';
          anchor.style.textDecoration = 'underline';
          anchor.style.fontWeight = '600';
          fragment.appendChild(anchor);
        } else {
          fragment.appendChild(document.createTextNode(matchedText));
        }

        cursor = startIndex + matchedText.length;
      });

      if (cursor < textValue.length) {
        fragment.appendChild(document.createTextNode(textValue.slice(cursor)));
      }

      node.parentNode?.replaceChild(fragment, node);
    };

    const traverseNode = (node) => {
      if (!node) return;

      if (node.nodeType === Node.TEXT_NODE) {
        replaceTextNodeVideoLinks(node);
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const element = node;
      if (element.tagName?.toUpperCase() === 'A') return;

      Array.from(element.childNodes).forEach(traverseNode);
    };

    Array.from(container.childNodes).forEach(traverseNode);
    return container.innerHTML;
  };

  const REFERENCE_URL_REGEX = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

  const normalizeReferenceUrl = (rawValue) => {
    if (!rawValue) return null;

    const trimmed = String(rawValue).trim().replace(/[),.;]+$/, '');
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

  const extractReferenceLinks = (rawContent) => {
    if (!rawContent) return [];

    const links = [];
    const seen = new Set();

    const addLink = (rawUrl, rawLabel = '') => {
      const normalizedUrl = normalizeReferenceUrl(rawUrl);
      if (!normalizedUrl) return;

      const key = normalizedUrl.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);

      const label = String(rawLabel || '').replace(/\s+/g, ' ').trim();
      links.push({
        url: normalizedUrl,
        label: label || normalizedUrl
      });
    };

    const html = String(rawContent);

    if (typeof document !== 'undefined') {
      const container = document.createElement('div');
      container.innerHTML = html;

      container.querySelectorAll('a[href]').forEach((anchor) => {
        addLink(anchor.getAttribute('href') || '', anchor.textContent || '');
      });

      const textContent = container.textContent || '';
      const lines = textContent
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      lines.forEach((line) => {
        const candidates = line.match(REFERENCE_URL_REGEX) || [];
        candidates.forEach((candidate) => {
          const label = line
            .replace(candidate, '')
            .replace(/^[\-*\u2022\d.)\s]+/, '')
            .replace(/^[\s:|-]+|[\s:|-]+$/g, '');
          addLink(candidate, label);
        });
      });
    } else {
      const fallbackText = html.replace(/<[^>]*>/g, ' ');
      const candidates = fallbackText.match(REFERENCE_URL_REGEX) || [];
      candidates.forEach((candidate) => addLink(candidate, candidate));
    }

    return links;
  };

  const isUrlLikeLabel = (value = '') => /^(https?:\/\/|www\.)/i.test(String(value || '').trim());

  const toTitleCase = (value = '') => {
    const words = String(value || '').split(/\s+/).filter(Boolean);
    return words
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
      .trim();
  };

  const getSiteNameFromUrl = (normalizedUrl = '') => {
    try {
      const parsed = new URL(normalizedUrl);
      const host = parsed.hostname.replace(/^www\./i, '');
      const hostParts = host.split('.').filter(Boolean);

      if (!hostParts.length) return '';

      let domainToken = hostParts.length >= 2 ? hostParts[hostParts.length - 2] : hostParts[0];
      if (hostParts.length >= 3) {
        const tld = hostParts[hostParts.length - 1];
        const secondLevel = hostParts[hostParts.length - 2];
        if (
          tld.length === 2 &&
          ['co', 'com', 'org', 'net', 'gov', 'edu', 'ac'].includes(secondLevel.toLowerCase())
        ) {
          domainToken = hostParts[hostParts.length - 3];
        }
      }

      return toTitleCase(domainToken.replace(/[-_]+/g, ' '));
    } catch {
      return '';
    }
  };

  const getPageTitleFromUrl = (normalizedUrl = '') => {
    try {
      const parsed = new URL(normalizedUrl);
      const segments = parsed.pathname.split('/').filter(Boolean);
      const lastSegment = decodeURIComponent(segments[segments.length - 1] || '')
        .replace(/\.[a-z0-9]{1,6}$/i, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!lastSegment) return 'Web page';
      return lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1);
    } catch {
      return 'Web page';
    }
  };

  const inferReferenceYear = (...values) => {
    const combined = values
      .map((value) => String(value || ''))
      .join(' ');
    const matchedYear = combined.match(/\b(?:19|20)\d{2}\b/);
    return matchedYear ? matchedYear[0] : 'n.d.';
  };

  const formatReferenceAsApa = (reference = {}) => {
    const normalizedUrl = normalizeReferenceUrl(reference.url || '');
    if (!normalizedUrl) return String(reference.label || '').trim();

    const normalizedLabel = String(reference.label || '').replace(/\s+/g, ' ').trim();
    const shouldUseLabelAsTitle = normalizedLabel && !isUrlLikeLabel(normalizedLabel) && normalizedLabel !== normalizedUrl;

    const siteName = getSiteNameFromUrl(normalizedUrl) || 'Unknown source';
    const title = shouldUseLabelAsTitle ? normalizedLabel.replace(/[.]+$/g, '') : getPageTitleFromUrl(normalizedUrl);
    const year = inferReferenceYear(normalizedLabel, normalizedUrl);

    return `${siteName}. (${year}). ${title}.`;
  };

  // Shuffle array utility (Fisher-Yates)
  const shuffleArray = (arr) => {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Build shuffled questions for a review (shuffles options, remaps correctAnswer)
  const buildShuffledQuestions = (questions) => {
    return questions.map(q => {
      const correctOption = q.options[q.correctAnswer];
      const shuffledOptions = shuffleArray([...q.options]);
      const newCorrectAnswer = shuffledOptions.indexOf(correctOption);
      return { ...q, options: shuffledOptions, correctAnswer: newCorrectAnswer };
    });
  };

  // Helper function to convert number to Roman numeral
  const toRoman = (num) => {
    const romanNumerals = [
      ['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1]
    ];
    let result = '';
    for (const [roman, value] of romanNumerals) {
      while (num >= value) {
        result += roman;
        num -= value;
      }
    }
    return result;
  };

  const shouldRunDiagnosticBeforeIntro = (roadmapStages = []) => {
    if (!Array.isArray(roadmapStages) || roadmapStages.length === 0) {
      return false;
    }

    const stageTypes = roadmapStages
      .map((stage) => String(stage?.type || '').trim().toLowerCase())
      .filter(Boolean);

    const diagnosticIndex = stageTypes.indexOf('diagnostic');
    const introductionIndex = stageTypes.indexOf('introduction');

    if (diagnosticIndex === -1 || introductionIndex === -1) {
      return false;
    }

    return diagnosticIndex < introductionIndex;
  };

  const readSavedLessonProgress = () => {
    if (!lessonProgressStorageKey) return null;

    try {
      const raw = localStorage.getItem(lessonProgressStorageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      return parsed;
    } catch (err) {
      console.warn('Failed to parse saved lesson progress:', err);
      return null;
    }
  };

  useEffect(() => {
    progressHydratedRef.current = false;
  }, [lessonProgressStorageKey]);

  useEffect(() => {
    progressSyncRef.current = { moduleId: Number(moduleId), completionRate: null };
  }, [moduleId]);
  
  // Check if this is a review request (coming from failed assessment)
  useEffect(() => {
    const review = searchParams.get('review');
    if (review === 'true') {
      setIsReviewMode(true);
      // In review mode, skip diagnostic and go straight to content
      setShowDiagnostic(false);
      setDiagnosticCompleted(true);
    }
  }, [searchParams]);

  // Module content structure based on your lesson outline
  const moduleContent = {
    1: {
      title: 'Introduction to Computer Hardware Servicing',
      diagnostic: [
        {
          question: 'What is a CPU?',
          options: [
            'A storage device used to permanently save files and programs',
            'The main processing unit that executes instructions and runs computer operations',
            'A hardware component that supplies electrical power to the computer',
            'A device that displays visual output from the computer'
          ],
          correctAnswer: 'The main processing unit that executes instructions and runs computer operations'
        },
        {
          question: 'Which of the following is NOT a computer hardware component?',
          options: [
            'RAM (Random Access Memory)',
            'Operating System',
            'Motherboard',
            'Hard Drive'
          ],
          correctAnswer: 'Operating System'
        },
        {
          question: 'What tool is primarily used to prevent electrostatic discharge when handling computer components?',
          options: [
            'Screwdriver',
            'Anti-static wrist strap',
            'Multimeter',
            'Cable tester'
          ],
          correctAnswer: 'Anti-static wrist strap'
        },
        {
          question: 'What does RAM stand for?',
          options: [
            'Random Access Memory',
            'Read And Modify',
            'Rapid Application Management',
            'Remote Access Module'
          ],
          correctAnswer: 'Random Access Memory'
        },
        {
          question: 'Which component is considered the "brain" of the computer?',
          options: [
            'Hard Drive',
            'RAM',
            'CPU',
            'Power Supply'
          ],
          correctAnswer: 'CPU'
        }
      ],
      topics: [
        {
          title: 'What is Computer Hardware Servicing?',
          content: `When it comes to the technological demands of the modern times, where our everyday lives are integrated with one or more devices to function, the ability to understand how these devices work, how it can be repaired in case of experiencing issues, and maintaining its quality and performance became an essential skill to have. Specifically, since computers have become essential to business operations, communication, education, and entertainment[1], ensuring that a professional possessing these skills can help these fields manage and operate their work efficiently on a daily basis.

Computer Hardware Servicing (CHS) is the procedural workflow of installing, repairing, and maintaining hardware components of a computer[2]. On your learning path, we will be discussing the parts of a computer, the tools needed to perform hardware components assembly repair, and maintenance, and the practices that serve as the foundation of skill a computer technician must have. This also covers the specific processes of configuring system tools and settings, installing software, and proper documentation.`,
          assessment: [
            {
              question: 'From the choices below, which does not belong to the workflow of Computer Hardware Servicing?',
              options: ['Repairing', 'Maintenance', 'Coding Games', 'Installing computer hardware components'],
              correctAnswer: 'Coding Games'
            }
          ]
        },
        {
          title: 'Importance of Computer Hardware Servicing',
          content: `CHS encompasses basic troubleshooting skills, performing complex repairs, and understanding the types, functions, and specifications of various hardware components[3]. But why does having skills related to CHS relevant today? As discussed previously, computers had become crucial to every day activities and operations in various professional fields. Over time, its hardware components degrade or get damaged due to numerous reasons, all of which will be further discussed along your learning path. Professionals trained to perform CHS responsibilities address these concerns to ensure the optimal operation of the computers they are handling. The following points highlight the importance of CHS:

• Performance - Upgrading and tuning hardware components and systems make computer performance optimal, making the experience better for the users. Mitigating performance degrading issues, like overheating caused by dust buildup, is one of the major importance of CHS.[3][4]

• Cost Efficiency - Maintenance and regular checks help by being proactive with addressing minor issues, which can prevent further escalation to major issues that may require expensive resolutions.[4]

• Data Protection - System downs and failures may lead to the loss of important data stored in computers. Identifying risks of such scenarios can minimize potential damages to data beforehand.[3][4]

• Longevity - Habitual actions to maintaining computer hardware components extends its lifespan, as expensive costs and frequent reconfiguration may be experienced if neglected.[3][4]

• Safety - Faulty components may trigger safety hazards, such as electrical fires due and overheating; Possessing CHS related skills helps identify possible risks and design correct course of action to prevent safety risks.[3]`,
          assessment: [
            {
              question: 'What is expected from computer hardware components as time goes by?',
              options: [
                'Its performance improves',
                'Hardware components require duplicates',
                'It degrades and may have damages due to various factors',
                'Hardware components stops working completely at any moment'
              ],
              correctAnswer: 'It degrades and may have damages due to various factors'
            },
            {
              question: 'Which importance of CHS highlights the potential to minimize the need for expensive resolutions?',
              options: ['Cost Efficiency', 'Longevity', 'Data Protection', 'Performance'],
              correctAnswer: 'Cost Efficiency'
            },
            {
              question: 'Which of the following descriptions highlights the importance of CHS as it prevents computers and its parts to be replaced as long as possible?',
              options: ['Performance', 'Longevity', 'Cost Efficiency', 'Safety'],
              correctAnswer: 'Longevity'
            }
          ]
        }
      ]
    }
  };

  useEffect(() => {
    fetchModuleData();
  }, [moduleId]);

  useEffect(() => {
    // Load performance data for current topic
    if (moduleId && currentTopic !== null) {
      loadTopicPerformance();
    }
  }, [moduleId, currentTopic]);

  const loadTopicPerformance = () => {
    const perf = getPerformance(moduleId, currentTopic);
    setTopicPerformance(perf);
    
    if (perf) {
      const difficulty = getDifficultyLevel(perf);
      setCurrentDifficulty(difficulty);
    } else {
      setCurrentDifficulty(DIFFICULTY_LEVELS.NORMAL);
    }
  };

  const fetchModuleData = async () => {
    try {
      setLoading(true);
      const response = await axios.get(withPreferredLanguage(`/modules/${moduleId}?userId=${user.userId}`));
      const diagnosticBeforeIntro = shouldRunDiagnosticBeforeIntro(response.data.roadmapStages);

      try {
        await axios.post('/progress/start', { moduleId: Number(moduleId) });
      } catch (progressStartError) {
        console.error('Error opening module progress:', progressStartError);
      }

      const savedLessonProgress = readSavedLessonProgress();
      
      setModule(response.data);
      
      console.log('Fetched module data:', response.data);
      console.log('Sections:', response.data.sections);
      console.log('Diagnostic Questions:', response.data.diagnosticQuestions);
      console.log('Review Questions:', response.data.reviewQuestions);
      console.log('Final Questions:', response.data.finalQuestions);

      // Restore saved local lesson session state (topic/page/review progress) when available.
      if (savedLessonProgress) {
        const toObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
        const hardcodedTopicCount = moduleContent[moduleId]?.topics?.length || 0;
        const savedCurrentTopic = Number.isInteger(savedLessonProgress.currentTopic) ? savedLessonProgress.currentTopic : 0;
        const maxTopicIndex = hardcodedTopicCount > 0 ? hardcodedTopicCount - 1 : savedCurrentTopic;

        setCurrentTopic(Math.max(0, Math.min(savedCurrentTopic, maxTopicIndex)));
        setCurrentTopicPage(Math.max(0, Number.isInteger(savedLessonProgress.currentTopicPage) ? savedLessonProgress.currentTopicPage : 0));
        setShowLessonIntro(
          typeof savedLessonProgress.showLessonIntro === 'boolean'
            ? savedLessonProgress.showLessonIntro
            : !diagnosticBeforeIntro
        );
        setTopicCompleted(toObject(savedLessonProgress.topicCompleted));
        setCompletedReviews(toObject(savedLessonProgress.completedReviews));
        setReviewResults(toObject(savedLessonProgress.reviewResults));
        setReviewAttempts(toObject(savedLessonProgress.reviewAttempts));

        const restoredCooldowns = Object.entries(toObject(savedLessonProgress.reviewCooldowns)).reduce((acc, [key, value]) => {
          const endAt = Number(value);
          if (Number.isFinite(endAt) && endAt > Date.now()) {
            acc[key] = endAt;
          }
          return acc;
        }, {});
        setReviewCooldowns(restoredCooldowns);
      } else {
        setShowLessonIntro(!diagnosticBeforeIntro);
      }
      
      // Check if this is review mode (from URL param)
      const review = searchParams.get('review');
      if (review === 'true') {
        // In review mode, skip diagnostic and show content directly
        setShowDiagnostic(false);
        setDiagnosticCompleted(true);
        setIsReviewMode(true);
        progressHydratedRef.current = true;
        setLoading(false);
        return;
      }

      // Show diagnostic if module has diagnostic questions
      const hasDiagnosticQuestions = response.data.diagnosticQuestions && response.data.diagnosticQuestions.length > 0;
      
      console.log('Has diagnostic questions:', hasDiagnosticQuestions);
      
      if (hasDiagnosticQuestions) {
        const hasSavedDiagnostic = savedLessonProgress?.diagnosticCompleted === true;
        if (hasSavedDiagnostic) {
          setDiagnosticCompleted(true);
          setShowDiagnostic(false);
          if (typeof savedLessonProgress.diagnosticScore === 'number') {
            setDiagnosticScore(savedLessonProgress.diagnosticScore);
          }
        } else {
          console.log('Setting showDiagnostic to true');
          setShowDiagnostic(true);
          setDiagnosticCompleted(false);
          if (diagnosticBeforeIntro) {
            setShowLessonIntro(false);
          }
        }
      } else {
        console.log('No diagnostic questions - going to content');
        setDiagnosticCompleted(true);
        setShowDiagnostic(false);
      }

      progressHydratedRef.current = true;
      setLoading(false);
    } catch (err) {
      console.error('Error fetching module:', err);
      setLoading(false);
    }
  };

  const handleTopicComplete = (topicIndex) => {
    setTopicCompleted({ ...topicCompleted, [topicIndex]: true });
    setShowQuickAssessment(false);
    
    // Reload performance data to update difficulty and challenge availability
    loadTopicPerformance();
    
    // Move to next topic or complete module
    const content = moduleContent[moduleId];
    if (content && topicIndex < content.topics.length - 1) {
      setCurrentTopic(topicIndex + 1);
    } else {
      // All topics completed - update progress
      updateModuleProgress(100);
    }
  };

  const handleDiagnosticComplete = (score) => {
    const diagnosticKey = `diagnostic_completed_${moduleId}`;
    localStorage.setItem(diagnosticKey, 'true');
    localStorage.setItem(`diagnostic_score_${moduleId}`, score.toString());
    setDiagnosticScore(score);
    setDiagnosticCompleted(true);
    setShowDiagnostic(false);
  };

  const handleDiagnosticSkip = () => {
    const diagnosticKey = `diagnostic_completed_${moduleId}`;
    localStorage.setItem(diagnosticKey, 'true');
    setDiagnosticCompleted(true);
    setShowDiagnostic(false);
  };

  const handleDiagnosticBack = () => {
    navigate('/lessons');
  };

  const updateModuleProgress = async (completionRate, options = {}) => {
    const { navigateOnComplete = true } = options;
    const numericModuleId = parseInt(moduleId, 10);

    const persistProgress = async () => {
      await axios.put('/progress/update', {
        moduleId: numericModuleId,
        completionRate
      });
    };

    try {
      await persistProgress();

      if (completionRate >= 100 && navigateOnComplete) {
        navigate('/dashboard');
      }
    } catch (err) {
      if (err?.response?.status === 404) {
        try {
          await axios.post('/progress/start', { moduleId: numericModuleId });
          await persistProgress();

          if (completionRate >= 100 && navigateOnComplete) {
            navigate('/dashboard');
          }
          return;
        } catch (retryErr) {
          console.error('Error updating progress after starting module:', retryErr);
          return;
        }
      }

      console.error('Error updating progress:', err);
    }
  };

  useEffect(() => {
    if (loading || !module) return;

    const numericModuleId = Number.parseInt(moduleId, 10);
    if (!Number.isFinite(numericModuleId)) return;

    const shouldTrackLessonTime = !showQuickAssessment && !showDiagnostic && !activeReview;
    if (!shouldTrackLessonTime) return;

    let isDisposed = false;

    const flushLessonTime = async () => {
      if (lessonTimeFlushInFlightRef.current) return;

      const bufferedSeconds = Math.floor(Number(lessonTimeBufferRef.current || 0));
      if (bufferedSeconds <= 0) return;

      lessonTimeBufferRef.current = 0;
      lessonTimeFlushInFlightRef.current = true;

      try {
        await axios.post('/progress/track-time', {
          moduleId: numericModuleId,
          timeSpentSeconds: bufferedSeconds,
        });
      } catch (error) {
        if (!isDisposed) {
          lessonTimeBufferRef.current += bufferedSeconds;
          console.error('Error tracking lesson time:', error);
        }
      } finally {
        lessonTimeFlushInFlightRef.current = false;
      }
    };

    const handleTick = () => {
      if (document.visibilityState !== 'visible') return;

      lessonTimeBufferRef.current += 10;
      if (lessonTimeBufferRef.current >= 30) {
        flushLessonTime();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushLessonTime();
      }
    };

    const intervalId = setInterval(handleTick, 10000);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isDisposed = true;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      const bufferedSeconds = Math.floor(Number(lessonTimeBufferRef.current || 0));
      if (bufferedSeconds > 0) {
        axios.post('/progress/track-time', {
          moduleId: numericModuleId,
          timeSpentSeconds: bufferedSeconds,
        }).catch(() => {});
        lessonTimeBufferRef.current = 0;
      }
    };
  }, [moduleId, module, loading, showQuickAssessment, showDiagnostic, activeReview]);

  const handleShowQuickAssessment = () => {
    setShowQuickAssessment(true);
  };

  // Use sections from database if available, otherwise fall back to hardcoded content
  const lessonSections = module?.sections || [];
  const isDbLessonModeActive = lessonSections.length > 0 && !showQuickAssessment;
  const referenceLinks = useMemo(() => {
    if (!lessonSections.length) return [];

    const links = [];
    const seen = new Set();

    lessonSections.forEach((section) => {
      if (normalizeLessonSectionType(section?.type) !== 'references') return;

      extractReferenceLinks(section.content || '').forEach((link) => {
        const key = link.url.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        links.push(link);
      });
    });

    return links;
  }, [lessonSections]);

  const apaReferences = referenceLinks.map((reference) => ({
    ...reference,
    apaCitation: formatReferenceAsApa(reference),
  }));

  useEffect(() => {
    if (!referenceLinks.length) {
      setShowReferencesPanel(false);
    }
  }, [referenceLinks.length]);

  useEffect(() => {
    if (!isDbLessonModeActive) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [isDbLessonModeActive]);

  useEffect(() => {
    setShowLessonIntro(true);
    setCurrentTopicPage(0);
  }, [moduleId]);

  useEffect(() => {
    if (!lessonProgressStorageKey || !module || loading || !progressHydratedRef.current) return;

    const snapshot = {
      moduleId: Number(moduleId),
      userId: user?.userId,
      currentTopic,
      topicCompleted,
      currentTopicPage,
      showLessonIntro,
      completedReviews,
      reviewResults,
      reviewCooldowns,
      reviewAttempts,
      diagnosticCompleted,
      diagnosticScore,
      updatedAt: Date.now()
    };

    try {
      localStorage.setItem(lessonProgressStorageKey, JSON.stringify(snapshot));
    } catch (err) {
      console.warn('Failed to save lesson progress snapshot:', err);
    }
  }, [
    lessonProgressStorageKey,
    module,
    loading,
    moduleId,
    user?.userId,
    currentTopic,
    topicCompleted,
    currentTopicPage,
    showLessonIntro,
    completedReviews,
    reviewResults,
    reviewCooldowns,
    reviewAttempts,
    diagnosticCompleted,
    diagnosticScore
  ]);

  // Group sections into topic-based pages for paginated view
  const topicPages = useMemo(() => {
    if (!lessonSections.length) return [];
    const pages = [];
    let currentPage = [];
    
    lessonSections.forEach((section, index) => {
      const sectionType = normalizeLessonSectionType(section?.type);
      // Start a new page when we hit a topic title (but not for the very first one if currentPage is empty)
      if (sectionType === 'topic' && currentPage.length > 0) {
        pages.push(currentPage);
        currentPage = [];
      }
      currentPage.push({ ...section, originalIndex: index });
    });
    // Push the last page
    if (currentPage.length > 0) {
      pages.push(currentPage);
    }
    return pages;
  }, [lessonSections]);

  useEffect(() => {
    if (!topicPages.length) return;
    if (currentTopicPage > topicPages.length - 1) {
      setCurrentTopicPage(topicPages.length - 1);
    }
  }, [topicPages.length, currentTopicPage]);

  useEffect(() => {
    if (!lessonSections.length || !topicPages.length || showLessonIntro || showQuickAssessment || loading) {
      return;
    }

    const existingCompletion = Number(module?.CompletionRate || 0);
    if (existingCompletion >= 100) {
      return;
    }

    const pageProgress = Math.round((currentTopicPage / topicPages.length) * 100);
    const nextCompletion = Math.max(existingCompletion, Math.max(0, Math.min(99, pageProgress)));

    if (nextCompletion <= 0) {
      return;
    }

    const numericModuleId = Number(moduleId);
    const lastSynced = progressSyncRef.current;
    if (lastSynced.moduleId === numericModuleId && lastSynced.completionRate === nextCompletion) {
      return;
    }

    progressSyncRef.current = { moduleId: numericModuleId, completionRate: nextCompletion };
    updateModuleProgress(nextCompletion, { navigateOnComplete: false });
  }, [lessonSections.length, topicPages.length, showLessonIntro, showQuickAssessment, loading, module?.CompletionRate, currentTopicPage, moduleId]);

  // Navigate to a topic page and scroll content to top
  const goToTopicPage = (pageIndex) => {
    setCurrentTopicPage(pageIndex);
    if (contentScrollRef.current) {
      contentScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Check if all review sections on a given topic page are completed
  const arePageReviewsCompleted = (pageIndex) => {
    const page = topicPages[pageIndex];
    if (!page) return true;
    for (const section of page) {
      const sType = normalizeLessonSectionType(section?.type);
      if (sType === 'review' || sType === 'review - multiple choice' || sType === 'review-multiple-choice') {
        const reviewId = section.id || `review-mc-${section.originalIndex}`;
        if (!completedReviews[reviewId]) return false;
      }
      if (sType === 'review - drag and drop' || sType === 'review-drag-drop' || sType === 'simulation') {
        const dndId = section.id || `review-dnd-${section.originalIndex}`;
        if (!completedReviews[dndId]) return false;
      }
    }
    return true;
  };

  // Check if a topic page is accessible (all reviews on all previous pages completed)
  const isTopicPageAccessible = (pageIndex) => {
    if (pageIndex === 0) return true;
    for (let i = 0; i < pageIndex; i++) {
      if (!arePageReviewsCompleted(i)) return false;
    }
    return true;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center h-96">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  if (!module) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="w-full px-8 py-8">
          <div className="bg-error/20 border border-error text-error px-4 py-3 rounded-lg">
            Module not found
          </div>
        </div>
      </div>
    );
  }

  const content = moduleContent[moduleId];

  // Debug log the current state
  console.log('Render state - showDiagnostic:', showDiagnostic, 'diagnosticCompleted:', diagnosticCompleted);
  console.log('Module diagnostic questions:', module?.diagnosticQuestions?.length);

  const introStageVisible = lessonSections.length > 0 && !showQuickAssessment && showLessonIntro;

  // FIRST: Show diagnostic if not completed and diagnostic questions exist
  if (!introStageVisible && showDiagnostic && module?.diagnosticQuestions && module.diagnosticQuestions.length > 0) {
    console.log('Rendering Diagnostic component');
    return (
      <Diagnostic
        questions={module.diagnosticQuestions}
        onComplete={handleDiagnosticComplete}
        moduleId={moduleId}
        onBack={handleDiagnosticBack}
        preferredLanguage={localStorage.getItem('preferredLanguage') || 'English'}
        onSkip={null}
      />
    );
  }
  
  const currentTopicData = content?.topics[currentTopic];

  return (
    <div className={`${isDbLessonModeActive ? 'h-screen overflow-hidden' : 'min-h-screen'} bg-background`}>
      {/* Only show navbar if using hardcoded content */}}
      {!lessonSections.length && <Navbar />}
      
      <div className={`${lessonSections.length > 0 ? '' : 'w-full px-8 py-8 custom-scrollbar'}`}>
        {/* Module Header - Only show if NOT using database content */}
        {!lessonSections.length && (
        <div className="mb-6">
          <button
            onClick={() => navigate('/')}
            className="text-primary mb-4 flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Modules
          </button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">{module.ModuleTitle}</h1>
              <p className="text-text-secondary">{module.Description}</p>
            </div>
            <div className="text-right">
              <div className="text-sm text-text-secondary mb-1">Progress</div>
              <div className="text-2xl font-bold text-primary">
                {parseFloat(module.CompletionRate || 0).toFixed(0)}%
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Topic Navigation - Show only if using hardcoded content */}
        {content && !lessonSections.length && (
          <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
            {content.topics.map((topic, index) => {
              // Topic is accessible if it's completed OR if all previous topics are completed
              const isAccessible = index === 0 || topicCompleted[index - 1];
              const isLocked = !isAccessible && index !== currentTopic;
              
              return (
                <button
                  key={index}
                  onClick={() => isAccessible && setCurrentTopic(index)}
                  disabled={isLocked}
                  className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap ${
                    currentTopic === index
                      ? 'bg-primary text-background'
                      : topicCompleted[index]
                      ? 'bg-success/20 text-success border border-success'
                      : isLocked
                      ? 'bg-gray-400 text-gray-600 cursor-not-allowed opacity-50'
                      : 'bg-background-light text-text-primary'
                  }`}
                >
                  {isLocked && (
                    <svg className="w-3 h-3 inline mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                  )}
                  Topic {index + 1}
                  {topicCompleted[index] && (
                    <svg className="w-4 h-4 inline ml-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Lesson Intro Page from Database */}
        {lessonSections.length > 0 && !showQuickAssessment && showLessonIntro && (
          <div className="fixed inset-0 z-40 bg-background flex items-center justify-center px-6">
            <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl border border-gray-200 p-10 relative">
              <button
                onClick={() => navigate('/dashboard')}
                className="absolute top-5 left-5 p-2 rounded-lg hover:bg-gray-100 text-primary"
                title="Back to Learning Path"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5" />
                  <path d="M12 19l-7-7 7-7" />
                </svg>
              </button>

              <div className="pt-6 pb-20">
                <p className="text-sm font-semibold text-highlight-dark uppercase tracking-wider mb-3 text-center">
                  Lesson {module.LessonOrder}
                </p>
                <h1 className="text-4xl font-bold text-primary mb-5 max-w-3xl mx-auto text-center">
                  {toPlainText(module.ModuleTitle) || 'Untitled Lesson'}
                </h1>
                <div
                  className="text-lg text-gray-600 leading-relaxed max-w-3xl mx-auto lesson-content"
                  dangerouslySetInnerHTML={{ __html: decodeHtmlEntities(module.Description || 'Start this lesson to begin learning.') }}
                ></div>
              </div>

              <div className="absolute bottom-6 right-6">
                <button
                  onClick={() => {
                    setShowLessonIntro(false);
                    goToTopicPage(0);
                  }}
                  className="px-8 py-3 bg-highlight hover:bg-highlight-dark text-white rounded-xl font-semibold shadow-lg transition-colors flex items-center gap-2"
                >
                  Start Learning
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Lesson Content from Database */}
        {lessonSections.length > 0 && !showQuickAssessment && !showLessonIntro && (
          <>
          <div className="fixed inset-0 z-40 flex">

            {/* Sidebar - Always visible */}
            <div className="w-80 min-w-[320px] bg-white shadow-2xl z-50 flex flex-col">
              {/* Sidebar Header */}
              <div className="p-6 border-b border-gray-200">
                <button 
                  onClick={() => navigate('/dashboard')}
                  className="flex items-center gap-3 text-primary group hover:text-highlight-dark transition-colors"
                >
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5" />
                    <path d="M12 19l-7-7 7-7" />
                  </svg>
                  <span className="font-medium">Back to Learning Path</span>
                </button>
              </div>

              {/* Sidebar Content */}
              <div className="flex-1 overflow-y-auto p-6">
                <h3 className="text-lg font-bold text-primary mb-4">Lesson Topics</h3>
                
                {/* Topic List */}
                <div className="space-y-1">
                  {(() => {
                    // Build hierarchical structure from sections
                    const topicHierarchy = [];
                    let currentTopicItem = null;
                    let pageIndex = -1;
                    
                    lessonSections.forEach((section, index) => {
                      const sectionType = normalizeLessonSectionType(section?.type);
                      if (sectionType === 'topic') {
                        pageIndex++;
                        currentTopicItem = {
                          id: index,
                          pageIndex: pageIndex,
                          title: section.title || section.content,
                          subtopics: []
                        };
                        topicHierarchy.push(currentTopicItem);
                      } else if (sectionType === 'subtopic' && currentTopicItem) {
                        currentTopicItem.subtopics.push({
                          id: index,
                          title: section.title || section.content
                        });
                      }
                    });

                    return topicHierarchy.map((topic, topicIndex) => (
                      <div key={topic.id} className="mb-3">
                        {/* Topic Title */}
                        {(() => {
                          const accessible = isTopicPageAccessible(topic.pageIndex);
                          return (
                            <button
                              onClick={() => {
                                if (accessible) goToTopicPage(topic.pageIndex);
                              }}
                              className={`w-full text-left font-bold py-2 px-2 rounded-lg transition-colors flex items-center gap-2 ${
                                !accessible
                                  ? 'text-gray-400 cursor-not-allowed'
                                  : currentTopicPage === topic.pageIndex
                                  ? 'text-highlight-dark bg-highlight/10'
                                  : 'text-primary hover:bg-gray-100'
                              }`}
                              title={!accessible ? 'Complete all review questions on previous topics first' : ''}
                            >
                              {!accessible && (
                                <svg className="w-4 h-4 flex-shrink-0 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                </svg>
                              )}
                              <span dangerouslySetInnerHTML={{ __html: topic.title }} />
                            </button>
                          );
                        })()}
                        
                        {/* Subtopics - only show for current topic page */}
                        {topic.subtopics.length > 0 && currentTopicPage === topic.pageIndex && (
                          <div className="ml-4 mt-1 space-y-1 border-l-2 border-highlight/30 pl-4">
                            {topic.subtopics.map((subtopic) => (
                              <button
                                key={subtopic.id}
                                onClick={() => {
                                  goToTopicPage(topic.pageIndex);
                                  setTimeout(() => {
                                    document.getElementById(`section-${subtopic.id}`)?.scrollIntoView({ behavior: 'smooth' });
                                  }, 100);
                                }}
                                className="w-full text-left text-sm py-1 text-gray-600 hover:text-highlight-dark transition-colors"
                                dangerouslySetInnerHTML={{ __html: subtopic.title }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {/* Sidebar Actions */}
              <div className="p-6 border-t border-gray-200 space-y-3">
                <button
                  onClick={() => {
                    if (referenceLinks.length) {
                      setShowReferencesPanel(true);
                    }
                  }}
                  disabled={!referenceLinks.length}
                  className={`flex items-center gap-3 w-full transition-colors ${
                    referenceLinks.length
                      ? 'text-primary hover:text-highlight-dark'
                      : 'text-gray-400 cursor-not-allowed'
                  }`}
                  title={
                    referenceLinks.length
                      ? `Open ${referenceLinks.length} reference link${referenceLinks.length > 1 ? 's' : ''}`
                      : 'No references added yet'
                  }
                >
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <span className="font-medium">References</span>
                  {referenceLinks.length > 0 && (
                    <span className="ml-auto text-xs font-semibold bg-highlight/15 text-primary px-2 py-1 rounded-full">
                      {referenceLinks.length}
                    </span>
                  )}
                </button>
                <button 
                  onClick={() => setShowReportModal(true)}
                  className="flex items-center gap-3 text-primary w-full hover:text-error transition-colors"
                >
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                    <line x1="4" y1="22" x2="4" y2="15" />
                  </svg>
                  <span className="font-medium">Report An Issue</span>
                </button>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col">
              {/* Header - Matching image design exactly */}
              <div className="bg-primary text-white py-5 px-8 flex items-center gap-4 shadow-md">
                <h1 className="text-2xl font-bold">
                  {toRoman(module.LessonOrder)}.  {toPlainText(module.ModuleTitle)}
                </h1>
              </div>

              {/* Scrollable Content - Clean white background with teal scrollbar */}
              <div ref={contentScrollRef} className="flex-1 overflow-y-auto bg-white">
                <div className="w-[92%] lg:w-[80%] mx-auto px-4 md:px-6 lg:px-8 py-10 lg:py-12">
                  {/* Topic page indicator */}
                  {topicPages.length > 1 && (
                    <div className="mb-6 text-sm text-gray-500 font-medium">
                      Topic {currentTopicPage + 1} of {topicPages.length}
                    </div>
                  )}
                  
                  {(topicPages[currentTopicPage] || []).map((section) => {
                    const index = section.originalIndex;
                    // Normalize type to handle both formats (lowercase from DB, or capitalized)
                    const sectionType = normalizeLessonSectionType(section?.type);
                    
                    switch(sectionType) {
                      case 'topic':
                        return (
                          <div key={index} id={`section-${index}`} className="mb-8 pb-8 border-b border-border-light scroll-mt-20">
                            <h2 
                              className="text-4xl lg:text-5xl font-bold text-primary mb-6" 
                              dangerouslySetInnerHTML={{ __html: section.title || section.content }}
                            ></h2>
                          </div>
                        );
                      case 'subtopic':
                        return (
                          <div key={index} id={`section-${index}`} className="mb-6 scroll-mt-20">
                            <h3 
                              className="text-2xl lg:text-3xl font-bold text-text-primary mb-4 mt-8" 
                              dangerouslySetInnerHTML={{ __html: section.title || section.content }}
                            ></h3>
                          </div>
                        );
                      case 'paragraph':
                        return (
                          <div key={index} className="mb-5">
                            {section.contentLayout === 'table' && section.tableData ? (
                              (() => {
                                const tableHeaders = Array.isArray(section.tableData.headers)
                                  ? section.tableData.headers
                                  : [];
                                const tableRows = Array.isArray(section.tableData.rows) ? section.tableData.rows : [];
                                const sourceRows = tableRows.length > 0
                                  ? tableRows
                                  : [new Array(Math.max(1, tableHeaders.length || 0)).fill('')];
                                const inferredColumnCount = Math.max(
                                  tableHeaders.length,
                                  ...sourceRows.map((row) => (Array.isArray(row) ? row.length : 0)),
                                  1
                                );
                                const tableTitle = String(section.tableData?.title || section.tableTitle || '');
                                const normalizedHeaders = Array.from(
                                  { length: inferredColumnCount },
                                  (_, cIdx) => String(tableHeaders[cIdx] || '')
                                );
                                const tableHeaderSpans = normalizeTableHeaderSpans(
                                  section.tableData.headerSpans,
                                  inferredColumnCount
                                );
                                const normalizedRows = sourceRows.map((row) => {
                                  const nextRow = Array.isArray(row)
                                    ? row.slice(0, inferredColumnCount).map((cell) => String(cell || ''))
                                    : [];
                                  while (nextRow.length < inferredColumnCount) {
                                    nextRow.push('');
                                  }
                                  return nextRow;
                                });
                                const rowSpanMatrix = normalizedRows.map((_, rowIdx) =>
                                  normalizeTableHeaderSpans(section.tableData.rowCellSpans?.[rowIdx], inferredColumnCount)
                                );
                                const showHeaderRow = normalizedHeaders.some((header, cIdx) => {
                                  if ((tableHeaderSpans[cIdx] || 0) <= 0) return false;
                                  const plainText = String(header).replace(/<[^>]*>/g, '').trim();
                                  return plainText.length > 0;
                                }) || tableHeaderSpans.some((span) => span > 1);

                                return (
                                  <div className="rounded-lg border border-gray-200 overflow-hidden">
                                    <div className="overflow-x-auto">
                                      <table className="w-full border-collapse">
                                        <thead>
                                          {tableTitle && (
                                            <tr className="bg-primary-light/10 border-b border-gray-200">
                                              <th colSpan={inferredColumnCount} className="px-4 py-3 text-left">
                                                <div className="table-rich-content text-sm font-bold text-primary" dangerouslySetInnerHTML={{ __html: normalizeRichTextHtml(tableTitle) }} />
                                              </th>
                                            </tr>
                                          )}
                                          {showHeaderRow && (
                                            <tr className="bg-primary-light/10 border-b border-gray-200">
                                              {normalizedHeaders.map((header, cIdx) => {
                                                const headerColSpan = tableHeaderSpans[cIdx] || 0;
                                                if (headerColSpan <= 0) return null;
                                                const hasRightBorder = cIdx + headerColSpan < inferredColumnCount;

                                                return (
                                                  <th
                                                    key={`table-header-${cIdx}`}
                                                    colSpan={headerColSpan}
                                                    className={`px-4 py-3 text-center text-sm font-semibold text-primary align-top break-words ${hasRightBorder ? 'border-r border-gray-100' : ''}`}
                                                  >
                                                    <div className="table-rich-content" dangerouslySetInnerHTML={{ __html: normalizeRichTextHtml(header || '') }} />
                                                  </th>
                                                );
                                              })}
                                            </tr>
                                          )}
                                        </thead>
                                        <tbody>
                                          {normalizedRows.map((rowCells, rIdx) => {
                                            const rowSpans = rowSpanMatrix[rIdx];

                                            return (
                                              <tr key={rIdx} className={`border-t border-gray-200 ${rIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/80'}`}>
                                                {rowCells.map((cell, cIdx) => {
                                                  const cellColSpan = rowSpans[cIdx] || 0;
                                                  if (cellColSpan <= 0) return null;
                                                  const hasRightBorder = cIdx + cellColSpan < inferredColumnCount;

                                                  return (
                                                    <td
                                                      key={`table-cell-${rIdx}-${cIdx}`}
                                                      colSpan={cellColSpan}
                                                      className={`px-4 py-3 text-lg text-text-primary ${hasRightBorder ? 'border-r border-gray-100' : ''} align-top break-words`}
                                                    >
                                                      <div className="table-rich-content" dangerouslySetInnerHTML={{ __html: normalizeRichTextHtml(cell || '') }} />
                                                    </td>
                                                  );
                                                })}
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                );
                              })()
                            ) : (
                              <div 
                                className="lesson-content text-xl text-text-primary leading-relaxed" 
                                dangerouslySetInnerHTML={{ __html: normalizeRichTextHtml(section.content) }}
                              ></div>
                            )}
                          </div>
                        );
                      case 'bullet':
                      case 'bullet list':
                        return (
                          <div key={index} className="mb-6">
                            <ul className="list-disc list-outside space-y-3 text-xl text-text-primary ml-8 leading-relaxed">
                              {(section.content || '').split('\n').filter(item => item.trim()).map((item, i) => (
                                <li key={i} className="pl-2">{item.replace(/^[•\-]\s*/, '')}</li>
                              ))}
                            </ul>
                          </div>
                        );
                      case 'numbered':
                      case 'numbered list':
                        return (
                          <div key={index} className="mb-6">
                            <ol className="list-decimal list-outside space-y-3 text-xl text-text-primary ml-8 leading-relaxed">
                              {(section.content || '').split('\n').filter(item => item.trim()).map((item, i) => (
                                <li key={i} className="pl-2">{item.replace(/^\d+[.)\-]\s*/, '')}</li>
                              ))}
                            </ol>
                          </div>
                        );
                      case 'image':
                        // Build proper image URL
                        const buildImgUrl = (url) => {
                          if (!url) return '';
                          if (url.startsWith('/uploads')) return `${API_SERVER_URL}${url}`;
                          return url;
                        };
                        const layout = section.layout || 'single';
                        // Check if text+image layout
                        if (layout === 'text-left' || layout === 'text-right') {
                          const sideTexts = Array.isArray(section.sideTexts) && section.sideTexts.length > 0
                            ? section.sideTexts
                            : (section.sideText ? [section.sideText] : ['']);
                          // Support layerImages (2D array) with backward compat from flat images
                          const layerImages = Array.isArray(section.layerImages) && section.layerImages.length > 0
                            ? section.layerImages
                            : (Array.isArray(section.images) && section.images.length > 0
                                ? section.images.map(img => [img])
                                : [[]]);
                          const layerCount = Math.max(sideTexts.length, layerImages.length);
                          return (
                            <div key={index} className="mb-10 mt-8 w-full space-y-6">
                              <div className="border-b border-border-light"></div>
                              {Array.from({ length: layerCount }, (_, layerIdx) => {
                                const imgs = layerImages[layerIdx] || [];
                                const textHtml = linkifyVideoUrlsInTextHtml(
                                  normalizeRichTextHtml(sideTexts[layerIdx] || '')
                                );
                                const validImgs = imgs.filter(img => img && img.url);

                                const textBlock = (
                                  <div 
                                    className="lesson-content text-xl text-text-primary leading-relaxed"
                                    dangerouslySetInnerHTML={{ __html: textHtml }}
                                  ></div>
                                );

                                const imageGridClass =
                                  validImgs.length === 1
                                    ? 'grid grid-cols-1'
                                    : validImgs.length === 2
                                      ? 'grid grid-cols-2'
                                      : validImgs.length === 3
                                        ? 'grid grid-cols-3'
                                        : 'grid grid-cols-2 lg:grid-cols-3';

                                const imageBlock = validImgs.length > 0 ? (
                                  <div className={`${imageGridClass} gap-3`}>
                                    {validImgs.map((img, imgIdx) => (
                                      <div key={imgIdx} className="flex flex-col items-center flex-1 min-w-0">
                                        <img
                                          src={buildImgUrl(img.url)}
                                          alt={img.fileName || "Lesson content"}
                                          className="w-full h-auto rounded-lg shadow-sm object-cover"
                                          loading="lazy"
                                          decoding="async"
                                          fetchPriority="low"
                                          onError={(e) => { e.target.style.display = 'none'; }}
                                        />
                                        {img.caption && (
                                          <p className="text-sm text-gray-600 text-center italic mt-2">{img.caption}</p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : null;

                                if (!imageBlock) {
                                  return (
                                    <div key={layerIdx} className="space-y-4">
                                      <div className="w-full flex justify-center">
                                        <div className="lesson-content text-xl text-text-primary leading-relaxed text-center max-w-3xl"
                                          dangerouslySetInnerHTML={{ __html: textHtml }}
                                        ></div>
                                      </div>
                                      {layerIdx < layerCount - 1 && <div className="border-b border-border-light"></div>}
                                    </div>
                                  );
                                }

                                const plainTextContent = textHtml.replace(/<[^>]+>/g, '').trim();
                                if (!plainTextContent) {
                                  return (
                                    <div key={layerIdx} className="space-y-4">
                                      {imageBlock}
                                      {layerIdx < layerCount - 1 && <div className="border-b border-border-light"></div>}
                                    </div>
                                  );
                                }

                                return (
                                  <div key={layerIdx} className="space-y-4">
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                                      {layout === 'text-left' ? <>{textBlock}{imageBlock}</> : <>{imageBlock}{textBlock}</>}
                                    </div>
                                    {layerIdx < layerCount - 1 && <div className="border-b border-border-light"></div>}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }
                        // Check if multi-image
                        if (section.images && section.images.length > 0) {
                          const gridClass =
                            layout === 'side-by-side' ? 'grid grid-cols-2' :
                            layout === 'grid-2x2' ? 'grid grid-cols-2' :
                            layout === 'grid-3' ? 'grid grid-cols-3' :
                            layout === 'one-plus-two' ? 'grid grid-cols-2 [&>*:first-child]:col-span-2' :
                            layout === 'two-plus-one' ? 'grid grid-cols-2 [&>*:last-child]:col-span-2' :
                            layout === 'big-left' ? 'grid grid-cols-2 grid-rows-2 [&>*:first-child]:row-span-2' :
                            layout === 'big-right' ? 'grid grid-cols-2 grid-rows-2 [&>*:last-child]:row-span-2' :
                            layout === 'mosaic' ? 'grid grid-cols-4 grid-rows-2 [&>*:first-child]:col-span-2 [&>*:first-child]:row-span-2' :
                            section.images.length === 1 ? 'flex justify-center' : 'flex gap-4 justify-center flex-wrap';
                          return (
                            <div key={index} className="mb-10 mt-8 flex flex-col items-center w-full">
                              <div className={`gap-4 w-full ${gridClass}`}>
                                {section.images.map((img, imgIdx) => (
                                  img.url && (
                                    <div key={imgIdx} className="flex flex-col items-center">
                                      <img
                                        src={buildImgUrl(img.url)}
                                        alt={img.fileName || `Image ${imgIdx + 1}`}
                                        className="w-full h-full rounded-lg shadow-sm object-cover"
                                        loading="lazy"
                                        decoding="async"
                                        fetchPriority="low"
                                        onError={(e) => { e.target.style.display = 'none'; }}
                                      />
                                      {img.caption && (
                                        <p className="text-sm text-gray-600 text-center italic mt-2">{img.caption}</p>
                                      )}
                                    </div>
                                  )
                                ))}
                              </div>
                            </div>
                          );
                        }
                        const imageUrl = buildImgUrl(section.content);
                        return (
                          <div key={index} className="mb-10 mt-8 flex flex-col items-center">
                            <img 
                              src={imageUrl} 
                              alt={section.fileName || "Lesson content"}
                              className="max-w-md rounded-lg shadow-sm mb-3 object-contain" 
                              loading="lazy"
                              decoding="async"
                              fetchPriority="low"
                              onError={(e) => {
                                console.error('Image failed to load:', section.content);
                                e.target.style.display = 'none';
                              }}
                            />
                            {(section.caption || section.fileName) && (
                              <p className="text-base text-gray-700 text-center italic">{section.caption || section.fileName}</p>
                            )}
                          </div>
                        );
                      case 'video':
                        // Build proper video URL
                        const normalizedVideoSource = normalizeExternalVideoUrl(section.content || '');
                        const videoUrl = normalizedVideoSource?.startsWith('/uploads')
                          ? `${API_SERVER_URL}${normalizedVideoSource}`
                          : normalizedVideoSource;
                        // Use iframe for hosted embed providers; use native video for direct media URLs.
                        const isEmbedUrl = isIframeVideoUrl(videoUrl);
                        return (
                          <div key={index} className="mb-10 mt-8 flex flex-col items-center">
                            <div className="aspect-video max-w-2xl w-full mb-3">
                              {isEmbedUrl ? (
                                <iframe 
                                  src={videoUrl} 
                                  className="w-full h-full rounded-lg shadow-sm"
                                  title={`Lesson video ${index + 1}`}
                                  allowFullScreen
                                ></iframe>
                              ) : (
                                <video 
                                  src={videoUrl}
                                  className="w-full h-full rounded-lg shadow-sm"
                                  controls
                                  onError={(e) => {
                                    console.error('Video failed to load:', section.content);
                                  }}
                                >
                                  Your browser does not support the video tag.
                                </video>
                              )}
                            </div>
                            {section.caption && (
                              <p className="text-base text-gray-700 text-center italic">{section.caption}</p>
                            )}
                          </div>
                        );
                      case 'review':
                      case 'review - multiple choice':
                      case 'review-multiple-choice': {
                        const reviewId = section.id || `review-mc-${index}`;
                        const isCompleted = completedReviews[reviewId];
                        const reviewResult = reviewResults[reviewId];
                        const isPerfectScore = typeof reviewResult?.score === 'number' && reviewResult.score === 100;
                        const isWrongSubmission = !!reviewResult && !isPerfectScore;
                        const showReviewStatusCard = isCompleted || isWrongSubmission;
                        const cooldownSecondsLeft = isWrongSubmission ? getCooldownSecondsLeft(reviewId) : 0;
                        const isCooldownActive = cooldownSecondsLeft > 0;
                        const canRetakeFromStatusCard = isWrongSubmission && !isCooldownActive;
                        const hasQuestions = section.questions && section.questions.length > 0;
                        
                        if (!hasQuestions) return null;

                        const reviewQuestions = shuffledQuestions[reviewId] || section.questions;
                        const currentReviewQuestion = reviewQuestions[activeReviewQuestionIndex] || reviewQuestions[0];
                        
                        return (
                          <React.Fragment key={index}>
                            {/* Locked / Completed Card */}
                            {showReviewStatusCard ? (
                              <div 
                                onClick={() => {
                                  if (!canRetakeFromStatusCard) return;
                                  // Allow retake only for failed cards after cooldown.
                                  const attempts = (reviewAttempts[reviewId] || 0);
                                  setReviewAttempts(prev => ({ ...prev, [reviewId]: attempts + 1 }));
                                  setShuffledQuestions(prev => ({ ...prev, [reviewId]: buildShuffledQuestions(section.questions) }));
                                  setActiveReviewQuestionIndex(0);
                                  setActiveReviewQuestionTimes({});
                                  setActiveReviewQuestionStartTime(Date.now());
                                  setActiveReview(reviewId);
                                  setReviewAnswers({});
                                  setReviewScore(null);
                                }}
                                className={`mb-8 p-5 border-2 rounded-xl transition-colors relative overflow-hidden ${
                                  isWrongSubmission
                                    ? `bg-red-50 border-red-300 ${canRetakeFromStatusCard ? 'cursor-pointer hover:border-red-400' : 'cursor-not-allowed opacity-90'}`
                                    : 'bg-green-50 border-green-300 cursor-default'
                                }`}
                              >
                                {isPerfectScore ? (
                                  <>
                                    <h4 className="text-lg font-bold text-green-700 flex items-center gap-2 mb-3">
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                      Review Statement <span className="text-sm font-semibold ml-1">✓ Answered</span>
                                    </h4>
                                    <div className="space-y-3">
                                      {reviewResult.breakdown
                                        .filter(item => item.isCorrect)
                                        .map((item, idx) => (
                                          <div key={idx} className="bg-white/80 border border-green-200 rounded-lg p-4">
                                            <p className="text-sm font-semibold text-gray-800 mb-2">Q{idx + 1}: {item.question}</p>
                                            <p className="text-sm text-gray-700">
                                              Correct Answer:{' '}
                                              <span className="inline-block px-2 py-1 rounded-md bg-green-100 text-green-800 font-semibold border border-green-300">
                                                {item.correctAnswerText}
                                              </span>
                                            </p>
                                          </div>
                                        ))}
                                    </div>
                                    {typeof reviewResult?.score === 'number' && (
                                      <p className="text-sm font-bold text-green-700 mt-3">Overall Score: {reviewResult.score.toFixed(0)}%</p>
                                    )}
                                    {typeof reviewResult?.timeSpentSeconds === 'number' && (
                                      <p className="text-sm font-medium text-green-700 mt-1">Time spent: {formatDuration(reviewResult.timeSpentSeconds)}</p>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <h4 className={`text-lg font-bold flex items-center gap-2 ${isWrongSubmission ? 'text-red-700' : 'text-green-700'}`}>
                                      {isWrongSubmission ? (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                      ) : (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                      )}
                                      Review - Multiple Choice <span className="text-sm font-semibold ml-1">Answered</span>
                                    </h4>
                                    <p className={`text-sm mt-1 ${isWrongSubmission ? 'text-red-600' : 'text-green-600'}`}>{section.questions.length} question{section.questions.length > 1 ? 's' : ''} answered</p>
                                    {typeof reviewResult?.score === 'number' && (
                                      <p className={`text-sm font-bold mt-1 ${isWrongSubmission ? 'text-red-700' : 'text-green-700'}`}>Overall Score: {reviewResult.score.toFixed(0)}%</p>
                                    )}
                                    {typeof reviewResult?.timeSpentSeconds === 'number' && (
                                      <p className={`text-sm font-medium mt-1 ${isWrongSubmission ? 'text-red-700' : 'text-green-700'}`}>
                                        Time spent: {formatDuration(reviewResult.timeSpentSeconds)}
                                      </p>
                                    )}
                                  </>
                                )}
                                {isCooldownActive && (
                                  <div className="absolute inset-0 rounded-xl bg-red-100/90 backdrop-blur-[1px] flex items-center justify-center">
                                    <div className="text-center px-4">
                                      <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-red-200 flex items-center justify-center border border-red-300">
                                        <svg className="w-6 h-6 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                        </svg>
                                      </div>
                                      <p className="text-base font-bold text-red-800">Retake available in {cooldownSecondsLeft}s</p>
                                      <p className="text-sm text-red-700">Please review before proceeding to next topic</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div
                                onClick={() => {
                                  const attempts = (reviewAttempts[reviewId] || 0);
                                  // Always shuffle options on every attempt
                                  setShuffledQuestions(prev => ({ ...prev, [reviewId]: buildShuffledQuestions(section.questions) }));
                                  setReviewAttempts(prev => ({ ...prev, [reviewId]: attempts + 1 }));
                                  setActiveReviewQuestionIndex(0);
                                  setActiveReviewQuestionTimes({});
                                  setActiveReviewQuestionStartTime(Date.now());
                                  setActiveReview(reviewId);
                                  setReviewAnswers({});
                                  setReviewScore(null);
                                }}
                                className="mb-8 relative rounded-xl cursor-pointer group overflow-hidden"
                                style={{ animation: 'reviewGlow 2s ease-in-out infinite alternate' }}
                              >
                                <style>{`
                                  @keyframes reviewGlow {
                                    0% { box-shadow: 0 0 8px rgba(59,130,246,0.3), 0 0 20px rgba(59,130,246,0.1); }
                                    100% { box-shadow: 0 0 16px rgba(59,130,246,0.6), 0 0 40px rgba(59,130,246,0.2); }
                                  }
                                `}</style>
                                <div className="bg-gradient-to-r from-blue-50 via-blue-100 to-blue-50 border-2 border-blue-300 rounded-xl p-6 flex items-center gap-4 transition-all group-hover:border-blue-500 group-hover:from-blue-100 group-hover:to-blue-100">
                                  <div className="w-14 h-14 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-110 transition-transform">
                                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                  </div>
                                  <div className="flex-1">
                                    <h4 className="text-lg font-bold text-blue-800">Review - Multiple Choice</h4>
                                    <p className="text-sm text-blue-600">{section.questions.length} question{section.questions.length > 1 ? 's' : ''} — Click to unlock</p>
                                  </div>
                                  <svg className="w-6 h-6 text-blue-400 group-hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </div>
                              </div>
                            )}
                            
                            {/* Quiz Overlay */}
                            {activeReview === reviewId && (
                              <div className="fixed inset-0 z-50 flex items-center justify-center">
                                <div className="absolute inset-0 backdrop-blur-md bg-black/40"></div>
                                <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto p-8">
                                  {reviewScore !== null ? (
                                    <div className="text-center py-6">
                                      <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${reviewScore >= 75 ? 'bg-green-100' : 'bg-red-100'}`}>
                                        {reviewScore >= 75 ? (
                                          <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                        ) : (
                                          <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                        )}
                                      </div>
                                      <h3 className="text-2xl font-bold mb-2">{reviewScore >= 75 ? 'Great Job!' : 'Keep Learning!'}</h3>
                                      <p className="text-4xl font-bold text-highlight-dark mb-4">{reviewScore.toFixed(0)}%</p>
                                      <button onClick={() => {
                                        setCompletedReviews(prev => ({ ...prev, [reviewId]: true }));
                                        setActiveReview(null);
                                        setReviewScore(null);
                                        setActiveReviewQuestionIndex(0);
                                        setActiveReviewQuestionTimes({});
                                        setActiveReviewQuestionStartTime(null);
                                      }} className="px-8 py-3 bg-highlight text-white rounded-full text-lg font-semibold shadow-lg">
                                        Continue
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <h2 className="text-2xl font-bold text-primary mb-6">Review - Multiple Choice</h2>
                                      <div className="border border-gray-200 rounded-lg p-5">
                                        <p className="text-sm text-gray-500 mb-2">
                                          Question {activeReviewQuestionIndex + 1} of {reviewQuestions.length}
                                        </p>
                                        <p className="font-semibold text-gray-800 mb-3">
                                          {activeReviewQuestionIndex + 1}. {currentReviewQuestion?.question}
                                        </p>
                                        <div className="space-y-2">
                                          {(currentReviewQuestion?.options || []).map((opt, oIdx) => (
                                            <label key={oIdx} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                                              reviewAnswers[activeReviewQuestionIndex] === oIdx
                                                ? 'bg-highlight/10 border-2 border-highlight'
                                                : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                                            }`}>
                                              <input
                                                type="radio"
                                                name={`review-q-${reviewId}-${activeReviewQuestionIndex}`}
                                                checked={reviewAnswers[activeReviewQuestionIndex] === oIdx}
                                                onChange={() => setReviewAnswers(prev => ({ ...prev, [activeReviewQuestionIndex]: oIdx }))}
                                                className="w-4 h-4 text-highlight-dark"
                                              />
                                              <span className="text-gray-700">{opt}</span>
                                            </label>
                                          ))}
                                        </div>
                                      </div>
                                      <div className="mt-6 flex items-center justify-between">
                                        <button
                                          onClick={() => {
                                            const updatedQuestionTimes = updateActiveReviewQuestionTime();
                                            setActiveReviewQuestionTimes(updatedQuestionTimes);
                                            setActiveReviewQuestionIndex((prev) => Math.max(prev - 1, 0));
                                          }}
                                          disabled={activeReviewQuestionIndex === 0}
                                          className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                          Previous
                                        </button>

                                        {activeReviewQuestionIndex < reviewQuestions.length - 1 ? (
                                          <button
                                            onClick={() => {
                                              const updatedQuestionTimes = updateActiveReviewQuestionTime();
                                              setActiveReviewQuestionTimes(updatedQuestionTimes);
                                              setActiveReviewQuestionIndex((prev) => Math.min(prev + 1, reviewQuestions.length - 1));
                                            }}
                                            disabled={reviewAnswers[activeReviewQuestionIndex] === undefined}
                                            className="px-8 py-3 bg-highlight text-white rounded-lg font-semibold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                          >
                                            Next
                                          </button>
                                        ) : (
                                          <button
                                            onClick={async () => {
                                              const updatedQuestionTimes = updateActiveReviewQuestionTime();
                                              setActiveReviewQuestionTimes(updatedQuestionTimes);

                                              let correct = 0;
                                              const skillAnswers = [];
                                              const breakdown = reviewQuestions.map((q, qIdx) => {
                                                const selectedIdx = reviewAnswers[qIdx];
                                                const isCorrect = selectedIdx === q.correctAnswer;
                                                if (isCorrect) correct++;

                                                skillAnswers.push({
                                                  skill: q.skill || 'Memorization',
                                                  isCorrect,
                                                  responseTime: updatedQuestionTimes[qIdx] || 0,
                                                  questionType: q.questionType || q.type || 'Easy'
                                                });

                                                return {
                                                  question: q.question,
                                                  isCorrect,
                                                  correctAnswerText: q.options[q.correctAnswer],
                                                };
                                              });

                                              const score = (correct / reviewQuestions.length) * 100;
                                              const timeSpentSeconds = getTotalTimeFromQuestionTimes(updatedQuestionTimes);

                                              setReviewResults(prev => ({
                                                ...prev,
                                                [reviewId]: {
                                                  score,
                                                  hasCorrectAnswer: breakdown.some(item => item.isCorrect),
                                                  breakdown,
                                                  timeSpentSeconds,
                                                }
                                              }));

                                              try {
                                                const numericModuleId = Number.parseInt(moduleId, 10);
                                                const batchAnswers = skillAnswers.filter((answer) => answer.skill !== 'No Skill');
                                                if (batchAnswers.length > 0) {
                                                  await axios.post('/bkt/batch-update', {
                                                    answers: batchAnswers,
                                                    assessmentType: 'Review',
                                                    moduleId: Number.isFinite(numericModuleId) ? numericModuleId : null,
                                                    timeSpentSeconds
                                                  });
                                                }
                                              } catch (error) {
                                                console.error('Error updating BKT after lesson review submission:', error);
                                              }

                                              if (score < 100) {
                                                setReviewCooldowns(prev => ({
                                                  ...prev,
                                                  [reviewId]: Date.now() + 30000,
                                                }));
                                                setCompletedReviews(prev => ({
                                                  ...prev,
                                                  [reviewId]: false,
                                                }));
                                              } else {
                                                setReviewCooldowns(prev => {
                                                  const next = { ...prev };
                                                  delete next[reviewId];
                                                  return next;
                                                });
                                                setCompletedReviews(prev => ({
                                                  ...prev,
                                                  [reviewId]: true,
                                                }));
                                              }

                                              setActiveReview(null);
                                              setReviewScore(null);
                                              setActiveReviewQuestionIndex(0);
                                              setActiveReviewQuestionTimes({});
                                              setActiveReviewQuestionStartTime(null);
                                            }}
                                            disabled={reviewAnswers[activeReviewQuestionIndex] === undefined}
                                            className="px-8 py-3 bg-highlight text-white rounded-lg font-semibold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                          >
                                            Submit Answers
                                          </button>
                                        )}
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            )}
                          </React.Fragment>
                        );
                      }
                      case 'review - drag and drop':
                      case 'review-drag-drop':
                      case 'simulation': {
                        const dndReviewId = section.id || `review-dnd-${index}`;
                        const simulationId = section.simulationId || section.simulation?.SimulationID || section.simulation?.id;
                        const simulationTitle = section.simulation?.SimulationTitle || 'Interactive Exercise';
                        const simulationDescription = section.simulation?.Description || 'Complete this interactive exercise to continue.';
                        const isDndCompleted = completedReviews[dndReviewId];
                        const cooldownSecondsLeft = getCooldownSecondsLeft(dndReviewId);
                        const isCooldownActive = cooldownSecondsLeft > 0;

                        if (!simulationId && !section.simulation) return null;

                        return (
                          <React.Fragment key={index}>
                            {isDndCompleted ? (
                              <div className="mb-8 p-5 bg-green-50 border-2 border-green-300 rounded-xl">
                                <h4 className="text-lg font-bold text-green-700 flex items-center gap-2">
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                  Simulation <span className="text-sm font-semibold ml-1">✓ Completed</span>
                                </h4>
                                <p className="text-sm text-green-600 mt-1">{simulationTitle}</p>
                              </div>
                            ) : (
                              <div
                                onClick={() => {
                                  if (isCooldownActive) return;
                                  setActiveReview(dndReviewId);
                                }}
                                className={`mb-8 relative rounded-xl overflow-hidden ${isCooldownActive ? 'cursor-not-allowed' : 'cursor-pointer group'}`}
                                style={{ animation: 'reviewGlowPurple 2s ease-in-out infinite alternate' }}
                              >
                                <style>{`
                                  @keyframes reviewGlowPurple {
                                    0% { box-shadow: 0 0 8px rgba(147,51,234,0.3), 0 0 20px rgba(147,51,234,0.1); }
                                    100% { box-shadow: 0 0 16px rgba(147,51,234,0.6), 0 0 40px rgba(147,51,234,0.2); }
                                  }
                                `}</style>
                                <div className="bg-gradient-to-r from-purple-50 via-purple-100 to-purple-50 border-2 border-purple-300 rounded-xl p-6 flex items-center gap-4 transition-all group-hover:border-purple-500 group-hover:from-purple-100 group-hover:to-purple-100">
                                  <div className="w-14 h-14 bg-purple-500 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-110 transition-transform">
                                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                  </div>
                                  <div className="flex-1">
                                    <h4 className="text-lg font-bold text-purple-800">Simulation</h4>
                                    <p className="text-sm text-purple-600">{simulationTitle} — Click to open</p>
                                  </div>
                                  <svg className="w-6 h-6 text-purple-400 group-hover:text-purple-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </div>
                                {isCooldownActive && (
                                  <div className="absolute inset-0 rounded-xl bg-red-100/90 backdrop-blur-[1px] flex items-center justify-center">
                                    <div className="text-center px-4">
                                      <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-red-200 flex items-center justify-center border border-red-300">
                                        <svg className="w-6 h-6 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                      </div>
                                      <p className="text-base font-bold text-red-800">Available in {cooldownSecondsLeft}s</p>
                                      <p className="text-sm text-red-700">Please wait before reopening this simulation</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {activeReview === dndReviewId && (
                              <div className="fixed inset-0 z-50 flex items-center justify-center">
                                <div className="absolute inset-0 backdrop-blur-md bg-black/40"></div>
                                <div className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full mx-4 max-h-[85vh] overflow-y-auto p-8">
                                  <div className="text-center py-8">
                                    <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                      <svg className="w-10 h-10 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                      </svg>
                                    </div>
                                    <h3 className="text-2xl font-bold text-primary mb-2">{simulationTitle}</h3>
                                    <p className="text-gray-600 mb-6">{simulationDescription}</p>
                                    <div className="flex gap-4 justify-center flex-wrap">
                                      <button
                                        onClick={() => {
                                          setReviewCooldowns((prevCooldowns) => ({
                                            ...prevCooldowns,
                                            [dndReviewId]: Date.now() + 30000,
                                          }));
                                          setActiveReview(null);
                                          if (simulationId) navigate(`/simulation/${simulationId}`);
                                        }}
                                        className="px-8 py-3 bg-purple-500 text-white rounded-lg font-semibold shadow-lg hover:bg-purple-600"
                                      >
                                        Start Activity
                                      </button>
                                      <button
                                        onClick={() => {
                                          setCompletedReviews((prevReviews) => ({ ...prevReviews, [dndReviewId]: true }));
                                          setReviewCooldowns((prevCooldowns) => {
                                            const nextCooldowns = { ...prevCooldowns };
                                            delete nextCooldowns[dndReviewId];
                                            return nextCooldowns;
                                          });
                                          setActiveReview(null);
                                        }}
                                        className="px-8 py-3 bg-green-500 text-white rounded-lg font-semibold shadow-lg hover:bg-green-600"
                                      >
                                        Mark as Completed
                                      </button>
                                      <button
                                        onClick={() => setActiveReview(null)}
                                        className="px-8 py-3 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300"
                                      >
                                        Close
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </React.Fragment>
                        );
                      }
                      case 'references':
                        // References are shown in the dedicated sidebar panel.
                        return null;
                      default:
                        return null;
                    }
                  })}
                  
                  {/* Topic Navigation Buttons */}
                  <div className="mt-12 pt-8 border-t-2 border-gray-100">
                    <div className="flex items-center justify-between">
                      {/* Previous Topic */}
                      {currentTopicPage > 0 ? (
                        <button
                          onClick={() => goToTopicPage(currentTopicPage - 1)}
                          className="flex items-center gap-2 px-6 py-3 text-primary bg-gray-100 hover:bg-gray-200 rounded-xl font-semibold transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                          </svg>
                          Previous Topic
                        </button>
                      ) : <div />}
                      
                      {/* Next Topic or Final Assessment */}
                      {currentTopicPage < topicPages.length - 1 ? (
                        arePageReviewsCompleted(currentTopicPage) ? (
                          <button
                            onClick={() => goToTopicPage(currentTopicPage + 1)}
                            className="flex items-center gap-2 px-8 py-3 text-white bg-highlight hover:bg-highlight-dark rounded-xl font-semibold shadow-lg transition-colors"
                          >
                            Next Topic
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        ) : (
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                              </svg>
                              <span className="text-sm font-medium text-amber-700">Complete all reviews to proceed</span>
                            </div>
                            <button
                              disabled
                              className="flex items-center gap-2 px-8 py-3 text-white bg-gray-300 rounded-xl font-semibold cursor-not-allowed"
                            >
                              Next Topic
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                          </div>
                        )
                      ) : (
                        <>
                          {module?.finalQuestions && module.finalQuestions.length > 0 ? (
                            arePageReviewsCompleted(currentTopicPage) ? (
                              <button
                                onClick={() => {
                                  localStorage.setItem(`lesson_viewed_${moduleId}`, 'true');
                                  navigate(`/assessment/final/${module.ModuleID}`);
                                }}
                                className="flex items-center gap-2 px-8 py-3 text-white bg-highlight hover:bg-highlight-dark rounded-xl font-semibold shadow-lg transition-colors"
                              >
                                Start Final Assessment
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                            ) : (
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                                  <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                  </svg>
                                  <span className="text-sm font-medium text-amber-700">Complete all reviews to proceed</span>
                                </div>
                                <button
                                  disabled
                                  className="flex items-center gap-2 px-8 py-3 text-white bg-gray-300 rounded-xl font-semibold cursor-not-allowed"
                                >
                                  Start Final Assessment
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                  </svg>
                                </button>
                              </div>
                            )
                          ) : (
                            arePageReviewsCompleted(currentTopicPage) ? (
                              <button
                                onClick={() => {
                                  localStorage.setItem(`lesson_viewed_${moduleId}`, 'true');
                                  updateModuleProgress(100);
                                }}
                                className="flex items-center gap-2 px-8 py-3 text-white bg-highlight hover:bg-highlight-dark rounded-xl font-semibold shadow-lg transition-colors"
                              >
                                Finish the Lesson
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                            ) : (
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                                  <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                  </svg>
                                  <span className="text-sm font-medium text-amber-700">Complete all reviews to proceed</span>
                                </div>
                                <button
                                  disabled
                                  className="flex items-center gap-2 px-8 py-3 text-white bg-gray-300 rounded-xl font-semibold cursor-not-allowed"
                                >
                                  Finish the Lesson
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                  </svg>
                                </button>
                              </div>
                            )
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {showReferencesPanel && (
            <>
              <div
                className="fixed inset-0 bg-black/30 z-[55]"
                onClick={() => setShowReferencesPanel(false)}
              ></div>
              <div className="fixed top-0 right-0 h-full w-[430px] max-w-[92vw] bg-white shadow-2xl border-l border-gray-200 z-[60] flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                  <h3 className="text-2xl font-bold text-primary">References</h3>
                  <button
                    onClick={() => setShowReferencesPanel(false)}
                    className="text-gray-500 hover:text-highlight-dark transition-colors"
                    aria-label="Close references panel"
                  >
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                  {apaReferences.length > 0 ? (
                    <ul className="space-y-3">
                      {apaReferences.map((reference, refIndex) => (
                        <li key={`${reference.url}-${refIndex}`}>
                          <div className="relative border border-gray-200 rounded-xl p-4 pt-9 bg-surface-light">
                            <span className="absolute top-3 left-3 inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-primary/10 text-primary text-xs font-bold">
                              {refIndex + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-primary break-words">
                                {reference.apaCitation}
                              </p>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="h-full flex items-center justify-center text-center">
                      <div>
                        <p className="text-gray-600 font-semibold">No reference links available.</p>
                        <p className="text-sm text-gray-500 mt-1">Ask your instructor/admin to add references in this lesson.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
          </>
        )}

        {/* Topic Content - Only show if using hardcoded content */}
        {currentTopicData && !showQuickAssessment && !lessonSections.length && (
          <div className="space-y-6">
            {/* Learning Objective Card */}
            <div className="card border-l-4 border-primary">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-highlight rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-primary mb-2 flex items-center gap-2">
                    🎯 Learning Objective
                  </h3>
                  <p className="text-text-secondary text-base leading-relaxed">
                    By the end of this topic, you will be able to understand and explain <span className="text-primary font-semibold">{currentTopicData.title}</span> and apply this knowledge in practical scenarios.
                  </p>
                </div>
              </div>
            </div>

            {/* Main Content Card */}
            <div className="card">
              {/* Difficulty Indicator */}
              {parseInt(moduleId) <= 4 && currentDifficulty !== DIFFICULTY_LEVELS.NORMAL && (
                <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${
                  currentDifficulty === DIFFICULTY_LEVELS.EASY 
                    ? 'bg-blue-500/20 text-blue-400 border-2 border-blue-500/30'
                    : currentDifficulty === DIFFICULTY_LEVELS.CHALLENGE
                    ? 'bg-purple-500/20 text-purple-400 border-2 border-purple-500/30'
                    : 'bg-orange-500/20 text-orange-400 border-2 border-orange-500/30'
                }`}>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-semibold">
                    {currentDifficulty === DIFFICULTY_LEVELS.EASY && '📚 Simplified Version - Key concepts highlighted'}
                    {currentDifficulty === DIFFICULTY_LEVELS.CHALLENGE && '🏆 Challenge Mode - Advanced content'}
                    {currentDifficulty === DIFFICULTY_LEVELS.HARD && '💪 Hard Mode'}
                  </span>
                </div>
              )}

              {/* Title with decorative line */}
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-primary mb-3">
                  {currentTopicData.title}
                </h2>
                <div className="h-1 w-24 bg-gradient-to-r from-primary to-secondary rounded-full"></div>
              </div>
              
              {/* Text Content with Two-Column Layout for Better Readability */}
              <div className="mb-8">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Main Content Area */}
                  <div className="lg:col-span-8 prose prose-invert max-w-none">
                    {/* Display content based on difficulty for Lessons 1-4 */}
                    {parseInt(moduleId) <= 4 && currentDifficulty === DIFFICULTY_LEVELS.EASY ? (
                      // Show easier content
                      <div className="text-text-primary space-y-5">
                        {getEasierContent(parseInt(moduleId)).split('\n\n').map((paragraph, index) => (
                          <p key={index} className="text-lg leading-relaxed">
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    ) : parseInt(moduleId) <= 4 && showChallengeMode ? (
                      // Show challenge content
                      <div className="text-text-primary space-y-5">
                        {getChallengeContent(parseInt(moduleId)).split('\n\n').map((paragraph, index) => (
                          <p key={index} className="text-base leading-relaxed">
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    ) : (
                      // Show normal content with better formatting
                      <div className="text-text-primary space-y-5">
                        {currentTopicData.content.split('\n\n').map((paragraph, index) => {
                          // Check if paragraph is a bullet list
                          if (paragraph.startsWith('•')) {
                            const items = paragraph.split('\n').filter(item => item.trim());
                            return (
                              <ul key={index} className="space-y-4 ml-0">
                                {items.map((item, i) => (
                                  <li key={i} className="flex items-start gap-4 p-3 rounded-lg bg-background-light">
                                    <span className="text-primary text-xl mt-0.5">●</span>
                                    <span className="flex-1 text-base leading-relaxed">{item.replace('•', '').trim()}</span>
                                  </li>
                                ))}
                              </ul>
                            );
                          }
                          return (
                            <p key={index} className="text-lg leading-loose">
                              {paragraph}
                            </p>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Side Panel with Visual Elements */}
                  <div className="lg:col-span-4 space-y-4">
                    {/* Progress Indicator */}
                    <div className="bg-gradient-to-br from-primary/10 to-secondary/10 rounded-xl p-5 border border-primary/20">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-xs text-text-secondary">Topic Progress</p>
                          <p className="text-lg font-bold text-primary">Step {currentTopic + 1} of {content?.topics.length || 1}</p>
                        </div>
                      </div>
                      <div className="w-full bg-background-dark rounded-full h-2 overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-primary to-secondary rounded-full"
                          style={{ width: `${((currentTopic + 1) / (content?.topics.length || 1)) * 100}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Quick Tips Card */}
                    <div className="bg-gradient-to-br from-secondary/10 to-primary/10 rounded-xl p-5 border border-secondary/20">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-secondary rounded-lg flex items-center justify-center flex-shrink-0">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                        </div>
                        <div>
                          <h4 className="font-bold text-secondary mb-2">💡 Did you know?</h4>
                          <p className="text-sm text-text-secondary leading-relaxed">
                            {currentTopic === 0 
                              ? "CHS professionals are in high demand globally, with an average salary increase of 15% annually!"
                              : "Regular maintenance can extend computer lifespan by up to 5 years, saving thousands in replacement costs!"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Key Takeaways Summary Card */}
              <div className="bg-gradient-to-r from-primary/10 via-secondary/10 to-primary/10 border-2 border-primary/30 rounded-2xl p-6 mb-6 shadow-lg">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 bg-highlight rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-4">
                      📝 Key Takeaways
                    </h3>
                    <ul className="space-y-3">
                      {currentTopic === 0 ? (
                        <>
                          <li className="flex items-start gap-3 p-3 rounded-lg bg-background-light/50">
                            <span className="text-success text-xl mt-0.5">✓</span>
                            <span className="text-text-secondary">CHS involves installing, repairing, and maintaining computer hardware components</span>
                          </li>
                          <li className="flex items-start gap-3 p-3 rounded-lg bg-background-light/50">
                            <span className="text-success text-xl mt-0.5">✓</span>
                            <span className="text-text-secondary">Essential for ensuring optimal computer performance in modern society</span>
                          </li>
                          <li className="flex items-start gap-3 p-3 rounded-lg bg-background-light/50">
                            <span className="text-success text-xl mt-0.5">✓</span>
                            <span className="text-text-secondary">Covers hardware assembly, system configuration, and documentation</span>
                          </li>
                        </>
                      ) : (
                        <>
                          <li className="flex items-start gap-3 p-3 rounded-lg bg-background-light/50">
                            <span className="text-success text-xl mt-0.5">✓</span>
                            <span className="text-text-secondary">CHS ensures optimal performance and prevents hardware degradation</span>
                          </li>
                          <li className="flex items-start gap-3 p-3 rounded-lg bg-background-light/50">
                            <span className="text-success text-xl mt-0.5">✓</span>
                            <span className="text-text-secondary">Key benefits: Cost efficiency, data protection, longevity, and safety</span>
                          </li>
                          <li className="flex items-start gap-3 p-3 rounded-lg bg-background-light/50">
                            <span className="text-success text-xl mt-0.5">✓</span>
                            <span className="text-text-secondary">Proactive maintenance prevents major issues and extends hardware lifespan</span>
                          </li>
                        </>
                      )}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Challenge Mode Button */}
              {parseInt(moduleId) <= 4 && shouldShowChallenge(parseInt(moduleId)) && !showChallengeMode && (
                <div className="mb-6 p-5 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-2 border-purple-500/30 rounded-2xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-pink-600 rounded-xl flex items-center justify-center">
                        <span className="text-2xl">🎯</span>
                      </div>
                      <div>
                        <h3 className="font-bold text-purple-300 text-lg mb-1">Challenge Available!</h3>
                        <p className="text-sm text-text-secondary">
                          You've passed the final assessment on your first try! Ready for advanced content?
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowChallengeMode(true)}
                      className="btn bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white border-0 shadow-lg"
                    >
                      Accept Challenge
                    </button>
                  </div>
                </div>
              )}

              {/* Back to Normal Mode Button */}
              {showChallengeMode && (
                <div className="mb-6">
                  <button
                    onClick={() => setShowChallengeMode(false)}
                    className="btn btn-outline"
                  >
                    ← Back to Normal Mode
                  </button>
                </div>
              )}

              {/* Mini-Quiz Section */}
              {currentTopicData.assessment && (
                <div className="border-t-2 border-background-light pt-6">
                  <div className="bg-gradient-to-br from-secondary/20 to-primary/20 rounded-2xl p-6 border-2 border-secondary/30 shadow-lg">
                    <div className="flex items-center gap-4 mb-5">
                      <div className="w-16 h-16 bg-gradient-to-br from-secondary to-secondary-dark rounded-2xl flex items-center justify-center shadow-lg">
                        <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold text-secondary">Quick Assessment</h3>
                        <p className="text-sm text-text-secondary">Test your understanding with {currentTopicData.assessment.length} question{currentTopicData.assessment.length > 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <button
                      onClick={handleShowQuickAssessment}
                      className="btn btn-secondary w-full text-lg py-4 shadow-lg"
                    >
                      <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Start Assessment
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quick Assessment Component */}
        {showQuickAssessment && currentTopicData && (
          <QuickAssessment
            questions={currentTopicData.assessment}
            onComplete={() => handleTopicComplete(currentTopic)}
            onCancel={() => setShowQuickAssessment(false)}
            topicTitle={currentTopicData.title}
            moduleId={parseInt(moduleId)}
            topicIndex={currentTopic}
          />
        )}
      </div>

      {/* Report Issue Modal - Global */}
      {showReportModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          {/* Overlay */}
          <div 
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowReportModal(false)}
          />
          
          {/* Modal */}
          <div className="relative bg-white rounded-lg shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
            {/* Header */}
            <div className="bg-highlight px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Experiencing Trouble?</h2>
              <button 
                onClick={() => setShowReportModal(false)}
                className="text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              <p className="text-gray-700 mb-6">
                This is not the experience ModuLearn wants to provide. In order for us to know how this can be handled and fixed, please tell us more about what you've experienced.
              </p>

              {/* Issue Type Radio Buttons */}
              <div className="flex flex-wrap gap-4 mb-6">
                {['Lesson Content', 'Missing Content', 'Navigation', 'Website Functions', 'Loading Issues'].map((type) => (
                  <label key={type} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="issueType"
                      value={type}
                      checked={reportType === type}
                      onChange={(e) => setReportType(e.target.value)}
                      className="w-4 h-4 text-highlight-dark border-gray-300 focus:ring-highlight"
                    />
                    <span className="text-gray-700">{type}</span>
                  </label>
                ))}
              </div>

              {/* Details Textarea */}
              <textarea
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                placeholder="Please provide details..."
                className="w-full h-32 px-4 py-3 bg-gray-100 border border-gray-200 rounded-lg resize-none focus:outline-none focus:border-highlight text-gray-700"
              />

              {/* Submit Button */}
              <div className="flex justify-end mt-4">
                {reportError && (
                  <div className="flex-1 mr-4 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {reportError}
                  </div>
                )}
                <button
                  type="button"
                  disabled={!reportDetails.trim() || reportSubmitting}
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    if (!reportDetails.trim() || reportSubmitting) return;
                    
                    setReportSubmitting(true);
                    setReportError('');
                    try {
                      console.log('Submitting report:', {
                        moduleId: moduleId ? parseInt(moduleId) : null,
                        issueType: reportType,
                        details: reportDetails.trim(),
                        lessonTitle: module?.ModuleTitle
                      });
                      
                      const response = await axios.post('/users/report-issue', {
                        moduleId: moduleId ? parseInt(moduleId) : null,
                        issueType: reportType,
                        details: reportDetails.trim(),
                        lessonTitle: module?.ModuleTitle || ''
                      });
                      
                      console.log('Report submitted successfully:', response.data);
                      
                      setShowReportModal(false);
                      setReportDetails('');
                      setReportType('Lesson Content');
                      setReportError('');
                      // Show success toast
                      setShowReportSuccess(true);
                      setTimeout(() => setShowReportSuccess(false), 3000);
                    } catch (err) {
                      console.error('Failed to submit report:', err);
                      console.error('Error response:', err.response?.data);
                      console.error('Error status:', err.response?.status);
                      
                      let errorMsg = 'Failed to submit report. ';
                      if (err.response?.status === 401) {
                        errorMsg += 'Please log in again.';
                      } else if (err.response?.status === 400) {
                        errorMsg += err.response?.data?.message || 'Invalid data.';
                      } else if (err.response?.data?.message) {
                        errorMsg += err.response.data.message;
                      } else if (!err.response) {
                        errorMsg += 'Server is not responding. Please check if the backend is running.';
                      } else {
                        errorMsg += 'Please try again.';
                      }
                      setReportError(errorMsg);
                    } finally {
                      setReportSubmitting(false);
                    }
                  }}
                  className={`px-8 py-2 rounded-full font-semibold ${
                    !reportDetails.trim() || reportSubmitting
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-2 border-gray-200'
                      : 'bg-white border-2 border-highlight text-highlight-dark'
                  }`}
                >
                  {reportSubmitting ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Report Success Toast - Global */}
      {showReportSuccess && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100]">
          <div className="bg-highlight text-white px-8 py-4 rounded-lg shadow-lg flex items-center gap-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-semibold text-lg">Report Sent!</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModuleView;
