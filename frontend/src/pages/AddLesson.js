import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../App';
import AdminNavbar from '../components/AdminNavbar';

const AddLesson = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = !!id;

  const [lessonData, setLessonData] = useState({
    ModuleTitle: '',
    Description: '',
    LessonOrder: 1,
    Difficulty: 'Easy',
    LessonTime: { hours: 0, minutes: 30 },
    Tesda_Reference: ''
  });

  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [draggedSection, setDraggedSection] = useState(null);
  const [dragOverSection, setDragOverSection] = useState(null);
  const [activeStage, setActiveStage] = useState('lesson'); // 'diagnostic', 'lesson', 'review', 'final'
  const [diagnosticQuestions, setDiagnosticQuestions] = useState([]);
  const [reviewQuestions, setReviewQuestions] = useState([]);
  const [finalQuestions, setFinalQuestions] = useState([]);
  const [activeTextarea, setActiveTextarea] = useState(null);
  const [roadmapStages, setRoadmapStages] = useState([
    { id: 'diagnostic', type: 'diagnostic', label: 'Diagnostic' },
    { id: 'lesson', type: 'lesson', label: 'Lesson' },
    { id: 'final', type: 'final', label: 'Final Assessment' },
  ]);
  const [showAddStageModal, setShowAddStageModal] = useState(false);
  const [availableSimulations, setAvailableSimulations] = useState([]);
  const [showSimulationPicker, setShowSimulationPicker] = useState(false);
  const [selectedSimulation, setSelectedSimulation] = useState(null);
  const [draggedStage, setDraggedStage] = useState(null);
  const [dragOverStageId, setDragOverStageId] = useState(null);
  const [showDndSimPicker, setShowDndSimPicker] = useState(false);
  const [dndPickerSectionId, setDndPickerSectionId] = useState(null);
  const [finalInstruction, setFinalInstruction] = useState('');
  const [collapsedSections, setCollapsedSections] = useState({});
  const [layoutPickerSection, setLayoutPickerSection] = useState(null);
  const [changeMaterialPicker, setChangeMaterialPicker] = useState(null);
  const [insertAtIndex, setInsertAtIndex] = useState(null);
  
  // Refs for contentEditable elements
  const lessonTitleRef = useRef(null);
  const descriptionRef = useRef(null);

  useEffect(() => {
    if (user?.role !== 'admin') {
      navigate('/dashboard');
      return;
    }

    if (isEditMode) {
      fetchLesson();
    }
  }, [user, navigate, id, isEditMode]);

  // Close toolbar when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!activeTextarea) return;
      
      // Check if click is on a text field or the toolbar
      const isTextField = e.target.id && (
        e.target.id.startsWith('input-') || 
        e.target.id.startsWith('textarea-')
      );
      
      // Check if click is inside a contentEditable element (for double-clicks on text content)
      const isInsideContentEditable = e.target.closest('[contenteditable="true"]');
      
      const isToolbar = e.target.closest('.formatting-toolbar');
      
      if (!isTextField && !isInsideContentEditable && !isToolbar) {
        setActiveTextarea(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeTextarea]);

  // Enable wheel scrolling during drag
  useEffect(() => {
    if (!draggedSection) return;
    const handleWheelDuringDrag = (e) => {
      window.scrollBy({ top: e.deltaY, behavior: 'auto' });
    };
    window.addEventListener('wheel', handleWheelDuringDrag, { passive: true });
    return () => window.removeEventListener('wheel', handleWheelDuringDrag);
  }, [draggedSection]);

  // Close change material picker on outside click
  useEffect(() => {
    if (!changeMaterialPicker) return;
    const handleClickOutside = (e) => {
      if (!e.target.closest('[data-material-picker]')) {
        setChangeMaterialPicker(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [changeMaterialPicker]);

  // Handle Tab key for indentation in contentEditable fields
  useEffect(() => {
    const handleTabKey = (e) => {
      if (e.key !== 'Tab') return;
      const el = e.target;
      if (!el || el.contentEditable !== 'true') return;
      
      e.preventDefault();
      if (e.shiftKey) {
        // Remove leading tab/spaces from current line
        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        const node = range.startContainer;
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent;
          const offset = range.startOffset;
          // Find start of current line
          let lineStart = text.lastIndexOf('\n', offset - 1) + 1;
          const lineText = text.substring(lineStart);
          if (lineText.startsWith('\t')) {
            node.textContent = text.substring(0, lineStart) + lineText.substring(1);
            const newOffset = Math.max(lineStart, offset - 1);
            range.setStart(node, newOffset);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          } else if (lineText.startsWith('    ')) {
            node.textContent = text.substring(0, lineStart) + lineText.substring(4);
            const newOffset = Math.max(lineStart, offset - 4);
            range.setStart(node, newOffset);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
      } else {
        document.execCommand('insertText', false, '\t');
      }
    };

    document.addEventListener('keydown', handleTabKey);
    return () => document.removeEventListener('keydown', handleTabKey);
  }, []);

  // Keep lesson title/description editable DOM in sync with state without re-render flicker
  useEffect(() => {
    const titleEl = lessonTitleRef.current;
    if (titleEl && document.activeElement !== titleEl) {
      const targetHtml = lessonData.ModuleTitle || '';
      if (titleEl.innerHTML !== targetHtml) {
        titleEl.innerHTML = targetHtml;
      }
    }

    const descriptionEl = descriptionRef.current;
    if (descriptionEl && document.activeElement !== descriptionEl) {
      const targetHtml = lessonData.Description || '';
      if (descriptionEl.innerHTML !== targetHtml) {
        descriptionEl.innerHTML = targetHtml;
      }
    }
  }, [lessonData.ModuleTitle, lessonData.Description]);

  // Enable Ctrl/Cmd+Z and Ctrl/Cmd+Y (or Ctrl/Cmd+Shift+Z) for contentEditable fields
  useEffect(() => {
    const handleUndoRedoKey = (e) => {
      const isModifier = e.ctrlKey || e.metaKey;
      if (!isModifier) return;

      const key = (e.key || '').toLowerCase();
      if (key !== 'z' && key !== 'y') return;

      const activeEl = document.activeElement;
      const isContentEditable = activeEl && activeEl.getAttribute && activeEl.getAttribute('contenteditable') === 'true';
      if (!isContentEditable) return;

      e.preventDefault();

      const isRedo = key === 'y' || (key === 'z' && e.shiftKey);
      document.execCommand(isRedo ? 'redo' : 'undo', false, null);
    };

    document.addEventListener('keydown', handleUndoRedoKey);
    return () => document.removeEventListener('keydown', handleUndoRedoKey);
  }, []);

  // Fetch available simulations for the simulation picker
  useEffect(() => {
    const fetchSimulations = async () => {
      try {
        const response = await axios.get('/simulations');
        setAvailableSimulations(response.data || []);
      } catch (err) {
        console.error('Error fetching simulations:', err);
      }
    };
    fetchSimulations();
  }, []);

  const fetchLesson = async () => {
    try {
      const response = await axios.get(`/modules/${id}`);
      console.log('Fetched lesson data:', response.data);
      console.log('Sections from DB:', response.data.sections);
      
      setLessonData({
        ModuleTitle: response.data.ModuleTitle,
        Description: response.data.Description,
        LessonOrder: response.data.LessonOrder,
        Difficulty: response.data.Difficulty || 'Easy',
        LessonTime: { hours: 0, minutes: 30 },
        Tesda_Reference: response.data.Tesda_Reference || ''
      });
      
      // Load sections if they exist
      if (response.data.sections) {
        console.log('Setting sections:', response.data.sections);

        const apiBaseUrl = axios.defaults.baseURL || 'http://localhost:5000/api';
        const baseUrl = apiBaseUrl.replace('/api', '');
        const timestamp = new Date().getTime();

        const toDisplayUrl = (url) => {
          if (!url || typeof url !== 'string') return '';
          const normalizedUrl = url.replace(/\\/g, '/');
          const uploadPath = normalizedUrl.startsWith('uploads/') ? `/${normalizedUrl}` : normalizedUrl;
          if (url.startsWith('blob:')) return url;
          if (uploadPath.startsWith('http://') || uploadPath.startsWith('https://')) return uploadPath;
          if (uploadPath.startsWith('/uploads')) return `${baseUrl}${uploadPath}?t=${timestamp}`;
          return uploadPath;
        };

        const normalizeImageItem = (img) => {
          if (!img) return { url: '', file: null, fileName: '', caption: '' };
          if (typeof img === 'string') {
            return { url: toDisplayUrl(img), file: null, fileName: '', caption: '' };
          }
          return {
            ...img,
            url: toDisplayUrl(img.url || img.content || ''),
            file: null,
            fileName: img.fileName || '',
            caption: img.caption || ''
          };
        };
        
        // Process sections to ensure proper URLs and fields
        const processedSections = response.data.sections.map(section => {
          const processed = { ...section };
          
          // Ensure caption field exists for backward compatibility
          if (!processed.caption) {
            processed.caption = '';
          }

          // Process images array if present
          if (section.type === 'image') {
            if (Array.isArray(section.images) && section.images.length > 0) {
              processed.images = section.images.map(normalizeImageItem);
            } else if (section.content) {
              // Backward compatibility: older lessons may store a single image only in `content`.
              processed.images = [{ url: toDisplayUrl(section.content), file: null, fileName: '', caption: section.caption || '' }];
            } else {
              processed.images = [];
            }

            if (Array.isArray(section.layerImages) && section.layerImages.length > 0) {
              processed.layerImages = section.layerImages.map(layer =>
                (Array.isArray(layer) ? layer : [layer]).map(normalizeImageItem)
              );
            }
          }
          
          // Ensure layout field exists for image sections
          if (section.type === 'image' && !processed.layout) {
            // Auto-assign layout based on existing images
            const imgCount = (processed.images || []).length;
            if (imgCount > 0 || processed.content) {
              processed.layout = imgCount <= 1 ? 'single' : imgCount === 2 ? 'side-by-side' : imgCount === 3 ? 'grid-3' : 'grid-2x2';
            } else {
              processed.layout = '';
            }
          }
          
          // Convert server paths to full URLs for images and videos
          if ((section.type === 'image' || section.type === 'video') && section.content) {
            processed.content = toDisplayUrl(section.content);
          }
          
          return processed;
        });
        
        setSections(processedSections);
        console.log('Processed sections:', processedSections);
      } else {
        console.log('No sections found in response');
      }
      
      // Load assessment questions if they exist
      if (response.data.diagnosticQuestions) {
        setDiagnosticQuestions(response.data.diagnosticQuestions);
      }
      if (response.data.reviewQuestions) {
        setReviewQuestions(response.data.reviewQuestions);
      }
      if (response.data.finalQuestions) {
        setFinalQuestions(response.data.finalQuestions);
      }
      if (response.data.finalInstruction) {
        setFinalInstruction(response.data.finalInstruction);
      }
      if (response.data.roadmapStages && response.data.roadmapStages.length > 0) {
        setRoadmapStages(response.data.roadmapStages);
      }
    } catch (err) {
      console.error('Error fetching lesson:', err);
    }
  };

  // Helper function to strip HTML tags and clean text (for plain text fields like titles)
  const stripHtml = (html) => {
    if (!html) return '';
    // Create a temporary element to parse HTML
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    // Get text content (strips all HTML)
    let text = tmp.textContent || tmp.innerText || '';
    // Clean up extra whitespace and line breaks
    text = text.replace(/\s+/g, ' ').trim();
    return text;
  };

  // Helper to sanitize HTML - keeps only safe formatting tags for content areas
  // Handles paste from external sources (Word, Google Docs) preserving formatting
  const sanitizeHtml = (html) => {
    if (!html) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    
    const allowedTags = ['B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'BR', 'P', 'DIV', 'SPAN', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SUB', 'SUP'];
    
    // Helper to check if a style indicates bold (not normal weight)
    const isBoldStyle = (style) => {
      if (!style) return false;
      const match = style.match(/font-weight\s*:\s*([^;]+)/);
      if (!match) return false;
      const val = match[1].trim().toLowerCase();
      // normal/400/lighter/100-499 are NOT bold
      if (val === 'normal' || val === 'lighter' || val === 'inherit') return false;
      const num = parseInt(val, 10);
      if (!isNaN(num)) return num >= 700;
      return val === 'bold' || val === 'bolder';
    };

    const isItalicStyle = (style) => {
      if (!style) return false;
      const match = style.match(/font-style\s*:\s*([^;]+)/);
      if (!match) return false;
      const val = match[1].trim().toLowerCase();
      return val === 'italic' || val === 'oblique';
    };

    const isUnderlineStyle = (style) => {
      if (!style) return false;
      const match = style.match(/text-decoration[^:]*:\s*([^;]+)/);
      if (!match) return false;
      return match[1].toLowerCase().includes('underline');
    };

    const cleanNode = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent;
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName;
        const style = node.getAttribute('style') || '';
        const children = Array.from(node.childNodes).map(cleanNode).join('');
        if (!children.trim() && tagName !== 'BR') return '';
        
        if (allowedTags.includes(tagName)) {
          if (tagName === 'BR') return '<br>';
          if (tagName === 'UL') return `<ul>${children}</ul>`;
          if (tagName === 'OL') return `<ol>${children}</ol>`;
          if (tagName === 'LI') return `<li>${children}</li>`;
          // For B/STRONG/I/EM/U: check if style overrides the tag to normal
          // Google Docs uses <b style="font-weight:normal"> for non-bold text
          if (tagName === 'B' || tagName === 'STRONG') {
            const weightMatch = style.match(/font-weight\s*:\s*([^;]+)/);
            if (weightMatch) {
              const val = weightMatch[1].trim().toLowerCase();
              const num = parseInt(val, 10);
              if (val === 'normal' || val === 'lighter' || (!isNaN(num) && num < 700)) {
                return children; // Style overrides to non-bold, skip <b> tag
              }
            }
            return `<b>${children}</b>`;
          }
          if (tagName === 'I' || tagName === 'EM') {
            if (style.includes('font-style') && style.match(/font-style\s*:\s*normal/)) {
              return children; // Style overrides to non-italic
            }
            return `<i>${children}</i>`;
          }
          if (tagName === 'U') {
            if (style.includes('text-decoration') && style.match(/text-decoration[^:]*:\s*none/)) {
              return children; // Style overrides to no underline
            }
            return `<u>${children}</u>`;
          }
          if (tagName === 'SUB') return `<sub>${children}</sub>`;
          if (tagName === 'SUP') return `<sup>${children}</sup>`;
          if (/^H[1-6]$/.test(tagName)) return `<p><b>${children}</b></p>`;
          if (tagName === 'BLOCKQUOTE') return `<blockquote>${children}</blockquote>`;
          if (tagName === 'P') return `<p>${children}</p>`;
          if (tagName === 'DIV') return `<div>${children}</div>`;
          return children;
        }
        // Convert common external tags to allowed equivalents
        if (tagName === 'TABLE' || tagName === 'TBODY' || tagName === 'THEAD') return children;
        if (tagName === 'TR') return `<p>${children}</p>`;
        if (tagName === 'TD' || tagName === 'TH') return children + ' ';
        // Check inline styles for bold, italic, underline from non-allowed tags (e.g. <span>)
        let result = children;
        if (isBoldStyle(style)) result = `<b>${result}</b>`;
        if (isItalicStyle(style)) result = `<i>${result}</i>`;
        if (isUnderlineStyle(style)) result = `<u>${result}</u>`;
        return result;
      }
      return '';
    };
    
    return cleanNode(tmp);
  };

  // Handle rich text paste for content areas (paragraph, caption)
  const handleRichPaste = (e, sectionId, field) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const plainText = e.clipboardData.getData('text/plain');
    
    if (html) {
      // Paste from rich source - sanitize and insert as HTML
      const clean = sanitizeHtml(html);
      document.execCommand('insertHTML', false, clean);
    } else if (plainText) {
      // Plain text paste - preserve newlines and indentation
      const htmlText = plainText
        .split('\n')
        .map(line => {
          if (!line.trim()) return '<br>';
          // Preserve leading spaces as non-breaking spaces for indentation
          const indent = line.match(/^(\s*)/)[1];
          const nbsp = indent.replace(/ /g, '&nbsp;').replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
          return nbsp + line.trim();
        })
        .join('<br>');
      document.execCommand('insertHTML', false, htmlText);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setLessonData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleTimeChange = (type, value) => {
    setLessonData(prev => ({
      ...prev,
      LessonTime: {
        ...prev.LessonTime,
        [type]: parseInt(value) || 0
      }
    }));
  };

  const handleDifficultyChange = (difficulty) => {
    setLessonData(prev => ({
      ...prev,
      Difficulty: difficulty
    }));
  };

  const handleAddSection = () => {
    setShowSectionModal(true);
  };

  const handleAddQuestion = (type) => {
    const newQuestion = {
      id: Date.now(),
      question: '',
      skill: type === 'review' ? 'No Skill' : 'Memorization',
      options: ['', '', '', ''],
      correctAnswer: 0
    };

    if (type === 'diagnostic') {
      setDiagnosticQuestions([...diagnosticQuestions, newQuestion]);
    } else if (type === 'review') {
      setReviewQuestions([...reviewQuestions, newQuestion]);
    } else if (type === 'final') {
      setFinalQuestions([...finalQuestions, newQuestion]);
    }
  };

  const handleDeleteQuestion = (type, questionId) => {
    if (type === 'diagnostic') {
      setDiagnosticQuestions(diagnosticQuestions.filter(q => q.id !== questionId));
    } else if (type === 'review') {
      setReviewQuestions(reviewQuestions.filter(q => q.id !== questionId));
    } else if (type === 'final') {
      setFinalQuestions(finalQuestions.filter(q => q.id !== questionId));
    }
  };

  const handleQuestionChange = (type, questionId, field, value) => {
    const updateQuestions = (questions) => 
      questions.map(q => q.id === questionId ? { ...q, [field]: value } : q);

    if (type === 'diagnostic') {
      setDiagnosticQuestions(updateQuestions(diagnosticQuestions));
    } else if (type === 'review') {
      setReviewQuestions(updateQuestions(reviewQuestions));
    } else if (type === 'final') {
      setFinalQuestions(updateQuestions(finalQuestions));
    }
  };

  const handleOptionChange = (type, questionId, optionIndex, value) => {
    const updateQuestions = (questions) => 
      questions.map(q => {
        if (q.id === questionId) {
          const newOptions = [...q.options];
          newOptions[optionIndex] = value;
          return { ...q, options: newOptions };
        }
        return q;
      });

    if (type === 'diagnostic') {
      setDiagnosticQuestions(updateQuestions(diagnosticQuestions));
    } else if (type === 'review') {
      setReviewQuestions(updateQuestions(reviewQuestions));
    } else if (type === 'final') {
      setFinalQuestions(updateQuestions(finalQuestions));
    }
  };

  const handleAddMaterial = (type) => {
    const newSection = {
      id: Date.now(),
      type,
      title: '',
      content: '',
      caption: '',
      images: type === 'image' ? [] : undefined,
      layout: type === 'image' ? '' : undefined,
      contentLayout: type === 'paragraph' ? 'text' : undefined,
      tableData: type === 'paragraph' ? null : undefined,
      questions: type === 'review-multiple-choice' ? [] : undefined,
      simulationId: type === 'review-drag-drop' ? null : undefined,
      simulation: type === 'review-drag-drop' ? null : undefined,
      order: sections.length + 1
    };
    if (insertAtIndex !== null) {
      const updated = [...sections];
      updated.splice(insertAtIndex, 0, newSection);
      setSections(updated);
    } else {
      setSections([...sections, newSection]);
    }
    setShowSectionModal(false);
    setInsertAtIndex(null);
  };

  // Paragraph layout options
  const PARAGRAPH_LAYOUTS = [
    { id: 'text', label: 'Normal Text', desc: 'Standard paragraph content', icon: '📝' },
    { id: 'table', label: 'Table', desc: 'Structured table layout', icon: '📊' },
  ];

  // Paragraph layout picker state
  const [paragraphLayoutPicker, setParagraphLayoutPicker] = useState(null);

  const handleSelectParagraphLayout = (sectionId, layoutId) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      if (layoutId === 'table' && !s.tableData) {
        return { ...s, contentLayout: 'table', tableData: { headers: ['Header 1', 'Header 2'], rows: [['', '']] } };
      }
      return { ...s, contentLayout: layoutId, tableData: layoutId === 'text' ? s.tableData : s.tableData };
    }));
    setParagraphLayoutPicker(null);
  };

  const handleAddTableToSection = (sectionId) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      return { ...s, contentLayout: 'table', tableData: s.tableData || { headers: ['Header 1', 'Header 2'], rows: [['', '']] } };
    }));
  };

  const handleTableHeaderChange = (sectionId, colIdx, value) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId || !s.tableData) return s;
      const newHeaders = [...s.tableData.headers];
      newHeaders[colIdx] = value;
      return { ...s, tableData: { ...s.tableData, headers: newHeaders } };
    }));
  };

  const handleTableCellChange = (sectionId, rowIdx, colIdx, value) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId || !s.tableData) return s;
      const newRows = s.tableData.rows.map((row, rIdx) => {
        if (rIdx !== rowIdx) return row;
        const newRow = [...row];
        newRow[colIdx] = value;
        return newRow;
      });
      return { ...s, tableData: { ...s.tableData, rows: newRows } };
    }));
  };

  const handleAddTableRow = (sectionId) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId || !s.tableData) return s;
      const colCount = s.tableData.headers.length;
      return { ...s, tableData: { ...s.tableData, rows: [...s.tableData.rows, new Array(colCount).fill('')] } };
    }));
  };

  const handleRemoveTableRow = (sectionId, rowIdx) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId || !s.tableData) return s;
      if (s.tableData.rows.length <= 1) return s;
      return { ...s, tableData: { ...s.tableData, rows: s.tableData.rows.filter((_, i) => i !== rowIdx) } };
    }));
  };

  const handleAddTableColumn = (sectionId) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId || !s.tableData) return s;
      const newHeaders = [...s.tableData.headers, `Header ${s.tableData.headers.length + 1}`];
      const newRows = s.tableData.rows.map(row => [...row, '']);
      return { ...s, tableData: { ...s.tableData, headers: newHeaders, rows: newRows } };
    }));
  };

  const handleRemoveTableColumn = (sectionId, colIdx) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId || !s.tableData) return s;
      if (s.tableData.headers.length <= 1) return s;
      const newHeaders = s.tableData.headers.filter((_, i) => i !== colIdx);
      const newRows = s.tableData.rows.map(row => row.filter((_, i) => i !== colIdx));
      return { ...s, tableData: { ...s.tableData, headers: newHeaders, rows: newRows } };
    }));
  };

  // Image collage layout options
  const IMAGE_LAYOUTS = [
    { id: 'single', label: 'Single Image', desc: 'One image at full width', slots: 1, icon: '🖼️' },
    { id: 'side-by-side', label: 'Side by Side', desc: 'Two equal images in a row', slots: 2, icon: '◧◨' },
    { id: 'grid-2x2', label: '2 × 2 Grid', desc: 'Four images in a square grid', slots: 4, icon: '⊞' },
    { id: 'grid-3', label: '3 Column', desc: 'Three equal images in one row', slots: 3, icon: '▤▤▤' },
    { id: 'one-plus-two', label: '1 + 2 Collage', desc: 'One large image on top, two smaller below', slots: 3, icon: '🔲▫▫' },
    { id: 'two-plus-one', label: '2 + 1 Collage', desc: 'Two smaller on top, one large below', slots: 3, icon: '▫▫🔲' },
    { id: 'big-left', label: 'Big Left + 2 Right', desc: 'Large image on left, two stacked on right', slots: 3, icon: '◧▢▢' },
    { id: 'big-right', label: '2 Left + Big Right', desc: 'Two stacked on left, large image on right', slots: 3, icon: '▢▢◨' },
    { id: 'mosaic', label: 'Mosaic (5)', desc: 'One hero image with four smaller tiles', slots: 5, icon: '▦' },
    { id: 'text-left', label: 'Text Left + Image', desc: 'Text on the left half, image on the right half', slots: 1, icon: '📝🖼️' },
    { id: 'text-right', label: 'Image + Text Right', desc: 'Image on the left half, text on the right half', slots: 1, icon: '🖼️📝' },
  ];

  const handleSelectImageLayout = (sectionId, layout) => {
    const slots = layout.slots;
    setSections(prevSections => prevSections.map(section => {
      if (section.id !== sectionId) return section;
      // Create image slots based on layout
      const currentImages = section.images || [];
      let newImages = [...currentImages];
      // Add slots if needed, keep existing images
      while (newImages.length < slots) {
        newImages.push({ url: '', file: null, fileName: '', caption: '' });
      }
      // For text+image layouts, initialize sideTexts and layerImages
      const updated = { ...section, layout: layout.id, images: newImages };
      if (layout.id === 'text-left' || layout.id === 'text-right') {
        if (!updated.sideTexts) {
          updated.sideTexts = section.sideText ? [section.sideText] : [''];
        }
        if (!updated.layerImages) {
          // Convert flat images to layerImages 2D array (one image per layer)
          updated.layerImages = (updated.sideTexts || ['']).map((_, i) => {
            const img = newImages[i] || { url: '', file: null, fileName: '', caption: '' };
            return [img];
          });
        }
      }
      return updated;
    }));
    setLayoutPickerSection(null);
  };

  // Text+Image layer helpers
  const handleAddTextImageLayer = (sectionId) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const newTexts = [...(s.sideTexts || ['']), ''];
      const newLayerImages = [...(s.layerImages || [[{ url: '', file: null, fileName: '', caption: '' }]]), [{ url: '', file: null, fileName: '', caption: '' }]];
      return { ...s, sideTexts: newTexts, layerImages: newLayerImages };
    }));
  };

  const handleRemoveTextImageLayer = (sectionId, layerIdx) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const layerCount = (s.sideTexts || ['']).length;
      if (layerCount <= 1) return s;
      const newTexts = (s.sideTexts || ['']).filter((_, i) => i !== layerIdx);
      const newLayerImages = (s.layerImages || []).filter((_, i) => i !== layerIdx);
      return { ...s, sideTexts: newTexts, layerImages: newLayerImages };
    }));
  };

  const handleSideTextChange = (sectionId, layerIdx, value) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const newTexts = [...(s.sideTexts || [''])];
      newTexts[layerIdx] = value;
      return { ...s, sideTexts: newTexts };
    }));
  };

  const handleClearSideText = (sectionId, layerIdx) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const newTexts = [...(s.sideTexts || [''])];
      newTexts[layerIdx] = '';
      return { ...s, sideTexts: newTexts };
    }));

    const el = document.getElementById(`sidetext-${sectionId}-${layerIdx}`);
    if (el) el.innerHTML = '';
  };

  const handleAddLayerImage = (sectionId, layerIdx) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const newLayerImages = (s.layerImages || []).map((layer, i) => {
        if (i !== layerIdx) return layer;
        return [...layer, { url: '', file: null, fileName: '', caption: '' }];
      });
      return { ...s, layerImages: newLayerImages };
    }));
  };

  const handleRemoveLayerImage = (sectionId, layerIdx, imgIdx) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const newLayerImages = (s.layerImages || []).map((layer, i) => {
        if (i !== layerIdx) return layer;
        if (layer.length <= 1) return layer;
        return layer.filter((_, j) => j !== imgIdx);
      });
      return { ...s, layerImages: newLayerImages };
    }));
  };

  const handleClearLayerImage = (sectionId, layerIdx, imgIdx) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const newLayerImages = (s.layerImages || []).map((layer, i) => {
        if (i !== layerIdx) return layer;
        const newLayer = [...layer];
        newLayer[imgIdx] = { url: '', file: null, fileName: '', caption: '' };
        return newLayer;
      });
      return { ...s, layerImages: newLayerImages };
    }));
  };

  const handleLayerImageUpload = (sectionId, layerIdx, imgIdx, event) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size / (1024 * 1024) > 10) return;
    const fileUrl = URL.createObjectURL(file);
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const newLayerImages = (s.layerImages || []).map((layer, i) => {
        if (i !== layerIdx) return layer;
        const newLayer = [...layer];
        newLayer[imgIdx] = { ...newLayer[imgIdx], url: fileUrl, file, fileName: file.name };
        return newLayer;
      });
      return { ...s, layerImages: newLayerImages };
    }));
  };

  const handleLayerPasteImage = (sectionId, layerIdx, imgIdx, e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (!file || file.size / (1024 * 1024) > 10) return;
        const fileUrl = URL.createObjectURL(file);
        setSections(prev => prev.map(s => {
          if (s.id !== sectionId) return s;
          const newLayerImages = (s.layerImages || []).map((layer, li) => {
            if (li !== layerIdx) return layer;
            const newLayer = [...layer];
            newLayer[imgIdx] = { url: fileUrl, file, fileName: file.name || 'pasted-image.png' };
            return newLayer;
          });
          return { ...s, layerImages: newLayerImages };
        }));
        return;
      }
    }
  };

  // Section-level question helpers (for review-multiple-choice sections)
  const handleAddSectionQuestion = (sectionId) => {
    const newQ = { id: Date.now(), question: '', skill: 'No Skill', options: ['', '', '', ''], correctAnswer: 0 };
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, questions: [...(s.questions || []), newQ] } : s));
  };

  const handleDeleteSectionQuestion = (sectionId, questionId) => {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, questions: (s.questions || []).filter(q => q.id !== questionId) } : s));
  };

  const handleSectionQuestionChange = (sectionId, questionId, field, value) => {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, questions: (s.questions || []).map(q => q.id === questionId ? { ...q, [field]: value } : q) } : s));
  };

  const handleSectionOptionChange = (sectionId, questionId, optionIndex, value) => {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, questions: (s.questions || []).map(q => {
      if (q.id === questionId) { const newOpts = [...q.options]; newOpts[optionIndex] = value; return { ...q, options: newOpts }; }
      return q;
    }) } : s));
  };

  const handleSectionSimulationSelect = (sectionId, sim) => {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, simulationId: sim.SimulationID, simulation: sim } : s));
  };

  const handleDeleteSection = (sectionId) => {
    setSections(sections.filter(section => section.id !== sectionId));
  };

  const handleChangeMaterial = (sectionId, newType) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      if (s.type === newType) return s;
      return {
        id: s.id,
        type: newType,
        title: '',
        content: '',
        caption: '',
        images: newType === 'image' ? [] : undefined,
        layout: newType === 'image' ? '' : undefined,
        contentLayout: newType === 'paragraph' ? 'text' : undefined,
        tableData: newType === 'paragraph' ? null : undefined,
        questions: newType === 'review-multiple-choice' ? [] : undefined,
        simulationId: newType === 'review-drag-drop' ? null : undefined,
        simulation: newType === 'review-drag-drop' ? null : undefined,
        order: s.order
      };
    }));
    setChangeMaterialPicker(null);
  };

  const handleSectionContentChange = (sectionId, field, value) => {
    setSections(prevSections => prevSections.map(section => 
      section.id === sectionId 
        ? { ...section, [field]: value }
        : section
    ));
  };

  const handleFileUpload = async (sectionId, event, fileType) => {
    const file = event.target.files[0];
    if (!file) return;

    // Define size limits in MB
    const MAX_IMAGE_SIZE = 10; // 10MB
    const MAX_VIDEO_SIZE = 100; // 100MB
    const maxSize = fileType === 'image' ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;
    const fileSizeMB = file.size / (1024 * 1024);

    // Validate file size
    if (fileSizeMB > maxSize) {
      console.error(`File size exceeds ${maxSize}MB limit. Your file is ${fileSizeMB.toFixed(2)}MB.`);
      event.target.value = ''; // Reset input
      return;
    }

    // Validate file type
    if (fileType === 'image' && !file.type.startsWith('image/')) {
      console.error('Please select a valid image file (PNG, JPG, GIF, etc.).');
      event.target.value = '';
      return;
    }

    if (fileType === 'video' && !file.type.startsWith('video/')) {
      console.error('Please select a valid video file (MP4, WebM, etc.).');
      event.target.value = '';
      return;
    }

    try {
      // Create object URL for local preview
      const fileUrl = URL.createObjectURL(file);
      
      // Store both the URL and file object
      setSections(sections.map(section => 
        section.id === sectionId 
          ? { ...section, content: fileUrl, file: file, fileName: file.name }
          : section
      ));
    } catch (err) {
      console.error('Error loading file:', err);
      event.target.value = '';
    }
  };

  const handlePasteImage = (sectionId, e, imageIndex) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (!file) return;
        const fileSizeMB = file.size / (1024 * 1024);
        if (fileSizeMB > 10) {
          console.error(`Image exceeds 10MB limit. Your file is ${fileSizeMB.toFixed(2)}MB.`);
          return;
        }
        const fileUrl = URL.createObjectURL(file);
        if (imageIndex !== undefined) {
          setSections(prev => prev.map(section => {
            if (section.id !== sectionId) return section;
            const imgs = [...(section.images || [])];
            imgs[imageIndex] = { url: fileUrl, file, fileName: file.name || 'pasted-image.png' };
            return { ...section, images: imgs, content: imgs[0]?.url || fileUrl, file: imgs[0]?.file || file, fileName: imgs[0]?.fileName || file.name };
          }));
        } else {
          setSections(prev => prev.map(section =>
            section.id === sectionId
              ? { ...section, content: fileUrl, file: file, fileName: file.name || 'pasted-image.png' }
              : section
          ));
        }
        return;
      }
    }
  };

  const handleAddImageSlot = (sectionId) => {
    setSections(prev => prev.map(section => {
      if (section.id !== sectionId) return section;
      const imgs = [...(section.images || [])];
      if (section.content && imgs.length === 0) {
        imgs.push({ url: section.content, file: section.file || null, fileName: section.fileName || '' });
      }
      imgs.push({ url: '', file: null, fileName: '', caption: '' });
      return { ...section, images: imgs };
    }));
  };

  const handleRemoveImageSlot = (sectionId, imageIndex) => {
    setSections(prev => prev.map(section => {
      if (section.id !== sectionId) return section;
      const imgs = [...(section.images || [])];
      imgs.splice(imageIndex, 1);
      const firstImg = imgs[0] || null;
      return {
        ...section,
        images: imgs.length > 0 ? imgs : [],
        content: firstImg?.url || '',
        file: firstImg?.file || null,
        fileName: firstImg?.fileName || ''
      };
    }));
  };

  const handleImageSlotUpload = (sectionId, imageIndex, event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > 10) {
      console.error(`Image exceeds 10MB limit. Your file is ${fileSizeMB.toFixed(2)}MB.`);
      return;
    }
    const fileUrl = URL.createObjectURL(file);
    setSections(prev => prev.map(section => {
      if (section.id !== sectionId) return section;
      const imgs = [...(section.images || [])];
      imgs[imageIndex] = { ...imgs[imageIndex], url: fileUrl, file, fileName: file.name };
      return { ...section, images: imgs, content: imgs[0]?.url || fileUrl, file: imgs[0]?.file || file, fileName: imgs[0]?.fileName || file.name };
    }));
  };

  const handleImageCaptionChange = (sectionId, imageIndex, value) => {
    setSections(prev => prev.map(section => {
      if (section.id !== sectionId) return section;
      const imgs = [...(section.images || [])];
      if (imgs[imageIndex]) {
        imgs[imageIndex] = { ...imgs[imageIndex], caption: value };
      }
      return { ...section, images: imgs };
    }));
  };

  const handleDragStart = (e, section) => {
    setDraggedSection(section);
    e.dataTransfer.effectAllowed = 'move';
    
    // Create a clean, fully opaque drag image clone
    const sectionElement = e.target.closest('.bg-white.border-2');
    if (sectionElement) {
      const clone = sectionElement.cloneNode(true);
      clone.style.position = 'absolute';
      clone.style.top = '-9999px';
      clone.style.left = '-9999px';
      clone.style.opacity = '1';
      clone.style.transform = 'none';
      clone.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
      clone.style.width = sectionElement.offsetWidth + 'px';
      clone.style.background = 'white';
      clone.style.borderRadius = '8px';
      clone.style.zIndex = '99999';
      clone.style.pointerEvents = 'none';
      document.body.appendChild(clone);
      e.dataTransfer.setDragImage(clone, sectionElement.offsetWidth / 2, sectionElement.offsetHeight / 2);
      setTimeout(() => { if (clone.parentNode) clone.parentNode.removeChild(clone); }, 0);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    // Auto-scroll when dragging near edges
    const scrollMargin = 100;
    const scrollSpeed = 15;
    const mouseY = e.clientY;
    const windowHeight = window.innerHeight;
    
    if (mouseY < scrollMargin) {
      // Near top - scroll up
      window.scrollBy({ top: -scrollSpeed, behavior: 'auto' });
    } else if (mouseY > windowHeight - scrollMargin) {
      // Near bottom - scroll down
      window.scrollBy({ top: scrollSpeed, behavior: 'auto' });
    }
  };

  const handleDragEnter = (e, section) => {
    e.preventDefault();
    if (draggedSection && draggedSection.id !== section.id) {
      setDragOverSection(section);
    }
  };

  const handleDrop = (e, targetSection) => {
    e.preventDefault();

    // Use dragOverSection if available (for preview accuracy), otherwise use targetSection
    const dropTarget = dragOverSection || targetSection;

    if (!draggedSection || draggedSection.id === dropTarget.id) {
      setDragOverSection(null);
      return;
    }

    const draggedIndex = sections.findIndex(s => s.id === draggedSection.id);
    const targetIndex = sections.findIndex(s => s.id === dropTarget.id);

    const newSections = [...sections];
    // Remove dragged item first
    const [removed] = newSections.splice(draggedIndex, 1);
    
    // Calculate new index after removal
    // If dragging down (draggedIndex < targetIndex), target moves up by 1
    const adjustedTargetIndex = draggedIndex < targetIndex ? targetIndex : targetIndex;
    
    // Insert at the adjusted position
    newSections.splice(adjustedTargetIndex, 0, removed);

    setSections(newSections);
    setDraggedSection(null);
    setDragOverSection(null);
  };

  const handleDragEnd = () => {
    setDraggedSection(null);
    setDragOverSection(null);
  };

  // Get display order for sections with preview
  const getDisplaySections = () => {
    if (!draggedSection || !dragOverSection) return sections;

    const draggedIndex = sections.findIndex(s => s.id === draggedSection.id);
    const targetIndex = sections.findIndex(s => s.id === dragOverSection.id);

    if (draggedIndex === -1 || targetIndex === -1) return sections;

    const reordered = [...sections];
    // Remove dragged item
    const [removed] = reordered.splice(draggedIndex, 1);
    
    // Calculate adjusted target index (same logic as drop)
    const adjustedTargetIndex = draggedIndex < targetIndex ? targetIndex : targetIndex;
    
    // Insert at adjusted position
    reordered.splice(adjustedTargetIndex, 0, removed);

    return reordered;
  };

  // Text Formatting Functions
  const applyTextFormat = (format) => {
    if (!activeTextarea) return;
    
    const element = document.getElementById(activeTextarea);
    if (!element) return;

    // Check if element is contentEditable
    const isContentEditable = element.contentEditable === 'true';

    if (isContentEditable) {
      // Handle contentEditable formatting with execCommand
      const selection = window.getSelection();
      if (!selection.rangeCount) return;

      const selectedText = selection.toString();
      const noSelectionRequired = [
        'bullet',
        'numbering',
        'indent',
        'outdent',
        'align-left',
        'align-center',
        'align-right',
        'align-justify',
        'undo',
        'redo'
      ];
      if (!selectedText && !noSelectionRequired.includes(format)) return;

      switch(format) {
        case 'bold':
          document.execCommand('bold', false, null);
          break;
        case 'italic':
          document.execCommand('italic', false, null);
          break;
        case 'underline':
          document.execCommand('underline', false, null);
          break;
        case 'uppercase':
          if (selectedText) {
            document.execCommand('insertText', false, selectedText.toUpperCase());
          }
          break;
        case 'lowercase':
          if (selectedText) {
            document.execCommand('insertText', false, selectedText.toLowerCase());
          }
          break;
        case 'capitalize':
          if (selectedText) {
            const capitalized = selectedText.split(' ').map(word => 
              word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
            ).join(' ');
            document.execCommand('insertText', false, capitalized);
          }
          break;
        case 'bullet':
          document.execCommand('insertUnorderedList', false, null);
          break;
        case 'numbering':
          document.execCommand('insertOrderedList', false, null);
          break;
        case 'indent':
          document.execCommand('indent', false, null);
          break;
          break;
        case 'outdent':
          document.execCommand('outdent', false, null);
          break;
        case 'align-left':
          document.execCommand('justifyLeft', false, null);
          break;
        case 'align-center':
          document.execCommand('justifyCenter', false, null);
          break;
        case 'align-right':
          document.execCommand('justifyRight', false, null);
          break;
        case 'align-justify':
          document.execCommand('justifyFull', false, null);
          break;
        case 'undo':
          document.execCommand('undo', false, null);
          break;
        case 'redo':
          document.execCommand('redo', false, null);
          break;
        default:
          break;
      }
      
      element.focus();
    } else {
      // Handle input/textarea formatting with text markers
      const start = element.selectionStart;
      const end = element.selectionEnd;
      const selectedText = element.value.substring(start, end);
      const beforeText = element.value.substring(0, start);
      const afterText = element.value.substring(end);

      let formattedText = selectedText;
      let newContent = '';

      switch(format) {
        case 'bold':
          formattedText = `**${selectedText}**`;
          break;
        case 'italic':
          formattedText = `*${selectedText}*`;
          break;
        case 'underline':
          formattedText = `__${selectedText}__`;
          break;
        case 'uppercase':
          formattedText = selectedText.toUpperCase();
          break;
        case 'lowercase':
          formattedText = selectedText.toLowerCase();
          break;
        case 'capitalize':
          formattedText = selectedText.split(' ').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
          ).join(' ');
          break;
        case 'bullet':
          const bulletLines = selectedText.split('\n').map(line => line.trim() ? `• ${line}` : line).join('\n');
          formattedText = bulletLines;
          break;
        case 'numbering':
          const numberedLines = selectedText.split('\n').filter(line => line.trim()).map((line, idx) => `${idx + 1}. ${line}`).join('\n');
          formattedText = numberedLines;
          break;
        case 'align-left':
        case 'align-center':
        case 'align-right':
        case 'align-justify':
          // Alignment commands are only for contentEditable fields.
          return;
        case 'indent':
          formattedText = selectedText.split('\n').map(line => '\t' + line).join('\n');
          break;
        case 'outdent':
          formattedText = selectedText.split('\n').map(line => line.replace(/^\t/, '')).join('\n');
          break;
        default:
          break;
      }

      newContent = beforeText + formattedText + afterText;

      // Determine which field type and update accordingly
      if (activeTextarea === 'input-lesson-title') {
        setLessonData(prev => ({ ...prev, ModuleTitle: newContent }));
      } else if (activeTextarea === 'textarea-description') {
        setLessonData(prev => ({ ...prev, Description: newContent }));
      } else if (activeTextarea.startsWith('input-topic-')) {
        const sectionId = activeTextarea.split('-')[2];
        handleSectionContentChange(parseInt(sectionId), 'title', newContent);
      } else if (activeTextarea.startsWith('input-subtopic-')) {
        const sectionId = activeTextarea.split('-')[2];
        handleSectionContentChange(parseInt(sectionId), 'title', newContent);
      } else if (activeTextarea.startsWith('textarea-')) {
        const sectionId = activeTextarea.split('-')[1];
        handleSectionContentChange(parseInt(sectionId), 'content', newContent);
      }

      // Restore cursor position
      setTimeout(() => {
        element.focus();
        element.setSelectionRange(start + formattedText.length, start + formattedText.length);
      }, 0);
    }
  };

  const getSectionDisplayTitle = (section) => {
    const titles = {
      'topic': 'Topic Title',
      'subtopic': 'Subtopic Title',
      'paragraph': 'Paragraph',
      'image': 'Image',
      'video': 'Video',
      'review-multiple-choice': 'Review - Multiple Choice',
      'review-drag-drop': 'Review - Drag and Drop',
      'references': 'References'
    };
    return titles[section.type] || section.type;
  };

  // Roadmap stage management
  const handleAddStage = (type) => {
    const labels = {
      'diagnostic': 'Diagnostic',
      'review': 'Review Assessment',
      'lesson': 'Lesson',
      'final': 'Final Assessment',
      'simulation': 'Simulation',
    };
    const newStage = {
      id: `${type}-${Date.now()}`,
      type,
      label: labels[type],
    };
    setRoadmapStages(prev => [...prev, newStage]);
    setActiveStage(type);
    setShowAddStageModal(false);
    if (type === 'simulation') {
      setShowSimulationPicker(true);
    }
  };

  const handleRemoveStage = (stageId) => {
    setRoadmapStages(prev => {
      const removedStage = prev.find(s => s.id === stageId);
      const updated = prev.filter(s => s.id !== stageId);
      if (removedStage && activeStage === removedStage.type && updated.length > 0) {
        setActiveStage(updated[0].type);
      }
      if (removedStage && removedStage.type === 'simulation') {
        setSelectedSimulation(null);
      }
      return updated;
    });
  };

  const handleStageDragStart = (e, stage) => {
    setDraggedStage(stage);
    e.dataTransfer.effectAllowed = 'move';

    // Create a clean, fully opaque drag image
    const el = e.currentTarget;
    const clone = el.cloneNode(true);
    clone.style.position = 'absolute';
    clone.style.top = '-9999px';
    clone.style.left = '-9999px';
    clone.style.opacity = '1';
    clone.style.transform = 'none';
    clone.style.zIndex = '99999';
    clone.style.pointerEvents = 'none';
    document.body.appendChild(clone);
    e.dataTransfer.setDragImage(clone, el.offsetWidth / 2, el.offsetHeight / 2);
    setTimeout(() => { if (clone.parentNode) clone.parentNode.removeChild(clone); }, 0);
  };

  const handleStageDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleStageDragEnter = (e, stage) => {
    e.preventDefault();
    if (draggedStage && draggedStage.id !== stage.id) {
      setDragOverStageId(stage.id);
    }
  };

  const handleStageDrop = (e, targetStage) => {
    e.preventDefault();
    if (!draggedStage || draggedStage.id === targetStage.id) {
      setDraggedStage(null);
      setDragOverStageId(null);
      return;
    }
    const dragIdx = roadmapStages.findIndex(s => s.id === draggedStage.id);
    const targetIdx = roadmapStages.findIndex(s => s.id === targetStage.id);
    const newStages = [...roadmapStages];
    const [removed] = newStages.splice(dragIdx, 1);
    newStages.splice(targetIdx, 0, removed);
    setRoadmapStages(newStages);
    setDraggedStage(null);
    setDragOverStageId(null);
  };

  const handleStageDragEnd = () => {
    setDraggedStage(null);
    setDragOverStageId(null);
  };

  const isStageTypeInRoadmap = (type) => {
    return roadmapStages.some(s => s.type === type);
  };

  const handleSaveLesson = async () => {
    // Use state values directly (they are updated via onInput and onBlur)
    const currentTitle = lessonData.ModuleTitle;
    const currentDescription = lessonData.Description;
    
    if (!currentTitle || !currentTitle.trim()) {
      console.error('Please enter a lesson title');
      return;
    }

    if (!lessonData.LessonOrder || lessonData.LessonOrder < 1) {
      console.error('Please enter a valid lesson number');
      return;
    }

    setLoading(true);
    try {
      // Upload any image/video files to server first
      const uploadedSections = await Promise.all(
        sections.map(async (section) => {
          // Handle multi-image sections
          if (section.type === 'image' && section.images && section.images.length > 0) {
            const uploadSingleImg = async (img) => {
              if (img.file && img.url?.startsWith('blob:')) {
                try {
                  const formData = new FormData();
                  formData.append('file', img.file);
                  formData.append('type', 'image');
                  const uploadResponse = await axios.post('/admin/upload-media', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                  });
                  return { url: uploadResponse.data.url, file: null, fileName: null, caption: img.caption || '' };
                } catch (uploadErr) {
                  console.error('Failed to upload image:', uploadErr);
                  throw uploadErr;
                }
              }
              if (img.url && (img.url.startsWith('http://') || img.url.startsWith('https://'))) {
                try {
                  const url = new URL(img.url);
                  return { url: url.pathname, file: null, fileName: null, caption: img.caption || '' };
                } catch (e) {
                  return { ...img, file: null, fileName: null };
                }
              }
              return { ...img, file: null, fileName: null };
            };

            // Upload layerImages if present (text+image layouts)
            let uploadedLayerImages = undefined;
            if (section.layerImages && section.layerImages.length > 0) {
              uploadedLayerImages = await Promise.all(
                section.layerImages.map(async (layer) => 
                  Promise.all(layer.map(uploadSingleImg))
                )
              );
            }

            const uploadedImages = await Promise.all(
              section.images.map(uploadSingleImg)
            );
            return {
              ...section,
              images: uploadedImages,
              layerImages: uploadedLayerImages,
              content: uploadedImages[0]?.url || '',
              file: null,
              fileName: null
            };
          }
          // Check if section has a file that needs uploading (blob URL)
          if ((section.type === 'image' || section.type === 'video') && 
              section.file && 
              section.content?.startsWith('blob:')) {
            try {
              const formData = new FormData();
              formData.append('file', section.file);
              formData.append('type', section.type);
              
              const uploadResponse = await axios.post('/admin/upload-media', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
              });
              
              // Return section with server URL instead of blob URL
              return {
                ...section,
                content: uploadResponse.data.url,
                file: null, // Remove file object after upload
                fileName: null // Remove fileName after upload
              };
            } catch (uploadErr) {
              console.error('Failed to upload media:', uploadErr);
              throw uploadErr;
            }
          }
          
          // If it's a full URL (from edit mode), convert back to relative path for storage
          if ((section.type === 'image' || section.type === 'video') && 
              section.content && 
              (section.content.startsWith('http://') || section.content.startsWith('https://'))) {
            try {
              const url = new URL(section.content);
              // Remove cache busting query parameters and extract just the path
              const cleanPath = url.pathname;
              return {
                ...section,
                content: cleanPath, // Store just the path like /uploads/lessons/image.jpg
                file: null,
                fileName: null
              };
            } catch (e) {
              // If URL parsing fails, keep as is
              return { ...section, file: null, fileName: null };
            }
          }
          
          // Return section as-is if no file to upload
          return { ...section, file: null, fileName: null };
        })
      );

      const payload = {
        ModuleTitle: currentTitle,
        Description: currentDescription,
        LessonOrder: lessonData.LessonOrder,
        LessonTime: lessonData.LessonTime,
        Difficulty: lessonData.Difficulty,
        Tesda_Reference: lessonData.Tesda_Reference || '',
        sections: uploadedSections,
        diagnosticQuestions: diagnosticQuestions,
        reviewQuestions: reviewQuestions,
        finalQuestions: finalQuestions,
        finalInstruction: finalInstruction,
        roadmapStages: roadmapStages,
        selectedSimulationId: selectedSimulation?.SimulationID || null
      };

      console.log('Saving lesson with payload:', {
        ...payload,
        sectionsCount: sections.length,
        sections: sections
      });

      if (isEditMode) {
        const response = await axios.put(`/admin/modules/${id}`, payload);
        console.log('Backend response:', response.data);
        navigate('/admin/lessons');
      } else {
        const response = await axios.post('/admin/modules', payload);
        console.log('Backend response:', response.data);
        navigate('/admin/lessons');
      }
    } catch (err) {
      console.error('Error saving lesson:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <AdminNavbar />
      
      <div className="w-full px-8 py-8">
        {/* Header with Back Button */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate('/admin/lessons')}
            className="p-3 hover:bg-white rounded-lg transition-all group"
            title="Back to Lessons"
          >
            <svg className="w-8 h-8 text-[#1e5a8e] group-hover:text-[#2BC4B3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-4xl font-bold text-[#1e5a8e]">
            {isEditMode ? 'Edit Lesson' : 'Add Lesson'}
          </h1>
        </div>

        {/* Roadmap */}
        <div className="bg-white rounded-xl shadow-sm p-8 mb-6">
          <div className="flex items-center relative">
            {/* Connecting Line */}
            <div className="absolute top-6 left-0 right-0 h-0.5 bg-gray-300 z-0" 
                 style={{ left: '2%', right: '2%' }}></div>
            
            {/* Dynamic Stages */}
            {roadmapStages.map((stage) => (
              <div
                key={stage.id}
                draggable
                onDragStart={(e) => handleStageDragStart(e, stage)}
                onDragOver={handleStageDragOver}
                onDragEnter={(e) => handleStageDragEnter(e, stage)}
                onDrop={(e) => handleStageDrop(e, stage)}
                onDragEnd={handleStageDragEnd}
                onClick={() => setActiveStage(stage.type)}
                className={`flex flex-col items-center relative z-10 flex-1 transition-all duration-200 hover:scale-110 cursor-pointer group ${
                  draggedStage?.id === stage.id ? 'scale-95' : ''
                } ${dragOverStageId === stage.id ? 'scale-110' : ''}`}
              >
                <div className="relative">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 transition-all cursor-grab active:cursor-grabbing ${
                    activeStage === stage.type 
                      ? 'bg-[#2BC4B3] shadow-lg' 
                      : 'bg-gray-300 hover:bg-gray-400'
                  }`}>
                    <div className="w-3 h-3 rounded-full bg-white"></div>
                  </div>
                  {/* Remove stage button */}
                  <div
                    onClick={(e) => { e.stopPropagation(); handleRemoveStage(stage.id); }}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-400 hover:bg-red-500 rounded-full items-center justify-center cursor-pointer z-20 hidden group-hover:flex transition-opacity"
                    title="Remove stage"
                  >
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                </div>
                <span className={`text-sm font-semibold whitespace-nowrap ${
                  activeStage === stage.type ? 'text-[#2BC4B3] font-bold' : 'text-gray-600'
                }`}>{stage.label}</span>
              </div>
            ))}

            {/* Add Stage Button */}
            <div className="relative z-10 flex-shrink-0 ml-4">
              <button
                onClick={() => setShowAddStageModal(true)}
                className="flex flex-col items-center transition-all hover:scale-110"
                title="Add stage"
              >
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-2 bg-white border-2 border-dashed border-[#1e5a8e] hover:border-[#2BC4B3] hover:bg-[#f0faf9] transition-all">
                  <svg className="w-6 h-6 text-[#1e5a8e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="text-sm font-semibold text-[#1e5a8e]">Add</span>
              </button>
            </div>
          </div>
        </div>

        {/* Floating Text Formatting Toolbar */}
        {activeTextarea && (
          <div className="formatting-toolbar fixed top-20 left-1/2 transform -translate-x-1/2 bg-white rounded-2xl shadow-2xl border border-gray-200 px-4 py-3 flex items-center gap-1.5 z-50" style={{boxShadow: '0 8px 30px rgba(0,0,0,0.12)'}}>
            {/* Text Formatting */}
            <div className="flex items-center gap-1.5 border-r border-gray-200 pr-3 mr-1.5">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('bold')}
                className="w-11 h-11 flex items-center justify-center hover:bg-blue-50 rounded-lg transition-all active:scale-95"
                title="Bold (Ctrl+B)"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#374151">
                  <path d="M13.5 4C14.9 4 16.2 4.5 17.1 5.4C18 6.3 18.5 7.5 18.5 8.8C18.5 10.1 18 11.1 17.1 11.9C18.3 12.7 19 14.1 19 15.5C19 17 18.4 18.2 17.3 19.1C16.2 20 14.8 20.5 13.2 20.5H5V4H13.5ZM8.5 7V10.5H13C13.5 10.5 14 10.3 14.3 10C14.7 9.7 14.8 9.3 14.8 8.8C14.8 8.3 14.6 7.9 14.3 7.5C14 7.2 13.5 7 13 7H8.5ZM8.5 13.5V17.5H13.2C13.8 17.5 14.3 17.3 14.7 16.9C15.1 16.5 15.3 16.1 15.3 15.5C15.3 14.9 15.1 14.5 14.7 14.1C14.3 13.7 13.8 13.5 13.2 13.5H8.5Z"/>
                </svg>
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('italic')}
                className="w-11 h-11 flex items-center justify-center hover:bg-blue-50 rounded-lg transition-all active:scale-95"
                title="Italic (Ctrl+I)"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#374151">
                  <path d="M10 5V8H12.2L8.5 16H6V19H14V16H11.8L15.5 8H18V5H10Z"/>
                </svg>
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('underline')}
                className="w-11 h-11 flex items-center justify-center hover:bg-blue-50 rounded-lg transition-all active:scale-95"
                title="Underline (Ctrl+U)"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#374151">
                  <path d="M12 17C14.8 17 17 14.8 17 12V3H14.5V12C14.5 13.4 13.4 14.5 12 14.5C10.6 14.5 9.5 13.4 9.5 12V3H7V12C7 14.8 9.2 17 12 17ZM5 20V21.5H19V20H5Z"/>
                </svg>
              </button>
            </div>

            {/* Capitalization */}
            <div className="flex items-center gap-1.5 border-r border-gray-200 pr-3 mr-1.5">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('uppercase')}
                className="w-11 h-11 flex items-center justify-center hover:bg-purple-50 rounded-lg transition-all active:scale-95"
                title="UPPERCASE"
              >
                <span className="text-sm font-bold text-gray-700 leading-none">AB</span>
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('lowercase')}
                className="w-11 h-11 flex items-center justify-center hover:bg-purple-50 rounded-lg transition-all active:scale-95"
                title="lowercase"
              >
                <span className="text-sm font-bold text-gray-700 leading-none">ab</span>
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('capitalize')}
                className="w-11 h-11 flex items-center justify-center hover:bg-purple-50 rounded-lg transition-all active:scale-95"
                title="Capitalize Each Word"
              >
                <span className="text-sm font-bold text-gray-700 leading-none">Ab</span>
              </button>
            </div>

            {/* Lists */}
            <div className="flex items-center gap-1.5 border-r border-gray-200 pr-3 mr-1.5">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('bullet')}
                className="w-11 h-11 flex items-center justify-center hover:bg-green-50 rounded-lg transition-all active:scale-95"
                title="Bullet List"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#374151">
                  <circle cx="4" cy="6" r="2"/>
                  <rect x="9" y="4.5" width="12" height="3" rx="1.5"/>
                  <circle cx="4" cy="12" r="2"/>
                  <rect x="9" y="10.5" width="12" height="3" rx="1.5"/>
                  <circle cx="4" cy="18" r="2"/>
                  <rect x="9" y="16.5" width="12" height="3" rx="1.5"/>
                </svg>
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('numbering')}
                className="w-11 h-11 flex items-center justify-center hover:bg-green-50 rounded-lg transition-all active:scale-95"
                title="Numbered List"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#374151">
                  <path d="M3 4H4.5V8H3V7H2V6H3V4ZM2 17V16H4.5V19H2V18H4V17.5H3V16.5H4V16H2ZM2 11H4L2 13.5V14H5V13H3L5 10.5V10H2V11Z"/>
                  <rect x="8" y="4.5" width="13" height="3" rx="1.5"/>
                  <rect x="8" y="10.5" width="13" height="3" rx="1.5"/>
                  <rect x="8" y="16.5" width="13" height="3" rx="1.5"/>
                </svg>
              </button>
            </div>

            {/* Alignment */}
            <div className="flex items-center gap-1.5 border-r border-gray-200 pr-3 mr-1.5">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('align-left')}
                className="w-11 h-11 flex items-center justify-center hover:bg-indigo-50 rounded-lg transition-all active:scale-95"
                title="Align Left"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#374151">
                  <rect x="3" y="5" width="14" height="2.5" rx="1.25"/>
                  <rect x="3" y="10.25" width="18" height="2.5" rx="1.25"/>
                  <rect x="3" y="15.5" width="14" height="2.5" rx="1.25"/>
                </svg>
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('align-center')}
                className="w-11 h-11 flex items-center justify-center hover:bg-indigo-50 rounded-lg transition-all active:scale-95"
                title="Align Center"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#374151">
                  <rect x="5" y="5" width="14" height="2.5" rx="1.25"/>
                  <rect x="3" y="10.25" width="18" height="2.5" rx="1.25"/>
                  <rect x="5" y="15.5" width="14" height="2.5" rx="1.25"/>
                </svg>
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('align-right')}
                className="w-11 h-11 flex items-center justify-center hover:bg-indigo-50 rounded-lg transition-all active:scale-95"
                title="Align Right"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#374151">
                  <rect x="7" y="5" width="14" height="2.5" rx="1.25"/>
                  <rect x="3" y="10.25" width="18" height="2.5" rx="1.25"/>
                  <rect x="7" y="15.5" width="14" height="2.5" rx="1.25"/>
                </svg>
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('align-justify')}
                className="w-11 h-11 flex items-center justify-center hover:bg-indigo-50 rounded-lg transition-all active:scale-95"
                title="Justify"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#374151">
                  <rect x="3" y="5" width="18" height="2.5" rx="1.25"/>
                  <rect x="3" y="10.25" width="18" height="2.5" rx="1.25"/>
                  <rect x="3" y="15.5" width="18" height="2.5" rx="1.25"/>
                </svg>
              </button>
            </div>

            {/* Indent */}
            <div className="flex items-center gap-1.5 border-r border-gray-200 pr-3 mr-1.5">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('indent')}
                className="w-11 h-11 flex items-center justify-center hover:bg-amber-50 rounded-lg transition-all active:scale-95"
                title="Indent (Tab)"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#374151">
                  <rect x="2" y="3" width="20" height="2.5" rx="1.25"/>
                  <rect x="2" y="18.5" width="20" height="2.5" rx="1.25"/>
                  <rect x="10" y="8" width="12" height="2.5" rx="1.25"/>
                  <rect x="10" y="13" width="12" height="2.5" rx="1.25"/>
                  <path d="M2 8.5L6.5 12L2 15.5V8.5Z"/>
                </svg>
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('outdent')}
                className="w-11 h-11 flex items-center justify-center hover:bg-amber-50 rounded-lg transition-all active:scale-95"
                title="Outdent (Shift+Tab)"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#374151">
                  <rect x="2" y="3" width="20" height="2.5" rx="1.25"/>
                  <rect x="2" y="18.5" width="20" height="2.5" rx="1.25"/>
                  <rect x="10" y="8" width="12" height="2.5" rx="1.25"/>
                  <rect x="10" y="13" width="12" height="2.5" rx="1.25"/>
                  <path d="M7 8.5L2.5 12L7 15.5V8.5Z"/>
                </svg>
              </button>
            </div>

            {/* Undo / Redo */}
            <div className="flex items-center gap-1.5 border-r border-gray-200 pr-3 mr-1.5">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('undo')}
                className="w-11 h-11 flex items-center justify-center hover:bg-cyan-50 rounded-lg transition-all active:scale-95"
                title="Undo (Ctrl+Z)"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#374151">
                  <path d="M12.5 8C15.9 8 18.8 10.1 20 13.1L18.1 13.8C17.2 11.3 15 9.6 12.5 9.6H6.8L9.3 12.1L8.1 13.3L3.5 8.7L8.1 4.1L9.3 5.3L6.8 7.8H12.5Z"/>
                </svg>
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('redo')}
                className="w-11 h-11 flex items-center justify-center hover:bg-cyan-50 rounded-lg transition-all active:scale-95"
                title="Redo (Ctrl+Y)"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#374151">
                  <path d="M11.5 8C8.1 8 5.2 10.1 4 13.1L5.9 13.8C6.8 11.3 9 9.6 11.5 9.6H17.2L14.7 12.1L15.9 13.3L20.5 8.7L15.9 4.1L14.7 5.3L17.2 7.8H11.5Z"/>
                </svg>
              </button>
            </div>

            {/* Close Button */}
            <div>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setActiveTextarea(null)}
                className="w-11 h-11 flex items-center justify-center hover:bg-red-50 rounded-lg transition-all active:scale-95 text-gray-400 hover:text-red-500"
                title="Close Toolbar"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4z"/>
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Lesson Stage - Form Container */}
        {activeStage === 'lesson' && (
        <div className="bg-white rounded-xl shadow-sm p-8 space-y-6">
          {/* Lesson Title, Time and Number Row */}
          <div className="flex gap-6">
            {/* Lesson Title */}
            <div className="flex-1">
              <label className="block text-lg font-bold text-gray-900 mb-2">
                Lesson Title
              </label>
              <div
                ref={lessonTitleRef}
                id="input-lesson-title"
                contentEditable
                suppressContentEditableWarning
                onInput={(e) => {
                  if (e.currentTarget) {
                    const newValue = e.currentTarget.innerHTML || '';
                    setLessonData(prev => ({ ...prev, ModuleTitle: newValue }));
                  }
                }}
                onBlur={(e) => {
                  // Ensure state is synced on blur
                  if (e.currentTarget) {
                    const newValue = e.currentTarget.innerHTML || '';
                    setLessonData(prev => ({ ...prev, ModuleTitle: newValue }));
                  }
                }}
                onPaste={(e) => handleRichPaste(e, null, 'module-title')}
                onFocus={() => setActiveTextarea('input-lesson-title')}
                data-placeholder="Enter lesson title"
                className="w-full min-h-[48px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-[#2BC4B3] focus:outline-none text-gray-900 empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
              />
            </div>

            {/* Lesson Time */}
            <div className="w-48">
              <label className="block text-lg font-bold text-gray-900 mb-2">
                Lesson Time
              </label>
              <div className="flex items-center justify-center gap-1.5 px-2 py-3 border-2 border-gray-300 rounded-lg focus-within:border-[#2BC4B3] h-[48px]">
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={lessonData.LessonTime.hours}
                  onChange={(e) => handleTimeChange('hours', e.target.value)}
                  className="w-12 px-1 focus:outline-none text-center font-medium text-sm"
                />
                <span className="text-gray-400 text-xs">hr</span>
                <span className="text-lg font-bold text-gray-400">:</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={lessonData.LessonTime.minutes}
                  onChange={(e) => handleTimeChange('minutes', e.target.value)}
                  className="w-12 px-1 focus:outline-none text-center font-medium text-sm"
                />
                <span className="text-gray-400 text-xs">min</span>
              </div>
            </div>

            {/* Lesson Number */}
            <div className="w-36">
              <label className="block text-lg font-bold text-gray-900 mb-2">
                Lesson Number
              </label>
              <input
                type="number"
                min="1"
                value={lessonData.LessonOrder}
                onChange={(e) => setLessonData(prev => ({ ...prev, LessonOrder: parseInt(e.target.value) || 1 }))}
                className="w-full h-[48px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-[#2BC4B3] focus:outline-none text-center font-bold text-lg"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-lg font-bold text-gray-900 mb-2">
              Description
            </label>
            <div
              ref={descriptionRef}
              id="textarea-description"
              contentEditable
              suppressContentEditableWarning
              onInput={(e) => {
                if (e.currentTarget) {
                  const newValue = e.currentTarget.innerHTML || '';
                  setLessonData(prev => ({ ...prev, Description: newValue }));
                }
              }}
              onBlur={(e) => {
                // Ensure state is synced on blur
                if (e.currentTarget) {
                  const newValue = e.currentTarget.innerHTML || '';
                  setLessonData(prev => ({ ...prev, Description: newValue }));
                }
              }}
              onPaste={(e) => handleRichPaste(e, null, 'description')}
              onFocus={() => setActiveTextarea('textarea-description')}
              data-placeholder="Enter lesson description"
              className="w-full min-h-[100px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-[#2BC4B3] focus:outline-none text-gray-900 empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
              style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
            />
          </div>

          {/* Difficulty */}
          <div>
            <label className="block text-lg font-bold text-gray-900 mb-3">
              Difficulty
            </label>
            <div className="flex flex-wrap gap-4">
              {['Easy', 'Challenging', 'Advanced', 'Supplementary'].map((level) => (
                <label key={level} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="difficulty"
                    checked={lessonData.Difficulty === level}
                    onChange={() => handleDifficultyChange(level)}
                    className="w-5 h-5 text-[#2BC4B3] border-gray-300 focus:ring-[#2BC4B3]"
                  />
                  <span className="text-gray-900 font-medium">{level}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Sections Display */}
          {sections.length > 0 && (
            <div className="mt-8 space-y-4">
              {getDisplaySections().map((section, sectionIndex) => (
                <React.Fragment key={section.id}>
                {sectionIndex === 0 && (
                  <div className="flex justify-center -mb-2">
                    <button
                      onClick={() => { setInsertAtIndex(0); setShowSectionModal(true); }}
                      className="group flex items-center gap-1 px-3 py-1 rounded-full text-gray-300 hover:text-[#2BC4B3] hover:bg-[#2BC4B3]/10 transition-all"
                      title="Insert section here"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      <span className="text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">Add Section</span>
                    </button>
                  </div>
                )}
                <div
                  key={section.id}
                  onDragOver={handleDragOver}
                  onDragEnter={(e) => handleDragEnter(e, section)}
                  onDrop={(e) => handleDrop(e, section)}
                  className={`bg-white border-2 rounded-lg p-6 flex items-start gap-4 transition-all duration-200 ${
                    draggedSection?.id === section.id 
                      ? 'border-[#2BC4B3] border-dashed bg-gray-50' 
                      : dragOverSection?.id === section.id
                      ? 'border-[#2BC4B3] shadow-lg'
                      : 'border-gray-300'
                  }`}
                >
                  {/* Drag Handle - Only this is draggable */}
                  <div 
                    draggable
                    onDragStart={(e) => handleDragStart(e, section)}
                    onDragEnd={handleDragEnd}
                    className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-1 -m-1"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                    </svg>
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-bold text-[#1e5a8e]">
                        {getSectionDisplayTitle(section)}
                      </h3>
                      <div className="flex items-center gap-2">
                        {/* Change Material Button */}
                        <div className="relative" data-material-picker>
                          <button
                            onClick={() => setChangeMaterialPicker(changeMaterialPicker === section.id ? null : section.id)}
                            className="px-3 py-1.5 text-sm font-semibold text-gray-500 hover:text-[#1e5a8e] hover:bg-gray-100 rounded-lg transition-all flex items-center gap-1.5 flex-shrink-0"
                            title="Change material type"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                            Change Material
                          </button>
                          {changeMaterialPicker === section.id && (
                            <div className="absolute right-0 top-full mt-1 w-64 bg-white border-2 border-gray-200 rounded-lg shadow-xl z-50 py-1">
                              {[
                                { type: 'topic', label: 'Topic Title' },
                                { type: 'subtopic', label: 'Subtopic Title' },
                                { type: 'paragraph', label: 'Paragraph' },
                                { type: 'image', label: 'Image' },
                                { type: 'video', label: 'Video' },
                                { type: 'review-multiple-choice', label: 'Review - Multiple Choice' },
                                { type: 'review-drag-drop', label: 'Review - Drag and Drop' },
                                { type: 'references', label: 'References' },
                              ].map(opt => (
                                <button
                                  key={opt.type}
                                  onClick={() => handleChangeMaterial(section.id, opt.type)}
                                  className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-all ${
                                    section.type === opt.type
                                      ? 'bg-[#2BC4B3]/10 text-[#2BC4B3] cursor-default'
                                      : 'text-gray-700 hover:bg-gray-100 hover:text-[#1e5a8e]'
                                  }`}
                                  disabled={section.type === opt.type}
                                >
                                  {opt.label}
                                  {section.type === opt.type && ' ✓'}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {!['topic', 'subtopic'].includes(section.type) && (
                          <button
                            onClick={() => setCollapsedSections(prev => ({ ...prev, [section.id]: !prev[section.id] }))}
                            className="px-3 py-1.5 text-sm font-semibold text-gray-500 hover:text-[#1e5a8e] hover:bg-gray-100 rounded-lg transition-all flex items-center gap-1.5 flex-shrink-0"
                            title={collapsedSections[section.id] ? 'Expand section' : 'Minimize section'}
                          >
                            {collapsedSections[section.id] ? (
                              <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                Expand
                              </>
                            ) : (
                              <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                                Minimize
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Topic Title - ContentEditable */}
                    {section.type === 'topic' && (
                      <div
                        id={`input-topic-${section.id}`}
                        contentEditable
                        suppressContentEditableWarning
                        ref={(el) => {
                          if (el && !el.hasAttribute('data-initialized')) {
                            el.innerHTML = stripHtml(section.title) || '';
                            el.setAttribute('data-initialized', 'true');
                          }
                        }}
                        onInput={(e) => {
                          if (e.currentTarget) {
                            const newValue = e.currentTarget.textContent || '';
                            handleSectionContentChange(section.id, 'title', newValue);
                          }
                        }}
                        onPaste={(e) => {
                          e.preventDefault();
                          const text = e.clipboardData.getData('text/plain');
                          const cleanText = text.replace(/\s+/g, ' ').trim();
                          document.execCommand('insertText', false, cleanText);
                        }}
                        onFocus={() => setActiveTextarea(`input-topic-${section.id}`)}
                        data-placeholder="Enter topic title..."
                        className="w-full min-h-[48px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-[#2BC4B3] focus:outline-none text-gray-900 font-semibold text-lg empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                        style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                      />
                    )}

                    {/* Subtopic Title - ContentEditable */}
                    {section.type === 'subtopic' && (
                      <div
                        id={`input-subtopic-${section.id}`}
                        contentEditable
                        suppressContentEditableWarning
                        ref={(el) => {
                          if (el && !el.hasAttribute('data-initialized')) {
                            el.innerHTML = stripHtml(section.title) || '';
                            el.setAttribute('data-initialized', 'true');
                          }
                        }}
                        onInput={(e) => {
                          if (e.currentTarget) {
                            const newValue = e.currentTarget.textContent || '';
                            handleSectionContentChange(section.id, 'title', newValue);
                          }
                        }}
                        onPaste={(e) => {
                          e.preventDefault();
                          const text = e.clipboardData.getData('text/plain');
                          const cleanText = text.replace(/\s+/g, ' ').trim();
                          document.execCommand('insertText', false, cleanText);
                        }}
                        onFocus={() => setActiveTextarea(`input-subtopic-${section.id}`)}
                        data-placeholder="Enter subtopic title..."
                        className="w-full min-h-[48px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-[#2BC4B3] focus:outline-none text-gray-900 font-medium empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                        style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                      />
                    )}

                    {/* Paragraph - ContentEditable with Layout Options */}
                    {section.type === 'paragraph' && !collapsedSections[section.id] && (
                      <div className="space-y-3">
                        {/* Controls bar: Layout indicator | Change Layout | Add Table */}
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-sm font-bold text-[#1e5a8e] bg-[#1e5a8e]/10 px-4 py-1.5 rounded-full">
                            {PARAGRAPH_LAYOUTS.find(l => l.id === (section.contentLayout || 'text'))?.icon} {PARAGRAPH_LAYOUTS.find(l => l.id === (section.contentLayout || 'text'))?.label}
                          </span>
                          <button
                            onClick={() => setParagraphLayoutPicker(paragraphLayoutPicker === section.id ? null : section.id)}
                            className="px-4 py-1.5 text-sm font-semibold text-gray-600 hover:text-[#1e5a8e] hover:bg-gray-100 border border-gray-300 rounded-lg transition-all flex items-center gap-1.5"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                            Change Layout
                          </button>
                          {(section.contentLayout || 'text') !== 'table' && (
                            <button
                              onClick={() => handleAddTableToSection(section.id)}
                              className="px-4 py-1.5 text-sm font-semibold text-[#1e5a8e] hover:text-white hover:bg-[#1e5a8e] border border-[#1e5a8e]/30 rounded-lg transition-all flex items-center gap-1.5"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M3 6h18M3 18h18M9 6v12M15 6v12" /></svg>
                              Add Table
                            </button>
                          )}
                        </div>

                        {/* Paragraph Layout Picker Dropdown */}
                        {paragraphLayoutPicker === section.id && (
                          <div className="bg-white border-2 border-gray-200 rounded-xl shadow-lg p-3 flex gap-3">
                            {PARAGRAPH_LAYOUTS.map((layout) => (
                              <button
                                key={layout.id}
                                onClick={() => handleSelectParagraphLayout(section.id, layout.id)}
                                className={`flex-1 text-left p-3 rounded-lg border-2 transition-all hover:border-[#2BC4B3] hover:bg-[#f0faf9] ${
                                  (section.contentLayout || 'text') === layout.id ? 'border-[#2BC4B3] bg-[#f0faf9]' : 'border-gray-200'
                                }`}
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-lg">{layout.icon}</span>
                                  <span className="font-bold text-[#1e3a5f] text-sm">{layout.label}</span>
                                </div>
                                <p className="text-xs text-gray-500">{layout.desc}</p>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Normal Text Content */}
                        {(section.contentLayout || 'text') === 'text' && (
                          <div className="relative">
                            <div
                              id={`textarea-${section.id}`}
                              contentEditable
                              suppressContentEditableWarning
                              ref={(el) => {
                                if (el && !el.hasAttribute('data-initialized')) {
                                  el.innerHTML = section.content || '';
                                  el.setAttribute('data-initialized', 'true');
                                }
                              }}
                              onInput={(e) => {
                                if (e.currentTarget) {
                                  const newValue = sanitizeHtml(e.currentTarget.innerHTML);
                                  handleSectionContentChange(section.id, 'content', newValue);
                                }
                              }}
                              onPaste={(e) => handleRichPaste(e, section.id, 'content')}
                              onFocus={() => setActiveTextarea(`textarea-${section.id}`)}
                              data-placeholder="Enter paragraph content..."
                              className="w-full min-h-[100px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-[#2BC4B3] focus:outline-none text-gray-700 leading-relaxed empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                              style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                            />
                          </div>
                        )}

                        {/* Table Content */}
                        {(section.contentLayout || 'text') === 'table' && section.tableData && (
                          <div className="space-y-3">
                            <div className="overflow-x-auto border-2 border-gray-200 rounded-lg">
                              <table className="w-full border-collapse">
                                <thead>
                                  <tr className="bg-[#1e5a8e]/10">
                                    {section.tableData.headers.map((header, colIdx) => (
                                      <th key={colIdx} className="relative group/th align-top">
                                        <div
                                          id={`table-header-${section.id}-${colIdx}`}
                                          contentEditable
                                          suppressContentEditableWarning
                                          ref={(el) => {
                                            if (el && !el.hasAttribute('data-initialized-table-header')) {
                                              el.innerHTML = header || '';
                                              el.setAttribute('data-initialized-table-header', 'true');
                                            }
                                          }}
                                          onInput={(e) => {
                                            if (e.currentTarget) {
                                              const newValue = sanitizeHtml(e.currentTarget.innerHTML);
                                              handleTableHeaderChange(section.id, colIdx, newValue);
                                            }
                                          }}
                                          onPaste={(e) => handleRichPaste(e, section.id, 'table')}
                                          onFocus={() => setActiveTextarea(`table-header-${section.id}-${colIdx}`)}
                                          data-placeholder={`Header ${colIdx + 1}`}
                                          className="table-rich-content w-full px-3 py-2.5 bg-transparent font-bold text-[#1e3a5f] text-sm focus:outline-none focus:bg-white/50 text-center min-w-[120px] empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                                          style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                                        />
                                        {section.tableData.headers.length > 1 && (
                                          <button
                                            onClick={() => handleRemoveTableColumn(section.id, colIdx)}
                                            className="absolute -top-2 -right-2 w-5 h-5 bg-red-400 hover:bg-red-500 rounded-full items-center justify-center text-white hidden group-hover/th:flex z-10"
                                            title="Remove column"
                                          >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                          </button>
                                        )}
                                      </th>
                                    ))}
                                    <th className="w-10"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {section.tableData.rows.map((row, rowIdx) => (
                                    <tr key={rowIdx} className="border-t border-gray-200 hover:bg-gray-50/50 group/row">
                                      {row.map((cell, colIdx) => (
                                        <td key={colIdx} className="border-r border-gray-100 align-top">
                                          <div
                                            id={`table-cell-${section.id}-${rowIdx}-${colIdx}`}
                                            contentEditable
                                            suppressContentEditableWarning
                                            ref={(el) => {
                                              if (el && !el.hasAttribute('data-initialized-table-cell')) {
                                                el.innerHTML = cell || '';
                                                el.setAttribute('data-initialized-table-cell', 'true');
                                              }
                                            }}
                                            onInput={(e) => {
                                              if (e.currentTarget) {
                                                const newValue = sanitizeHtml(e.currentTarget.innerHTML);
                                                handleTableCellChange(section.id, rowIdx, colIdx, newValue);
                                              }
                                            }}
                                            onPaste={(e) => handleRichPaste(e, section.id, 'table')}
                                            onFocus={() => setActiveTextarea(`table-cell-${section.id}-${rowIdx}-${colIdx}`)}
                                            data-placeholder="Enter value..."
                                            className="table-rich-content w-full px-3 py-2 text-sm text-gray-700 focus:outline-none focus:bg-[#2BC4B3]/5 min-w-[120px] empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                                            style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                                          />
                                        </td>
                                      ))}
                                      <td className="w-10 text-center">
                                        {section.tableData.rows.length > 1 && (
                                          <button
                                            onClick={() => handleRemoveTableRow(section.id, rowIdx)}
                                            className="p-1 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover/row:opacity-100"
                                            title="Remove row"
                                          >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleAddTableRow(section.id)}
                                className="px-3 py-1.5 text-sm font-semibold text-[#1e5a8e] hover:bg-[#1e5a8e]/10 border border-[#1e5a8e]/20 rounded-lg transition-all flex items-center gap-1.5"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                                Add Row
                              </button>
                              <button
                                onClick={() => handleAddTableColumn(section.id)}
                                className="px-3 py-1.5 text-sm font-semibold text-[#1e5a8e] hover:bg-[#1e5a8e]/10 border border-[#1e5a8e]/20 rounded-lg transition-all flex items-center gap-1.5"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                                Add Column
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Image - Media Container */}
                    {section.type === 'image' && !collapsedSections[section.id] && (
                      <div className="space-y-4">
                        {/* Controls bar: Layout indicator | Change layout | Add Image | Minimize */}
                        {section.layout && (
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-sm font-bold text-[#1e5a8e] bg-[#1e5a8e]/10 px-4 py-1.5 rounded-full">
                              {IMAGE_LAYOUTS.find(l => l.id === section.layout)?.icon} {IMAGE_LAYOUTS.find(l => l.id === section.layout)?.label}
                            </span>
                            <button
                              onClick={() => setLayoutPickerSection(section.id)}
                              className="px-4 py-1.5 text-sm font-semibold text-gray-600 hover:text-[#1e5a8e] hover:bg-gray-100 border border-gray-300 rounded-lg transition-all flex items-center gap-1.5"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                              Change Layout
                            </button>
                            <button
                              onClick={() => {
                                if (section.layout === 'text-left' || section.layout === 'text-right') {
                                  const lastLayerIdx = Math.max(0, (section.layerImages || []).length - 1);
                                  handleAddLayerImage(section.id, lastLayerIdx);
                                } else {
                                  handleAddImageSlot(section.id);
                                }
                              }}
                              className="px-4 py-1.5 text-sm font-semibold text-[#1e5a8e] hover:text-white hover:bg-[#1e5a8e] border border-[#1e5a8e]/30 rounded-lg transition-all flex items-center gap-1.5"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                              Add Image
                            </button>
                            {(section.layout === 'text-left' || section.layout === 'text-right') && (
                              <button
                                onClick={() => handleAddTextImageLayer(section.id)}
                                className="px-4 py-1.5 text-sm font-semibold text-[#1e5a8e] hover:text-white hover:bg-[#1e5a8e] border border-[#1e5a8e]/30 rounded-lg transition-all flex items-center gap-1.5"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                Add Layer
                              </button>
                            )}

                          </div>
                        )}

                        {/* Collapsed preview */}
                        {section.layout && collapsedSections[section.id] ? (
                          <div
                            onClick={() => setCollapsedSections(prev => ({ ...prev, [section.id]: false }))}
                            className="border-2 border-dashed border-gray-200 rounded-lg p-4 flex items-center gap-4 cursor-pointer hover:border-[#2BC4B3] transition-colors bg-gray-50"
                          >
                            <div className="flex gap-2 flex-wrap">
                              {(section.images || []).map((img, i) => (
                                img.url ? (
                                  <img key={i} src={img.url} alt={`Thumb ${i+1}`} className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                                ) : (
                                  <div key={i} className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center">
                                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                  </div>
                                )
                              ))}
                            </div>
                            <span className="text-sm text-gray-500">
                              {(section.images || []).filter(img => img.url).length} image(s) · Click to expand
                            </span>
                          </div>
                        ) : (section.layout === 'text-left' || section.layout === 'text-right') ? (
                          /* Text + Image Layout - Multi-layer */
                          <div className="space-y-4">
                            {(() => {
                              const sideTexts = section.sideTexts || (section.sideText ? [section.sideText] : ['']);
                              const layerImages = section.layerImages || (section.images || []).map(img => [img]);
                              const layerCount = Math.max(sideTexts.length, layerImages.length);
                              return Array.from({ length: layerCount }, (_, layerIdx) => {
                                const layerImgs = layerImages[layerIdx] || [{ url: '', file: null, fileName: '', caption: '' }];
                                const textContent = sideTexts[layerIdx] || '';
                                return (
                                  <div key={layerIdx} className="relative group/layer">
                                    {layerCount > 1 && (
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Layer {layerIdx + 1}</span>
                                        <button
                                          onClick={() => handleRemoveTextImageLayer(section.id, layerIdx)}
                                          className="px-2 py-1 text-xs font-semibold text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-all opacity-0 group-hover/layer:opacity-100"
                                        >
                                          Remove Layer
                                        </button>
                                      </div>
                                    )}
                                    <div className="grid grid-cols-2 gap-4 items-start">
                                      {section.layout === 'text-left' && (
                                        <div className="relative">
                                          <button
                                            type="button"
                                            onClick={() => handleClearSideText(section.id, layerIdx)}
                                            className="absolute top-2 right-2 px-2 py-1 text-[10px] font-semibold text-red-500 bg-white/90 border border-red-200 rounded z-10 hover:bg-red-50"
                                            title="Clear text"
                                          >
                                            Clear
                                          </button>
                                          <div
                                            id={`sidetext-${section.id}-${layerIdx}`}
                                            contentEditable
                                            suppressContentEditableWarning
                                            ref={(el) => {
                                              if (el && !el.hasAttribute('data-initialized-side')) {
                                                el.innerHTML = textContent;
                                                el.setAttribute('data-initialized-side', 'true');
                                              }
                                            }}
                                            onInput={(e) => {
                                              if (e.currentTarget) {
                                                const newValue = sanitizeHtml(e.currentTarget.innerHTML);
                                                handleSideTextChange(section.id, layerIdx, newValue);
                                              }
                                            }}
                                            onPaste={(e) => {
                                              e.preventDefault();
                                              const html = e.clipboardData.getData('text/html');
                                              const plainText = e.clipboardData.getData('text/plain');
                                              if (html) {
                                                document.execCommand('insertHTML', false, sanitizeHtml(html));
                                              } else if (plainText) {
                                                const htmlText = plainText.split('\n').map(line => !line.trim() ? '<br>' : line.trim()).join('<br>');
                                                document.execCommand('insertHTML', false, htmlText);
                                              }
                                            }}
                                            onFocus={() => setActiveTextarea(`sidetext-${section.id}-${layerIdx}`)}
                                            data-placeholder="Enter text content..."
                                            className="w-full h-full min-h-[200px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-[#2BC4B3] focus:outline-none text-gray-700 leading-relaxed empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                                            style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                                          />
                                        </div>
                                      )}
                                      {/* Image slots - horizontal layout */}
                                      <div className="flex gap-3 flex-wrap items-start">
                                        {layerImgs.map((img, imgIdx) => (
                                          <div
                                            key={imgIdx}
                                            className="border-2 border-dashed border-gray-300 rounded-lg p-3 text-center focus-within:border-[#2BC4B3] transition-colors relative group/img min-h-[180px] flex-1 min-w-[120px] flex items-center justify-center"
                                            tabIndex={0}
                                            onPaste={(e) => handleLayerPasteImage(section.id, layerIdx, imgIdx, e)}
                                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                            onDrop={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              const file = e.dataTransfer.files?.[0];
                                              if (file && file.type.startsWith('image/')) {
                                                handleLayerImageUpload(section.id, layerIdx, imgIdx, { target: { files: [file] } });
                                              }
                                            }}
                                          >
                                            {(layerImgs.length > 1 || img.url) && (
                                              <div
                                                onClick={() => {
                                                  if (layerImgs.length > 1) {
                                                    handleRemoveLayerImage(section.id, layerIdx, imgIdx);
                                                  } else {
                                                    handleClearLayerImage(section.id, layerIdx, imgIdx);
                                                  }
                                                }}
                                                className="absolute -top-2 -right-2 w-5 h-5 bg-red-400 hover:bg-red-500 rounded-full items-center justify-center cursor-pointer z-10 hidden group-hover/img:flex"
                                                title={layerImgs.length > 1 ? 'Remove image' : 'Clear image'}
                                              >
                                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                              </div>
                                            )}
                                            {img.url ? (
                                              <div>
                                                <img
                                                  src={img.url}
                                                  alt={`Image ${imgIdx + 1}`}
                                                  className="max-w-full h-auto mx-auto rounded-lg shadow-md"
                                                  draggable="false"
                                                />
                                                <label className="mt-2 inline-block px-3 py-1 bg-[#1e5a8e] hover:bg-[#164570] text-white rounded-lg cursor-pointer transition-all text-xs">
                                                  Change
                                                  <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={(e) => handleLayerImageUpload(section.id, layerIdx, imgIdx, e)}
                                                    className="hidden"
                                                  />
                                                </label>
                                              </div>
                                            ) : (
                                              <div className="py-3">
                                                <svg className="w-8 h-8 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                                <label className="px-3 py-1.5 bg-[#1e5a8e] hover:bg-[#164570] text-white rounded-lg cursor-pointer transition-all inline-block font-semibold text-xs">
                                                  Import
                                                  <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={(e) => handleLayerImageUpload(section.id, layerIdx, imgIdx, e)}
                                                    className="hidden"
                                                  />
                                                </label>
                                                <p className="text-[10px] text-gray-400 mt-1">or paste / drag</p>
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                        {/* Inline add image button */}
                                        <button
                                          onClick={() => handleAddLayerImage(section.id, layerIdx)}
                                          className="border-2 border-dashed border-gray-200 hover:border-[#2BC4B3] rounded-lg min-w-[80px] min-h-[180px] flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-[#1e5a8e] transition-all cursor-pointer"
                                          title="Add another image to this layer"
                                        >
                                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                          <span className="text-[10px] font-semibold">Add</span>
                                        </button>
                                      </div>
                                      {section.layout === 'text-right' && (
                                        <div className="relative">
                                          <button
                                            type="button"
                                            onClick={() => handleClearSideText(section.id, layerIdx)}
                                            className="absolute top-2 right-2 px-2 py-1 text-[10px] font-semibold text-red-500 bg-white/90 border border-red-200 rounded z-10 hover:bg-red-50"
                                            title="Clear text"
                                          >
                                            Clear
                                          </button>
                                          <div
                                            id={`sidetext-${section.id}-${layerIdx}`}
                                            contentEditable
                                            suppressContentEditableWarning
                                            ref={(el) => {
                                              if (el && !el.hasAttribute('data-initialized-side')) {
                                                el.innerHTML = textContent;
                                                el.setAttribute('data-initialized-side', 'true');
                                              }
                                            }}
                                            onInput={(e) => {
                                              if (e.currentTarget) {
                                                const newValue = sanitizeHtml(e.currentTarget.innerHTML);
                                                handleSideTextChange(section.id, layerIdx, newValue);
                                              }
                                            }}
                                            onPaste={(e) => {
                                              e.preventDefault();
                                              const html = e.clipboardData.getData('text/html');
                                              const plainText = e.clipboardData.getData('text/plain');
                                              if (html) {
                                                document.execCommand('insertHTML', false, sanitizeHtml(html));
                                              } else if (plainText) {
                                                const htmlText = plainText.split('\n').map(line => !line.trim() ? '<br>' : line.trim()).join('<br>');
                                                document.execCommand('insertHTML', false, htmlText);
                                              }
                                            }}
                                            onFocus={() => setActiveTextarea(`sidetext-${section.id}-${layerIdx}`)}
                                            data-placeholder="Enter text content..."
                                            className="w-full h-full min-h-[200px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-[#2BC4B3] focus:outline-none text-gray-700 leading-relaxed empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                                            style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                                          />
                                        </div>
                                      )}
                                    </div>
                                    {layerIdx < layerCount - 1 && (
                                      <div className="border-b border-dashed border-gray-200 mt-4"></div>
                                    )}
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        ) : section.layout ? (
                          /* Images Display - Collage-aware rendering */
                          <>
                            <div className={`gap-4 items-stretch ${
                              section.layout === 'side-by-side' ? 'grid grid-cols-2' :
                              section.layout === 'grid-2x2' ? 'grid grid-cols-2' :
                              section.layout === 'grid-3' ? 'grid grid-cols-3' :
                              section.layout === 'one-plus-two' ? 'grid grid-cols-2 [&>*:first-child]:col-span-2' :
                              section.layout === 'two-plus-one' ? 'grid grid-cols-2 [&>*:last-child]:col-span-2' :
                              section.layout === 'big-left' ? 'grid grid-cols-2 grid-rows-2 [&>*:first-child]:row-span-2' :
                              section.layout === 'big-right' ? 'grid grid-cols-2 grid-rows-2 [&>*:last-child]:row-span-2' :
                              section.layout === 'mosaic' ? 'grid grid-cols-4 grid-rows-2 [&>*:first-child]:col-span-2 [&>*:first-child]:row-span-2' :
                              'flex flex-wrap'
                            }`}>
                              {(section.images || []).map((img, imgIdx) => (
                                <div
                                  key={imgIdx}
                                  className={`border-2 border-dashed border-gray-300 rounded-lg p-4 text-center focus-within:border-[#2BC4B3] transition-colors relative group/img min-w-[150px]`}
                                  tabIndex={0}
                                  onPaste={(e) => handlePasteImage(section.id, e, imgIdx)}
                                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const file = e.dataTransfer.files?.[0];
                                    if (file && file.type.startsWith('image/')) {
                                      handleImageSlotUpload(section.id, imgIdx, { target: { files: [file] } });
                                    }
                                  }}
                                >
                                  {/* Remove image slot button */}
                                  <div
                                    onClick={() => handleRemoveImageSlot(section.id, imgIdx)}
                                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-400 hover:bg-red-500 rounded-full items-center justify-center cursor-pointer z-10 hidden group-hover/img:flex transition-opacity"
                                    title="Remove image"
                                  >
                                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </div>
                                  {img.url ? (
                                    <div>
                                      <img
                                        src={img.url}
                                        alt={`Image ${imgIdx + 1}`}
                                        className="max-w-full h-auto mx-auto rounded-lg shadow-md"
                                        draggable="false"
                                      />
                                      <label className="mt-3 inline-block px-4 py-1.5 bg-[#1e5a8e] hover:bg-[#164570] text-white rounded-lg cursor-pointer transition-all text-sm">
                                        Change
                                        <input
                                          type="file"
                                          accept="image/*"
                                          onChange={(e) => handleImageSlotUpload(section.id, imgIdx, e)}
                                          className="hidden"
                                        />
                                      </label>
                                    </div>
                                  ) : (
                                    <div className="py-4">
                                      <svg className="w-10 h-10 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                      </svg>
                                      <label className="px-4 py-2 bg-[#1e5a8e] hover:bg-[#164570] text-white rounded-lg cursor-pointer transition-all inline-block font-semibold text-sm">
                                        Import
                                        <input
                                          type="file"
                                          accept="image/*"
                                          onChange={(e) => handleImageSlotUpload(section.id, imgIdx, e)}
                                          className="hidden"
                                        />
                                      </label>
                                      <p className="text-xs text-gray-400 mt-1">or paste / drag</p>
                                      <p className="text-[11px] text-gray-400 mt-2">JPG, PNG, GIF, WEBP · Max 10 MB</p>
                                    </div>
                                  )}
                                  {/* Per-image caption */}
                                  <input
                                    type="text"
                                    value={img.caption || ''}
                                    onChange={(e) => handleImageCaptionChange(section.id, imgIdx, e.target.value)}
                                    placeholder={`Image ${imgIdx + 1} caption...`}
                                    className="w-full mt-3 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:border-[#2BC4B3] focus:outline-none text-gray-600 placeholder-gray-400"
                                  />
                                </div>
                              ))}
                            </div>
                          </>
                        ) : (
                          /* No layout selected yet - Show layout picker */
                          <div className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center">
                            <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <button
                              onClick={() => setLayoutPickerSection(section.id)}
                              className="px-8 py-3 bg-[#1e5a8e] hover:bg-[#164570] text-white rounded-lg transition-all font-semibold text-base shadow-md"
                            >
                              Choose a Layout
                            </button>
                            <p className="text-sm text-gray-500 mt-3">Select an image layout to get started</p>
                          </div>
                        )}

                        {/* Layout Picker Modal */}
                        {layoutPickerSection === section.id && (
                          <div className="fixed inset-0 z-50 flex items-center justify-center">
                            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setLayoutPickerSection(null)} />
                            <div className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full mx-4 max-h-[85vh] overflow-hidden flex flex-col">
                              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                                <div>
                                  <h3 className="text-xl font-bold text-[#1e3a5f]">Choose Image Layout</h3>
                                  <p className="text-sm text-gray-500 mt-1">Select how you want image(s) arranged</p>
                                </div>
                                <button onClick={() => setLayoutPickerSection(null)} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center">
                                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                              </div>
                              <div className="flex-1 overflow-y-auto p-6">
                                <div className="grid grid-cols-2 gap-3">
                                  {IMAGE_LAYOUTS.map((layout) => (
                                    <button
                                      key={layout.id}
                                      onClick={() => handleSelectImageLayout(section.id, layout)}
                                      className={`text-left p-4 rounded-xl border-2 transition-all hover:border-[#2BC4B3] hover:bg-[#f0faf9] ${
                                        section.layout === layout.id ? 'border-[#2BC4B3] bg-[#f0faf9]' : 'border-gray-200'
                                      }`}
                                    >
                                      <div className="flex items-center gap-3 mb-2">
                                        <span className="text-2xl">{layout.icon}</span>
                                        <span className="font-bold text-[#1e3a5f] text-sm">{layout.label}</span>
                                      </div>
                                      <p className="text-xs text-gray-500 leading-relaxed">{layout.desc}</p>
                                      {layout.slots > 0 && (
                                        <p className="text-xs text-[#2BC4B3] font-semibold mt-1">{layout.slots} image slot{layout.slots > 1 ? 's' : ''}</p>
                                      )}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        

                      </div>
                    )}

                    {/* Video - Media Container */}
                    {section.type === 'video' && !collapsedSections[section.id] && (
                      <div className="space-y-4">
                        <div
                          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center focus-within:border-[#2BC4B3] transition-colors"
                          tabIndex={0}
                          onPaste={(e) => {
                            const items = e.clipboardData?.items;
                            if (!items) return;
                            for (let i = 0; i < items.length; i++) {
                              if (items[i].type.startsWith('video/')) {
                                e.preventDefault();
                                const file = items[i].getAsFile();
                                if (!file) return;
                                const fileSizeMB = file.size / (1024 * 1024);
                                if (fileSizeMB > 100) {
                                  console.error(`Video exceeds 100MB limit. Your file is ${fileSizeMB.toFixed(2)}MB.`);
                                  return;
                                }
                                const fileUrl = URL.createObjectURL(file);
                                setSections(prev => prev.map(s =>
                                  s.id === section.id
                                    ? { ...s, content: fileUrl, file: file, fileName: file.name || 'pasted-video.mp4' }
                                    : s
                                ));
                                return;
                              }
                            }
                          }}
                          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const file = e.dataTransfer.files?.[0];
                            if (file && file.type.startsWith('video/')) {
                              const fakeEvent = { target: { files: [file] } };
                              handleFileUpload(section.id, fakeEvent, 'video');
                            }
                          }}
                        >
                          {section.content ? (
                            <div className="relative">
                              <video 
                                src={section.content} 
                                controls 
                                className="max-w-full h-auto mx-auto rounded-lg shadow-md"
                                draggable="false"
                              />
                              <label className="mt-4 inline-block px-6 py-2 bg-[#1e5a8e] hover:bg-[#164570] text-white rounded-lg cursor-pointer transition-all">
                                Change Video
                                <input
                                  type="file"
                                  accept="video/*"
                                  onChange={(e) => handleFileUpload(section.id, e, 'video')}
                                  className="hidden"
                                />
                              </label>
                            </div>
                          ) : (
                            <div>
                              <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              <label className="px-6 py-3 bg-[#1e5a8e] hover:bg-[#164570] text-white rounded-lg cursor-pointer transition-all inline-block font-semibold">
                                Import Video
                                <input
                                  type="file"
                                  accept="video/*"
                                  onChange={(e) => handleFileUpload(section.id, e, 'video')}
                                  className="hidden"
                                />
                              </label>
                              <p className="text-sm text-gray-500 mt-2">MP4, WebM - Maximum 100MB</p>
                              <p className="text-sm text-gray-400 mt-1">or drag a video file here</p>
                            </div>
                          )}
                        </div>
                        
                        {/* Caption Text Field - Same Width as Video Container */}
                        <div className="relative">
                          <div
                            id={`textarea-video-caption-${section.id}`}
                            contentEditable
                            suppressContentEditableWarning
                            ref={(el) => {
                              if (el && !el.hasAttribute('data-initialized')) {
                                el.innerHTML = section.caption || '';
                                el.setAttribute('data-initialized', 'true');
                              }
                            }}
                            onInput={(e) => {
                              if (e.currentTarget) {
                                const newValue = sanitizeHtml(e.currentTarget.innerHTML);
                                handleSectionContentChange(section.id, 'caption', newValue);
                              }
                            }}
                            onPaste={(e) => handleRichPaste(e, section.id, 'caption')}
                            onFocus={() => setActiveTextarea(`textarea-video-caption-${section.id}`)}
                            data-placeholder="Enter video caption or description..."
                            className="w-full min-h-[80px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-[#2BC4B3] focus:outline-none text-gray-700 leading-relaxed empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                            style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                          />
                        </div>
                      </div>
                    )}

                    {/* References - ContentEditable */}
                    {section.type === 'references' && !collapsedSections[section.id] && (
                      <div className="relative">
                        <div
                          id={`textarea-${section.id}`}
                          contentEditable
                          suppressContentEditableWarning
                          ref={(el) => {
                            if (el && !el.hasAttribute('data-initialized')) {
                              el.innerHTML = section.content || '';
                              el.setAttribute('data-initialized', 'true');
                            }
                          }}
                          onInput={(e) => {
                            if (e.currentTarget) {
                              // Use innerHTML and sanitize to preserve formatting (bullets, bold, etc.)
                              const newValue = sanitizeHtml(e.currentTarget.innerHTML);
                              handleSectionContentChange(section.id, 'content', newValue);
                            }
                          }}
                          onPaste={(e) => handleRichPaste(e, section.id, 'content')}
                          onFocus={() => setActiveTextarea(`textarea-${section.id}`)}
                          data-placeholder="Enter references (one per line)..."
                          className="w-full min-h-[150px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-[#2BC4B3] focus:outline-none text-gray-700 font-mono text-sm empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                          style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                        />
                      </div>
                    )}

                    {/* Review - Multiple Choice Editor */}
                    {section.type === 'review-multiple-choice' && !collapsedSections[section.id] && (
                      <div className="space-y-4 w-full">
                        <div className="bg-blue-50 border-l-4 border-blue-500 px-4 py-2 rounded-r mb-2">
                          <p className="text-sm text-blue-700">These questions will pop up as a quiz overlay with blurred background when the user reaches this point in the lesson.</p>
                        </div>
                        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                          {(section.questions || []).map((question, qIdx) => (
                            <div key={question.id} className="border-2 border-gray-300 rounded-lg overflow-hidden">
                              <div className="flex items-center justify-between px-4 py-2 bg-blue-50 border-b-2 border-gray-300">
                                <div className="text-sm font-bold text-gray-600">{qIdx + 1}/{(section.questions || []).length}</div>
                                <button onClick={() => handleDeleteSectionQuestion(section.id, question.id)} className="w-6 h-6 bg-red-400 hover:bg-red-500 rounded-full flex items-center justify-center">
                                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                              </div>
                              <div className="p-4">
                                <div
                                  id={`input-reviewmc-question-${question.id}`}
                                  contentEditable
                                  suppressContentEditableWarning
                                  dangerouslySetInnerHTML={{ __html: stripHtml(question.question) || '' }}
                                  onInput={(e) => handleSectionQuestionChange(section.id, question.id, 'question', e.currentTarget.textContent || '')}
                                  onPaste={(e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\s+/g, ' ').trim()); }}
                                  onFocus={() => setActiveTextarea(`input-reviewmc-question-${question.id}`)}
                                  data-placeholder="Type in the question here"
                                  className="w-full min-h-[40px] px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-[#2BC4B3] focus:outline-none text-gray-900 mb-3 empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                                  style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                                />
                                <div className="border-2 border-gray-300 rounded-lg overflow-hidden">
                                  <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-200">
                                    <span className="text-xs font-semibold text-gray-600">Answer Choices (one per line)</span>
                                    <span className="text-xs text-gray-400">Select correct →</span>
                                  </div>
                                  <div className="flex">
                                    <textarea
                                      value={question.options.join('\n')}
                                      onChange={(e) => {
                                        const lines = e.target.value.split('\n');
                                        const newOptions = ['', '', '', ''];
                                        lines.forEach((line, i) => { if (i < 4) newOptions[i] = line; });
                                        handleSectionQuestionChange(section.id, question.id, 'options', newOptions);
                                      }}
                                      placeholder={"a. First choice\nb. Second choice\nc. Third choice\nd. Fourth choice"}
                                      rows={4}
                                      className="flex-1 px-3 py-2 focus:outline-none text-gray-900 resize-none leading-8 text-sm"
                                    />
                                    <div className="flex flex-col justify-center gap-[2px] pr-2 pl-2 border-l border-gray-200 bg-gray-50">
                                      {['a', 'b', 'c', 'd'].map((letter, idx) => (
                                        <label key={letter} className="flex items-center gap-1 cursor-pointer h-8">
                                          <input type="radio" name={`reviewmc-correct-${question.id}`} checked={question.correctAnswer === idx} onChange={() => handleSectionQuestionChange(section.id, question.id, 'correctAnswer', idx)} className="w-3 h-3 text-green-500" />
                                          <span className={`text-xs font-medium ${question.correctAnswer === idx ? 'text-green-600' : 'text-gray-400'}`}>{question.correctAnswer === idx ? `${letter}. ✓` : `${letter}.`}</span>
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                          <button onClick={() => handleAddSectionQuestion(section.id)} className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-[#1e5a8e] hover:text-[#1e5a8e] transition-all flex items-center justify-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            Add Question
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Review - Drag and Drop (Simulation Picker) */}
                    {section.type === 'review-drag-drop' && !collapsedSections[section.id] && (
                      <div className="w-full">
                        <div className="bg-purple-50 border-l-4 border-purple-500 px-4 py-2 rounded-r mb-4">
                          <p className="text-sm text-purple-700">This simulation will appear as an interactive overlay with blurred background when the user reaches this point in the lesson.</p>
                        </div>
                        {section.simulation ? (
                          <div className="border-2 border-purple-400 rounded-lg p-4 bg-purple-50">
                            <div className="flex items-center justify-between">
                              <div>
                                <h3 className="text-lg font-bold text-[#1e5a8e]">{section.simulation.SimulationTitle}</h3>
                                <p className="text-gray-600 mt-1 text-sm">{section.simulation.Description}</p>
                                <div className="flex gap-3 mt-2 flex-wrap">
                                  <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded-full">Type: {section.simulation.ActivityType}</span>
                                  <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded-full">Max Score: {section.simulation.MaxScore}</span>
                                  {section.simulation.TimeLimit > 0 && (
                                    <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded-full">Time: {section.simulation.TimeLimit}min</span>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={() => { setDndPickerSectionId(section.id); setShowDndSimPicker(true); }}
                                className="px-4 py-2 bg-[#1e5a8e] text-white rounded-lg hover:bg-[#164570] transition-all font-semibold text-sm flex-shrink-0 ml-3"
                              >Change</button>
                            </div>
                          </div>
                        ) : (
                          <div className="border-2 border-dashed border-gray-300 rounded-lg p-10 flex flex-col items-center justify-center">
                            <svg className="w-12 h-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                            </svg>
                            <p className="text-gray-500 mb-3">No simulation selected</p>
                            <button
                              onClick={() => { setDndPickerSectionId(section.id); setShowDndSimPicker(true); }}
                              className="px-5 py-2 bg-[#1e5a8e] text-white rounded-lg hover:bg-[#164570] transition-all font-semibold text-sm shadow-md"
                            >Select Simulation</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Delete Button */}
                  <button
                    onClick={() => handleDeleteSection(section.id)}
                    className="flex-shrink-0 w-8 h-8 bg-red-400 hover:bg-red-500 rounded-full flex items-center justify-center transition-all"
                  >
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {/* Insert between button */}
                <div className="flex justify-center -mt-2 -mb-2">
                  <button
                    onClick={() => { setInsertAtIndex(sectionIndex + 1); setShowSectionModal(true); }}
                    className="group flex items-center gap-1 px-3 py-1 rounded-full text-gray-300 hover:text-[#2BC4B3] hover:bg-[#2BC4B3]/10 transition-all"
                    title="Insert section here"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    <span className="text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">Add Section</span>
                  </button>
                </div>
                </React.Fragment>
              ))}
            </div>
          )}

          {/* Add Section Area */}
          <div className="mt-12 pt-8 border-t-2 border-gray-200">
            <div className="border-2 border-gray-300 rounded-xl p-16 flex flex-col items-center justify-center hover:border-[#1e5a8e] transition-all cursor-pointer group">
              <button
                onClick={handleAddSection}
                className="flex flex-col items-center gap-3"
              >
                <div className="w-20 h-20 bg-[#1e5a8e] rounded-full flex items-center justify-center group-hover:bg-[#2BC4B3] transition-all shadow-lg">
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="text-xl font-semibold text-gray-700 group-hover:text-[#1e5a8e]">
                  Add Section
                </span>
              </button>
            </div>
          </div>

          {/* Note */}
          <div className="mt-6 bg-blue-50 border-l-4 border-[#1e5a8e] p-4">
            <p className="text-sm text-gray-700">
              <span className="font-bold">Note:</span> Include at least 10 total review sections to generate a diagnostic for the lesson
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between items-center mt-8 pt-6 border-t-2 border-gray-200">
            <div></div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveLesson}
                disabled={loading}
                className="px-8 py-3 bg-[#2BC4B3] hover:bg-[#1a9d8f] text-white rounded-lg font-semibold transition-all shadow-md disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save Lesson'}
              </button>
              {(() => {
                const currentIdx = roadmapStages.findIndex(s => s.type === 'lesson');
                const nextStage = currentIdx >= 0 && currentIdx < roadmapStages.length - 1 ? roadmapStages[currentIdx + 1] : null;
                return nextStage ? (
                  <button
                    onClick={() => setActiveStage(nextStage.type)}
                    className="px-8 py-3 bg-[#1e5a8e] hover:bg-[#164570] text-white rounded-lg font-semibold transition-all shadow-md flex items-center gap-2"
                  >
                    Continue to {nextStage.label}
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                ) : null;
              })()}
            </div>
          </div>
        </div>
        )}

        {/* Diagnostic Stage */}
        {activeStage === 'diagnostic' && (
        <div className="bg-white rounded-xl shadow-sm p-8 space-y-6">
          <h2 className="text-2xl font-bold text-[#1e5a8e] mb-4">Diagnostic Assessment for {lessonData.ModuleTitle || 'New Lesson'}</h2>
          
          {/* Questions List */}
          <div className="space-y-6 max-h-[600px] overflow-y-auto pr-4">
            {diagnosticQuestions.map((question, index) => (
              <div key={question.id} className="border-2 border-gray-300 rounded-lg relative overflow-hidden">
                {/* Question Counter and Delete Button Container */}
                <div className="flex items-center justify-between px-6 py-3 bg-gray-50 border-b-2 border-gray-300">
                  <div className="text-xl font-bold text-gray-600">
                    {index + 1}/{diagnosticQuestions.length}
                  </div>
                  <button
                    onClick={() => handleDeleteQuestion('diagnostic', question.id)}
                    className="w-7 h-7 bg-red-400 hover:bg-red-500 rounded-full flex items-center justify-center transition-all"
                  >
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                </div>

                {/* Question Content */}
                <div className="p-6">
                {/* Question Input */}
                <div
                  id={`input-diagnostic-question-${question.id}`}
                  contentEditable
                  suppressContentEditableWarning
                  dangerouslySetInnerHTML={{ __html: stripHtml(question.question) || '' }}
                  onInput={(e) => {
                    if (e.currentTarget) {
                      const newValue = e.currentTarget.textContent || '';
                      handleQuestionChange('diagnostic', question.id, 'question', newValue);
                    }
                  }}
                  onPaste={(e) => {
                    e.preventDefault();
                    const text = e.clipboardData.getData('text/plain');
                    const cleanText = text.replace(/\s+/g, ' ').trim();
                    document.execCommand('insertText', false, cleanText);
                  }}
                  onFocus={() => setActiveTextarea(`input-diagnostic-question-${question.id}`)}
                  data-placeholder="Type in the question here"
                  className="w-full min-h-[48px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-[#2BC4B3] focus:outline-none text-gray-900 mb-4 empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                  style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                />

                {/* Skills Section */}
                <div className="mb-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="font-bold text-gray-900">Skill:</span>
                    {['No Skill', 'Memorization', 'Technical Comprehension', 'Analytical Thinking', 'Problem Solving', 'Critical Thinking'].map((skill) => (
                      <label key={skill} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`skill-${question.id}`}
                          checked={question.skill === skill}
                          onChange={() => handleQuestionChange('diagnostic', question.id, 'skill', skill)}
                          className="w-4 h-4 text-[#2BC4B3]"
                        />
                        <span className={`${skill === 'No Skill' ? 'text-gray-400 italic' : 'text-gray-700'}`}>{skill}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Answer Options - Merged Container */}
                <div className="border-2 border-gray-300 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
                    <span className="text-sm font-semibold text-gray-600">Answer Choices (one per line)</span>
                    <span className="text-xs text-gray-400">Select correct answer →</span>
                  </div>
                  <div className="flex">
                    <textarea
                      id={`textarea-diagnostic-options-${question.id}`}
                      value={question.options.join('\n')}
                      onChange={(e) => {
                        const lines = e.target.value.split('\n');
                        const newOptions = ['', '', '', ''];
                        lines.forEach((line, i) => {
                          if (i < 4) newOptions[i] = line;
                        });
                        handleQuestionChange('diagnostic', question.id, 'options', newOptions);
                      }}
                      onFocus={() => setActiveTextarea(`textarea-diagnostic-options-${question.id}`)}
                      placeholder={"a. First choice\nb. Second choice\nc. Third choice\nd. Fourth choice"}
                      rows={4}
                      className="flex-1 px-4 py-3 focus:outline-none text-gray-900 resize-none leading-8"
                    />
                    <div className="flex flex-col justify-center gap-[2px] pr-3 pl-2 border-l border-gray-200 bg-gray-50">
                      {['a', 'b', 'c', 'd'].map((letter, idx) => (
                        <label key={letter} className="flex items-center gap-1.5 cursor-pointer group h-8">
                          <input
                            type="radio"
                            name={`correct-answer-${question.id}`}
                            checked={question.correctAnswer === idx}
                            onChange={() => handleQuestionChange('diagnostic', question.id, 'correctAnswer', idx)}
                            className="w-4 h-4 text-green-500 focus:ring-green-500 cursor-pointer"
                          />
                          <span className={`text-xs font-medium whitespace-nowrap ${
                            question.correctAnswer === idx 
                              ? 'text-green-600' 
                              : 'text-gray-400 group-hover:text-gray-600'
                          }`}>
                            {question.correctAnswer === idx ? `${letter}. ✓` : `${letter}.`}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                </div>
              </div>
            ))}

            {/* Add Question Button */}
            <div className="border-2 border-gray-300 rounded-lg p-12 flex flex-col items-center justify-center hover:border-[#1e5a8e] transition-all cursor-pointer group">
              <button
                onClick={() => handleAddQuestion('diagnostic')}
                className="flex flex-col items-center gap-3"
              >
                <div className="w-16 h-16 bg-[#1e5a8e] rounded-full flex items-center justify-center group-hover:bg-[#2BC4B3] transition-all shadow-lg">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="text-lg font-semibold text-gray-700 group-hover:text-[#1e5a8e]">Add Question</span>
              </button>
            </div>
          </div>

          {/* Save & Next Buttons */}
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={handleSaveLesson}
              disabled={loading}
              className="px-8 py-4 bg-[#2BC4B3] text-white font-bold text-lg rounded-lg hover:bg-[#1e5a8e] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {loading ? 'Saving...' : 'Save Diagnostic Assessment'}
            </button>
            {(() => {
              const currentIdx = roadmapStages.findIndex(s => s.type === 'diagnostic');
              const nextStage = currentIdx >= 0 && currentIdx < roadmapStages.length - 1 ? roadmapStages[currentIdx + 1] : null;
              return nextStage ? (
                <button
                  onClick={() => setActiveStage(nextStage.type)}
                  className="px-8 py-4 bg-[#1e5a8e] hover:bg-[#164570] text-white font-bold text-lg rounded-lg transition-all shadow-lg flex items-center gap-2"
                >
                  Continue to {nextStage.label}
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              ) : null;
            })()}
          </div>
        </div>
        )}

        {/* Review Assessment Stage */}
        {activeStage === 'review' && (
        <div className="bg-white rounded-xl shadow-sm p-8 space-y-6">
          <h2 className="text-2xl font-bold text-[#1e5a8e] mb-4">Review Assessment for {lessonData.ModuleTitle || 'New Lesson'}</h2>
          
          {/* Questions List */}
          <div className="space-y-6 max-h-[600px] overflow-y-auto pr-4">
            {reviewQuestions.map((question, index) => (
              <div key={question.id} className="border-2 border-gray-300 rounded-lg relative overflow-hidden">
                {/* Question Counter and Delete Button Container */}
                <div className="flex items-center justify-between px-6 py-3 bg-gray-50 border-b-2 border-gray-300">
                  <div className="text-xl font-bold text-gray-600">
                    {index + 1}/{reviewQuestions.length}
                  </div>
                  <button
                    onClick={() => handleDeleteQuestion('review', question.id)}
                    className="w-7 h-7 bg-red-400 hover:bg-red-500 rounded-full flex items-center justify-center transition-all"
                  >
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                </div>

                {/* Question Content */}
                <div className="p-6">
                {/* Question Input */}
                <div
                  id={`input-review-question-${question.id}`}
                  contentEditable
                  suppressContentEditableWarning
                  dangerouslySetInnerHTML={{ __html: stripHtml(question.question) || '' }}
                  onInput={(e) => {
                    if (e.currentTarget) {
                      const newValue = e.currentTarget.textContent || '';
                      handleQuestionChange('review', question.id, 'question', newValue);
                    }
                  }}
                  onPaste={(e) => {
                    e.preventDefault();
                    const text = e.clipboardData.getData('text/plain');
                    const cleanText = text.replace(/\s+/g, ' ').trim();
                    document.execCommand('insertText', false, cleanText);
                  }}
                  onFocus={() => setActiveTextarea(`input-review-question-${question.id}`)}
                  data-placeholder="Type in the question here"
                  className="w-full min-h-[48px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-[#2BC4B3] focus:outline-none text-gray-900 mb-4 empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                  style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                />

                {/* Answer Options - Merged Container */}
                <div className="border-2 border-gray-300 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
                    <span className="text-sm font-semibold text-gray-600">Answer Choices (one per line)</span>
                    <span className="text-xs text-gray-400">Select correct answer →</span>
                  </div>
                  <div className="flex">
                    <textarea
                      id={`textarea-review-options-${question.id}`}
                      value={question.options.join('\n')}
                      onChange={(e) => {
                        const lines = e.target.value.split('\n');
                        const newOptions = ['', '', '', ''];
                        lines.forEach((line, i) => {
                          if (i < 4) newOptions[i] = line;
                        });
                        handleQuestionChange('review', question.id, 'options', newOptions);
                      }}
                      onFocus={() => setActiveTextarea(`textarea-review-options-${question.id}`)}
                      placeholder={"a. First choice\nb. Second choice\nc. Third choice\nd. Fourth choice"}
                      rows={4}
                      className="flex-1 px-4 py-3 focus:outline-none text-gray-900 resize-none leading-8"
                    />
                    <div className="flex flex-col justify-center gap-[2px] pr-3 pl-2 border-l border-gray-200 bg-gray-50">
                      {['a', 'b', 'c', 'd'].map((letter, idx) => (
                        <label key={letter} className="flex items-center gap-1.5 cursor-pointer group h-8">
                          <input
                            type="radio"
                            name={`correct-answer-${question.id}`}
                            checked={question.correctAnswer === idx}
                            onChange={() => handleQuestionChange('review', question.id, 'correctAnswer', idx)}
                            className="w-4 h-4 text-green-500 focus:ring-green-500 cursor-pointer"
                          />
                          <span className={`text-xs font-medium whitespace-nowrap ${
                            question.correctAnswer === idx 
                              ? 'text-green-600' 
                              : 'text-gray-400 group-hover:text-gray-600'
                          }`}>
                            {question.correctAnswer === idx ? `${letter}. ✓` : `${letter}.`}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                </div>
              </div>
            ))}

            {/* Add Question Button */}
            <div className="border-2 border-gray-300 rounded-lg p-12 flex flex-col items-center justify-center hover:border-[#1e5a8e] transition-all cursor-pointer group">
              <button
                onClick={() => handleAddQuestion('review')}
                className="flex flex-col items-center gap-3"
              >
                <div className="w-16 h-16 bg-[#1e5a8e] rounded-full flex items-center justify-center group-hover:bg-[#2BC4B3] transition-all shadow-lg">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="text-lg font-semibold text-gray-700 group-hover:text-[#1e5a8e]">Add Question</span>
              </button>
            </div>
          </div>

          {/* Next Button */}
          {(() => {
            const currentIdx = roadmapStages.findIndex(s => s.type === 'review');
            const nextStage = currentIdx >= 0 && currentIdx < roadmapStages.length - 1 ? roadmapStages[currentIdx + 1] : null;
            return nextStage ? (
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setActiveStage(nextStage.type)}
                  className="px-8 py-4 bg-[#1e5a8e] hover:bg-[#164570] text-white font-bold text-lg rounded-lg transition-all shadow-lg flex items-center gap-2"
                >
                  Continue to {nextStage.label}
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            ) : null;
          })()}
        </div>
        )}

        {/* Final Assessment Stage */}
        {activeStage === 'final' && (
        <div className="bg-white rounded-xl shadow-sm p-8 space-y-6">
          <h2 className="text-2xl font-bold text-[#1e5a8e] mb-4">Final Assessment for {lessonData.ModuleTitle || 'New Lesson'}</h2>
          
          {/* Instruction / Message for Users */}
          <div className="border-2 border-gray-200 rounded-lg p-5 bg-gray-50">
            <label className="block text-sm font-bold text-gray-700 mb-2">
              <svg className="w-4 h-4 inline mr-1 text-[#1e5a8e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Instruction / Message for Students
            </label>
            <textarea
              value={finalInstruction}
              onChange={(e) => setFinalInstruction(e.target.value)}
              placeholder="e.g., This final assessment affects your learning path progression. Read and answer each question carefully. Good luck!"
              rows={3}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-[#2BC4B3] focus:outline-none text-gray-900 resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">This message will be shown to students before they start the final assessment.</p>
          </div>

          {/* Questions List */}
          <div className="space-y-6 max-h-[600px] overflow-y-auto pr-4">
            {finalQuestions.map((question, index) => (
              <div key={question.id} className="border-2 border-gray-300 rounded-lg relative overflow-hidden">
                {/* Question Counter and Delete Button Container */}
                <div className="flex items-center justify-between px-6 py-3 bg-gray-50 border-b-2 border-gray-300">
                  <div className="text-xl font-bold text-gray-600">
                    {index + 1}/{finalQuestions.length}
                  </div>
                  <button
                    onClick={() => handleDeleteQuestion('final', question.id)}
                    className="w-7 h-7 bg-red-400 hover:bg-red-500 rounded-full flex items-center justify-center transition-all"
                  >
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                </div>

                {/* Question Content */}
                <div className="p-6">
                {/* Question Input */}
                <div
                  id={`input-final-question-${question.id}`}
                  contentEditable
                  suppressContentEditableWarning
                  dangerouslySetInnerHTML={{ __html: stripHtml(question.question) || '' }}
                  onInput={(e) => {
                    if (e.currentTarget) {
                      const newValue = e.currentTarget.textContent || '';
                      handleQuestionChange('final', question.id, 'question', newValue);
                    }
                  }}
                  onPaste={(e) => {
                    e.preventDefault();
                    const text = e.clipboardData.getData('text/plain');
                    const cleanText = text.replace(/\s+/g, ' ').trim();
                    document.execCommand('insertText', false, cleanText);
                  }}
                  onFocus={() => setActiveTextarea(`input-final-question-${question.id}`)}
                  data-placeholder="Type in the question here"
                  className="w-full min-h-[48px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-[#2BC4B3] focus:outline-none text-gray-900 mb-4 empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                  style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                />

                {/* Skills Section */}
                <div className="mb-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="font-bold text-gray-900">Skill:</span>
                    {['No Skill', 'Memorization', 'Technical Comprehension', 'Analytical Thinking', 'Problem Solving', 'Critical Thinking'].map((skill) => (
                      <label key={skill} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`skill-${question.id}`}
                          checked={question.skill === skill}
                          onChange={() => handleQuestionChange('final', question.id, 'skill', skill)}
                          className="w-4 h-4 text-[#2BC4B3]"
                        />
                        <span className={`${skill === 'No Skill' ? 'text-gray-400 italic' : 'text-gray-700'}`}>{skill}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Answer Options - Merged Container */}
                <div className="border-2 border-gray-300 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
                    <span className="text-sm font-semibold text-gray-600">Answer Choices (one per line)</span>
                    <span className="text-xs text-gray-400">Select correct answer →</span>
                  </div>
                  <div className="flex">
                    <textarea
                      id={`textarea-final-options-${question.id}`}
                      value={question.options.join('\n')}
                      onChange={(e) => {
                        const lines = e.target.value.split('\n');
                        const newOptions = ['', '', '', ''];
                        lines.forEach((line, i) => {
                          if (i < 4) newOptions[i] = line;
                        });
                        handleQuestionChange('final', question.id, 'options', newOptions);
                      }}
                      onFocus={() => setActiveTextarea(`textarea-final-options-${question.id}`)}
                      placeholder={"a. First choice\nb. Second choice\nc. Third choice\nd. Fourth choice"}
                      rows={4}
                      className="flex-1 px-4 py-3 focus:outline-none text-gray-900 resize-none leading-8"
                    />
                    <div className="flex flex-col justify-center gap-[2px] pr-3 pl-2 border-l border-gray-200 bg-gray-50">
                      {['a', 'b', 'c', 'd'].map((letter, idx) => (
                        <label key={letter} className="flex items-center gap-1.5 cursor-pointer group h-8">
                          <input
                            type="radio"
                            name={`correct-answer-${question.id}`}
                            checked={question.correctAnswer === idx}
                            onChange={() => handleQuestionChange('final', question.id, 'correctAnswer', idx)}
                            className="w-4 h-4 text-green-500 focus:ring-green-500 cursor-pointer"
                          />
                          <span className={`text-xs font-medium whitespace-nowrap ${
                            question.correctAnswer === idx 
                              ? 'text-green-600' 
                              : 'text-gray-400 group-hover:text-gray-600'
                          }`}>
                            {question.correctAnswer === idx ? `${letter}. ✓` : `${letter}.`}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                </div>
              </div>
            ))}

            {/* Add Question Button */}
            <div className="border-2 border-gray-300 rounded-lg p-12 flex flex-col items-center justify-center hover:border-[#1e5a8e] transition-all cursor-pointer group">
              <button
                onClick={() => handleAddQuestion('final')}
                className="flex flex-col items-center gap-3"
              >
                <div className="w-16 h-16 bg-[#1e5a8e] rounded-full flex items-center justify-center group-hover:bg-[#2BC4B3] transition-all shadow-lg">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="text-lg font-semibold text-gray-700 group-hover:text-[#1e5a8e]">Add Question</span>
              </button>
            </div>
          </div>

          {/* Save & Next Buttons */}
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={handleSaveLesson}
              disabled={loading}
              className="px-8 py-4 bg-[#2BC4B3] text-white font-bold text-lg rounded-lg hover:bg-[#1e5a8e] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {loading ? 'Saving...' : 'Save Final Assessment'}
            </button>
            {(() => {
              const currentIdx = roadmapStages.findIndex(s => s.type === 'final');
              const nextStage = currentIdx >= 0 && currentIdx < roadmapStages.length - 1 ? roadmapStages[currentIdx + 1] : null;
              return nextStage ? (
                <button
                  onClick={() => setActiveStage(nextStage.type)}
                  className="px-8 py-4 bg-[#1e5a8e] hover:bg-[#164570] text-white font-bold text-lg rounded-lg transition-all shadow-lg flex items-center gap-2"
                >
                  Continue to {nextStage.label}
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              ) : null;
            })()}
          </div>
        </div>
        )}

        {/* Simulation Stage */}
        {activeStage === 'simulation' && (
        <div className="bg-white rounded-xl shadow-sm p-8 space-y-6">
          <h2 className="text-2xl font-bold text-[#1e5a8e] mb-4">Simulation</h2>
          {selectedSimulation ? (
            <div className="border-2 border-[#2BC4B3] rounded-lg p-6 bg-[#f0faf9]">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-[#1e5a8e]">{selectedSimulation.SimulationTitle}</h3>
                  <p className="text-gray-600 mt-2">{selectedSimulation.Description}</p>
                  <div className="flex gap-4 mt-3 flex-wrap">
                    <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">Type: {selectedSimulation.ActivityType}</span>
                    <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">Max Score: {selectedSimulation.MaxScore}</span>
                    {selectedSimulation.TimeLimit > 0 && (
                      <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">Time Limit: {selectedSimulation.TimeLimit} min</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setShowSimulationPicker(true)}
                  className="px-5 py-2.5 bg-[#1e5a8e] text-white rounded-lg hover:bg-[#164570] transition-all font-semibold flex-shrink-0 ml-4"
                >
                  Change
                </button>
              </div>
            </div>
          ) : (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-16 flex flex-col items-center justify-center">
              <svg className="w-16 h-16 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
              <p className="text-gray-500 text-lg mb-4">No simulation selected</p>
              <button
                onClick={() => setShowSimulationPicker(true)}
                className="px-6 py-3 bg-[#1e5a8e] text-white rounded-lg hover:bg-[#164570] transition-all font-semibold shadow-md"
              >
                Select Simulation
              </button>
            </div>
          )}

          {/* Save & Next Buttons */}
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={handleSaveLesson}
              disabled={loading}
              className="px-8 py-4 bg-[#2BC4B3] text-white font-bold text-lg rounded-lg hover:bg-[#1e5a8e] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {loading ? 'Saving...' : 'Save Lesson'}
            </button>
            {(() => {
              const currentIdx = roadmapStages.findIndex(s => s.type === 'simulation');
              const nextStage = currentIdx >= 0 && currentIdx < roadmapStages.length - 1 ? roadmapStages[currentIdx + 1] : null;
              return nextStage ? (
                <button
                  onClick={() => setActiveStage(nextStage.type)}
                  className="px-8 py-4 bg-[#1e5a8e] hover:bg-[#164570] text-white font-bold text-lg rounded-lg transition-all shadow-lg flex items-center gap-2"
                >
                  Continue to {nextStage.label}
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              ) : null;
            })()}
          </div>
        </div>
        )}
      </div>

      {/* Quick navigation arrows for long editor pages */}
      <div className="fixed right-4 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-3">
        <div className="group relative">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="w-11 h-11 rounded-full bg-white border border-gray-300 shadow-md hover:border-[#2BC4B3] hover:text-[#1e5a8e] text-gray-600 flex items-center justify-center transition-all"
            aria-label="Go to top"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <span className="absolute right-14 top-1/2 -translate-y-1/2 whitespace-nowrap bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            go to top
          </span>
        </div>

        <div className="group relative">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })}
            className="w-11 h-11 rounded-full bg-white border border-gray-300 shadow-md hover:border-[#2BC4B3] hover:text-[#1e5a8e] text-gray-600 flex items-center justify-center transition-all"
            aria-label="Go to bottom"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <span className="absolute right-14 top-1/2 -translate-y-1/2 whitespace-nowrap bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            go to bottom
          </span>
        </div>
      </div>

      {/* Materials Side Panel */}
      {showSectionModal && (
        <>
          {/* Overlay */}
          <div 
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => { setShowSectionModal(false); setInsertAtIndex(null); }}
          ></div>

          {/* Side Panel */}
          <div className="fixed top-0 right-0 h-full w-96 bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b-2 border-gray-200">
              <h2 className="text-3xl font-bold text-[#1e5a8e]">Materials</h2>
              <button
                onClick={() => { setShowSectionModal(false); setInsertAtIndex(null); }}
                className="text-[#1e5a8e] hover:text-[#2BC4B3] transition-colors"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Materials List */}
            <div className="p-4 space-y-2 overflow-y-auto h-[calc(100%-88px)]">
              <button
                onClick={() => handleAddMaterial('topic')}
                className="w-full py-4 px-6 bg-[#1e5a8e] hover:bg-[#164570] text-white rounded-lg font-bold text-xl transition-all shadow-md"
              >
                Topic Title
              </button>

              <button
                onClick={() => handleAddMaterial('subtopic')}
                className="w-full py-4 px-6 bg-[#1e5a8e] hover:bg-[#164570] text-white rounded-lg font-bold text-xl transition-all shadow-md"
              >
                Subtopic Title
              </button>

              <button
                onClick={() => handleAddMaterial('paragraph')}
                className="w-full py-4 px-6 bg-[#1e5a8e] hover:bg-[#164570] text-white rounded-lg font-bold text-xl transition-all shadow-md"
              >
                Paragraph
              </button>

              <button
                onClick={() => handleAddMaterial('image')}
                className="w-full py-4 px-6 bg-[#1e5a8e] hover:bg-[#164570] text-white rounded-lg font-bold text-xl transition-all shadow-md"
              >
                Image
              </button>

              <button
                onClick={() => handleAddMaterial('video')}
                className="w-full py-4 px-6 bg-[#1e5a8e] hover:bg-[#164570] text-white rounded-lg font-bold text-xl transition-all shadow-md"
              >
                Video
              </button>

              <button
                onClick={() => handleAddMaterial('review-multiple-choice')}
                className="w-full py-4 px-6 bg-[#1e5a8e] hover:bg-[#164570] text-white rounded-lg font-bold text-xl transition-all shadow-md"
              >
                Review - Multiple Choice
              </button>

              <button
                onClick={() => handleAddMaterial('review-drag-drop')}
                className="w-full py-4 px-6 bg-[#1e5a8e] hover:bg-[#164570] text-white rounded-lg font-bold text-xl transition-all shadow-md"
              >
                Review - Drag and Drop
              </button>

              <button
                onClick={() => handleAddMaterial('references')}
                className="w-full py-4 px-6 bg-[#1e5a8e] hover:bg-[#164570] text-white rounded-lg font-bold text-xl transition-all shadow-md"
              >
                References
              </button>
            </div>
          </div>
        </>
      )}

      {/* Add Stage Modal */}
      {showAddStageModal && (
        <>
          <div 
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => setShowAddStageModal(false)}
          ></div>
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl z-50 p-8 w-[420px]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-[#1e5a8e]">Add Stage</h2>
              <button
                onClick={() => setShowAddStageModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              {[
                { type: 'diagnostic', label: 'Diagnostic', desc: 'Pre-assessment to evaluate prior knowledge', icon: (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                )},
                { type: 'review', label: 'Review Assessment', desc: 'Mid-lesson review questions', icon: (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )},
                { type: 'lesson', label: 'Lesson', desc: 'Main lesson content and materials', icon: (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                )},
                { type: 'final', label: 'Final Assessment', desc: 'End-of-lesson comprehensive assessment', icon: (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                )},
                { type: 'simulation', label: 'Simulation', desc: 'Import an existing interactive simulation', icon: (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                  </svg>
                )},
              ].map(option => {
                return (
                  <button
                    key={option.type}
                    onClick={() => handleAddStage(option.type)}
                    className="w-full py-4 px-5 rounded-lg text-left transition-all flex items-center gap-4 bg-white border-2 border-gray-200 hover:border-[#2BC4B3] hover:bg-[#f0faf9] text-gray-800"
                  >
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-[#1e5a8e] text-white">
                      {option.icon}
                    </div>
                    <div>
                      <div className="font-bold text-lg">{option.label}</div>
                      <div className="text-sm text-gray-500">{option.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Simulation Picker Modal */}
      {showSimulationPicker && (
        <>
          <div 
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => setShowSimulationPicker(false)}
          ></div>
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl z-50 p-8 w-[520px] max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-[#1e5a8e]">Select Simulation</h2>
              <button
                onClick={() => setShowSimulationPicker(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {availableSimulations.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
                <p className="text-gray-500 text-lg">No simulations available</p>
                <p className="text-gray-400 text-sm mt-2">Create simulations first in the Simulations section</p>
              </div>
            ) : (
              <div className="space-y-3 overflow-y-auto flex-1 pr-2">
                {availableSimulations.map(sim => (
                  <button
                    key={sim.SimulationID}
                    onClick={() => {
                      setSelectedSimulation(sim);
                      setShowSimulationPicker(false);
                    }}
                    className={`w-full p-4 rounded-lg border-2 text-left transition-all hover:border-[#2BC4B3] hover:bg-[#f0faf9] ${
                      selectedSimulation?.SimulationID === sim.SimulationID
                        ? 'border-[#2BC4B3] bg-[#f0faf9]'
                        : 'border-gray-200'
                    }`}
                  >
                    <h3 className="font-bold text-[#1e5a8e] text-lg">{sim.SimulationTitle}</h3>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{sim.Description}</p>
                    <div className="flex gap-3 mt-2 flex-wrap">
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">Type: {sim.ActivityType}</span>
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">Max Score: {sim.MaxScore}</span>
                      {sim.TimeLimit > 0 && (
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">Time: {sim.TimeLimit}min</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* DnD Simulation Picker Modal (for review-drag-drop sections) */}
      {showDndSimPicker && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setShowDndSimPicker(false)}></div>
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl z-50 p-8 w-[520px] max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-[#1e5a8e]">Select Simulation</h2>
              <button onClick={() => setShowDndSimPicker(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {availableSimulations.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 text-lg">No simulations available</p>
                <p className="text-gray-400 text-sm mt-2">Create simulations first in the Simulations section</p>
              </div>
            ) : (
              <div className="space-y-3 overflow-y-auto flex-1 pr-2">
                {availableSimulations.map(sim => (
                  <button
                    key={sim.SimulationID}
                    onClick={() => {
                      if (dndPickerSectionId) handleSectionSimulationSelect(dndPickerSectionId, sim);
                      setShowDndSimPicker(false);
                      setDndPickerSectionId(null);
                    }}
                    className="w-full p-4 rounded-lg border-2 text-left transition-all hover:border-purple-400 hover:bg-purple-50 border-gray-200"
                  >
                    <h3 className="font-bold text-[#1e5a8e] text-lg">{sim.SimulationTitle}</h3>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{sim.Description}</p>
                    <div className="flex gap-3 mt-2 flex-wrap">
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">Type: {sim.ActivityType}</span>
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">Max Score: {sim.MaxScore}</span>
                      {sim.TimeLimit > 0 && (
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">Time: {sim.TimeLimit}min</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AddLesson;
