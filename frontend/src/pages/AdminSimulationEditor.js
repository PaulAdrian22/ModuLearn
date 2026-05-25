import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../App';
import AdminNavbar from '../components/AdminNavbar';
import SimulationRenderer, { simAssetUrl } from '../components/SimulationRenderer';
import ImageCropper from '../components/ImageCropper';
import InteractiveZoomAreaEditor from '../components/InteractiveZoomAreaEditor';
import {
  DEFAULT_ZOOM_AREA,
  KNOWN_PERSPECTIVES,
  categoryForPerspective,
  normalizeConfig,
  normalizeZoomArea,
} from '../data/simulationActivities';
import { normalizeSimulationSkill } from '../utils/simulationFlow';
import { themedConfirm } from '../utils/themedConfirm';


const LAYER_ANIMATIONS = [
  { value: 'none', label: 'No Animation' },
  { value: 'zoom-in', label: 'Zoom In' },
  { value: 'zoom-out', label: 'Zoom Out' },
  { value: 'move-away-left', label: 'Move Away Left' },
  { value: 'move-away-right', label: 'Move Away Right' },
  { value: 'wipe', label: 'Wipe' },
];

const SKILL_TYPE_THEME = {
  Memorization: {
    solid: '#8AB4F8',
    soft: '#E8F0FE',
    text: '#2C5A9E'
  },
  'Analytical Thinking': {
    solid: '#FFB74D',
    soft: '#FFF3E0',
    text: '#8B5A15'
  },
  'Critical Thinking': {
    solid: '#EF5350',
    soft: '#FFEBEE',
    text: '#8C2C2A'
  },
  'Problem Solving': {
    solid: '#AB47BC',
    soft: '#F3E5F5',
    text: '#6A2D78'
  },
  'Technical Comprehension': {
    solid: '#4DD0E1',
    soft: '#E0F7FA',
    text: '#176A75'
  },
  'No Skill': {
    solid: '#6B7280',
    soft: '#F3F4F6',
    text: '#374151'
  }
};

const DOCX_SIMULATION_SKILL_MAP = {
  3: {
    1: 'Memorization',
    2: 'Technical Comprehension',
    3: 'Analytical Thinking',
    4: 'Problem Solving',
    5: 'Critical Thinking',
    6: 'Memorization',
    7: 'Technical Comprehension',
    8: 'Analytical Thinking',
    9: 'Problem Solving',
    10: 'Critical Thinking'
  },
  4: {
    1: 'Problem Solving',
    2: 'Critical Thinking',
    3: 'Analytical Thinking',
    4: 'Technical Comprehension',
    5: 'Memorization'
  }
};

const ACTIVITY_TYPE_THEME = {
  Disassembling: {
    label: 'Disassembling',
    tag: 'Drag components out',
    solid: '#E57373',
    soft: '#FDECEA',
    text: '#7A2E2E',
  },
  Assembling: {
    label: 'Assembling',
    tag: 'Drag components in',
    solid: '#66BB6A',
    soft: '#E8F5E9',
    text: '#1F5E29',
  },
  Troubleshooting: {
    label: 'Troubleshooting',
    tag: 'Identify faulty parts',
    solid: '#FFB74D',
    soft: '#FFF3E0',
    text: '#7A4A00',
  },
};

const getActivityType = (simulation = {}) => {
  const rawType = String(simulation?.ActivityType || '').trim().toLowerCase();
  if (rawType.includes('troubleshoot')) return 'Troubleshooting';
  if (rawType.includes('disassembl')) return 'Disassembling';
  if (rawType.includes('assembl')) return 'Assembling';

  const title = String(simulation?.SimulationTitle || '').toLowerCase();
  if (/^\s*installing\b/.test(title) || /\bassembl/.test(title)) return 'Assembling';
  return 'Disassembling';
};

const getSkillTheme = (rawSkillType) => {
  const normalizedSkillType = normalizeSimulationSkill(rawSkillType, 'Technical Comprehension');
  return {
    skillType: normalizedSkillType,
    ...(SKILL_TYPE_THEME[normalizedSkillType] || SKILL_TYPE_THEME['Technical Comprehension'])
  };
};

const getDocxSkillForSimulation = (simulation = {}) => {
  const moduleId = Number(simulation?.ModuleID || 0);
  const simulationOrder = Number(simulation?.SimulationOrder || 0);
  if (!moduleId || !simulationOrder) return '';

  return DOCX_SIMULATION_SKILL_MAP[moduleId]?.[simulationOrder] || '';
};

const ADMIN_ACCENT = '#3A70A1';

const uid = () => `id-${Math.random().toString(36).slice(2, 10)}`;

const compactZoomAreaForSave = (area) => {
  if (!area || typeof area !== 'object') return null;

  const x = Number(area.x);
  const y = Number(area.y);
  const width = Number(area.width);
  const height = Number(area.height);

  if (![x, y, width, height].every(Number.isFinite)) return null;

  return { x, y, width, height };
};

const compactLayerForSave = (layer) => {
  if (!layer || typeof layer !== 'object') return null;

  const assetPath = String(layer.assetPath || layer.targetPath || '').trim();
  if (!assetPath) return null;

  const targetPath = String(layer.targetPath || '').trim();
  // All layers are now treated as 'focus' (clickable). The difference is whether
  // they have correct/wrong click areas defined or not.
  const compacted = {
    id: String(layer.id || '').trim() || undefined,
    assetPath,
    kind: 'focus'
  };

  if (targetPath && targetPath !== assetPath) {
    compacted.targetPath = targetPath;
  }

  const group = String(layer.group || '').trim();
  if (group) compacted.group = group;

  const label = String(layer.label || '').trim();
  if (label) compacted.label = label;

  const animation = String(layer.animation || '').trim().toLowerCase();
  if (animation && animation !== 'none') {
    compacted.animation = animation;
  }

  const clickArea = compactZoomAreaForSave(layer.clickArea);
  if (clickArea) compacted.clickArea = clickArea;

  const zoomArea = compactZoomAreaForSave(layer.zoomArea);
  if (zoomArea) compacted.zoomArea = zoomArea;

  const wrongClickArea = compactZoomAreaForSave(layer.wrongClickArea);
  if (wrongClickArea) compacted.wrongClickArea = wrongClickArea;

  return compacted;
};

const compactConfigForSave = (config) => {
  const meta = config?.meta || {};
  const steps = Array.isArray(meta.steps)
    ? meta.steps.map((step) => String(step || '').trim()).filter(Boolean)
    : [];

  const timeline = Array.isArray(config?.timeline)
    ? config.timeline
        .map((moment, momentIdx) => {
          if (!moment || typeof moment !== 'object') return null;

          const layers = Array.isArray(moment.layers)
            ? moment.layers.map(compactLayerForSave).filter(Boolean)
            : [];

          if (layers.length === 0) return null;

          const order = Number(moment.order);
          return {
            id: String(moment.id || '').trim() || `moment-${Number.isFinite(order) && order > 0 ? order : momentIdx + 1}-${momentIdx}`,
            order: Number.isFinite(order) && order > 0 ? order : momentIdx + 1,
            perspective: String(moment.perspective || '').trim(),
            layers
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.order - b.order)
    : [];

  return {
    meta: {
      title: String(meta.title || '').trim(),
      description: String(meta.description || '').trim(),
      skill: String(meta.skill || '').trim(),
      ...(steps.length > 0 ? { steps } : {})
    },
    timeline
  };
};

const AdminSimulationEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');

  const [simulation, setSimulation] = useState(null);
  const [activityOrder, setActivityOrder] = useState(0);
  const [config, setConfig] = useState(null);
  const [lessons, setLessons] = useState([]);

  const [selectedMomentId, setSelectedMomentId] = useState(null);
  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const [editorImageBox, setEditorImageBox] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [editStage, setEditStage] = useState('overview');
  const [showCropper, setShowCropper] = useState(false);
  const [imageToCrop, setImageToCrop] = useState(null);
  const [cropTarget, setCropTarget] = useState(null);
  const [draggedMomentId, setDraggedMomentId] = useState(null);
  const [dragOverMomentId, setDragOverMomentId] = useState(null);

  useEffect(() => {
    if (user && user.role !== 'admin') {
      navigate('/dashboard');
      return;
    }

    const loadEditor = async () => {
      try {
        setLoading(true);
        setError('');

        const configResponse = await axios.get(`/admin/simulations/${id}`);

        const order = Number(configResponse?.data?.activityOrder || 0);
        const normalized = normalizeConfig(configResponse?.data?.config || {}, { activityOrder: order });

        setSimulation(configResponse?.data?.simulation || null);
        setActivityOrder(order);
        setConfig(normalized);
        setSelectedMomentId(normalized.timeline[0]?.id || null);
        setPreviewIndex(0);

        try {
          const lessonsResponse = await axios.get('/admin/modules');
          const seen = new Set();
          const uniqueLessons = (lessonsResponse?.data || [])
            .filter((m) => m.LessonOrder)
            .sort((a, b) => Number(a.LessonOrder) - Number(b.LessonOrder))
            .filter((m) => {
              const order = Number(m.LessonOrder);
              if (seen.has(order)) return false;
              seen.add(order);
              return true;
            });
          setLessons(uniqueLessons);
        } catch {
          // lessons dropdown is non-critical
        }
      } catch (loadError) {
        console.error('Failed to load simulation editor:', loadError);
        setError(loadError?.response?.data?.message || 'Failed to load simulation editor.');
      } finally {
        setLoading(false);
      }
    };

    loadEditor();
  }, [id, navigate, user]);

  useEffect(() => {
    if (!saveNotice) return undefined;
    const timer = window.setTimeout(() => setSaveNotice(''), 3000);
    return () => window.clearTimeout(timer);
  }, [saveNotice]);

  const selectedMoment = useMemo(() => {
    if (!config || !selectedMomentId) return null;
    return config.timeline.find((moment) => moment.id === selectedMomentId) || null;
  }, [config, selectedMomentId]);

  const selectedLayer = useMemo(() => {
    if (!selectedMoment || !selectedLayerId) return null;
    return selectedMoment.layers.find((layer) => layer.id === selectedLayerId) || null;
  }, [selectedMoment, selectedLayerId]);

  const previewRevealedIds = useMemo(() => {
    if (!config) return new Set();

    const revealed = new Set();
    config.timeline.slice(0, previewIndex).forEach((moment) => {
      moment.layers
        .filter((layer) => layer.kind === 'focus')
        .forEach((layer) => revealed.add(layer.id));
    });

    return revealed;
  }, [config, previewIndex]);

  useEffect(() => {
    if (!config) return;

    const hasSelectedMoment = config.timeline.some((moment) => moment.id === selectedMomentId);
    if (!hasSelectedMoment) {
      setSelectedMomentId(config.timeline[0]?.id || null);
    }

    if (previewIndex >= config.timeline.length) {
      setPreviewIndex(Math.max(0, config.timeline.length - 1));
    }
  }, [config, previewIndex, selectedMomentId]);

  useEffect(() => {
    if (!selectedMoment) {
      setSelectedLayerId(null);
      return;
    }

    const hasSelectedLayer = selectedMoment.layers.some((layer) => layer.id === selectedLayerId);
    if (!hasSelectedLayer) {
      setSelectedLayerId(selectedMoment.layers[0]?.id || null);
    }
  }, [selectedMoment, selectedLayerId]);

  const activityType = getActivityType(simulation);
  const activityTheme = ACTIVITY_TYPE_THEME[activityType] || ACTIVITY_TYPE_THEME.Disassembling;

  const updateMeta = (patch) => {
    setConfig((previous) => ({
      ...previous,
      meta: {
        ...previous.meta,
        ...patch,
      },
    }));
  };

  const updateActivityType = async (newType) => {
    setSimulation((previous) => (previous ? { ...previous, ActivityType: newType } : previous));
    try {
      await axios.patch(`/admin/simulations/${id}`, { ActivityType: newType });
    } catch (err) {
      console.error('Failed to update activity type:', err);
      setError(err?.response?.data?.message || 'Failed to update activity type');
    }
  };

  const persistSkillType = async (newSkill) => {
    try {
      await axios.patch(`/admin/simulations/${id}`, { SkillType: newSkill });
      setSimulation((previous) => (previous ? { ...previous, SkillType: newSkill } : previous));
    } catch (err) {
      console.error('Failed to update skill type:', err);
      setError(err?.response?.data?.message || 'Failed to update skill type');
    }
  };

  const updateLessonNumber = async (newLessonNumber) => {
    setSimulation((previous) => (previous ? { ...previous, LessonNumber: newLessonNumber } : previous));
    try {
      await axios.patch(`/admin/simulations/${id}`, { LessonNumber: newLessonNumber });
    } catch (err) {
      console.error('Failed to update lesson number:', err);
    }
  };

  const updateSkill = (newSkill) => {
    updateMeta({ skill: newSkill });
    persistSkillType(newSkill);
  };

  const addMoment = () => {
    setConfig((previous) => {
      const maxOrder = previous.timeline.reduce((max, moment) => Math.max(max, Number(moment.order) || 0), 0);
      const perspective = KNOWN_PERSPECTIVES[0] || 'Side View';
      const newMoment = {
        id: `moment-${uid()}`,
        order: maxOrder + 1,
        perspective,
        category: categoryForPerspective(perspective),
        layers: [],
      };

      setSelectedMomentId(newMoment.id);
      setPreviewIndex(previous.timeline.length);
      setEditStage('builder');

      return {
        ...previous,
        timeline: [...previous.timeline, newMoment],
      };
    });
  };

  const reorderMoments = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;

    setConfig((previous) => {
      const timelineCopy = [...previous.timeline];
      const fromIndex = timelineCopy.findIndex((moment) => moment.id === fromId);
      const toIndex = timelineCopy.findIndex((moment) => moment.id === toId);

      if (fromIndex < 0 || toIndex < 0) return previous;

      const [moved] = timelineCopy.splice(fromIndex, 1);
      timelineCopy.splice(toIndex, 0, moved);

      const normalizedTimeline = timelineCopy.map((moment, index) => ({
        ...moment,
        order: index + 1,
      }));

      const nextSelectedId = selectedMomentId || moved.id;
      const nextPreviewIndex = normalizedTimeline.findIndex((moment) => moment.id === nextSelectedId);
      setSelectedMomentId(nextSelectedId);
      setPreviewIndex(nextPreviewIndex >= 0 ? nextPreviewIndex : 0);

      return {
        ...previous,
        timeline: normalizedTimeline,
      };
    });
  };

  const removeMoment = (momentId) => {
    setConfig((previous) => {
      const filtered = previous.timeline
        .filter((moment) => moment.id !== momentId)
        .map((moment, index) => ({
          ...moment,
          order: index + 1,
        }));

      if (selectedMomentId === momentId) {
        setSelectedMomentId(filtered[0]?.id || null);
        setPreviewIndex(0);
      }

      return {
        ...previous,
        timeline: filtered,
      };
    });
  };

  const addLayer = (momentId) => {
    setConfig((previous) => ({
      ...previous,
      timeline: previous.timeline.map((moment) => {
        if (moment.id !== momentId) return moment;
        const newLayer = {
          id: `layer-${uid()}`,
          assetPath: '',
          targetPath: '',
          group: '',
          label: 'New layer',
          kind: 'focus',
          animation: 'none',
          clickArea: null,
          zoomArea: null,
        };

        setSelectedLayerId(newLayer.id);

        return {
          ...moment,
          layers: [...moment.layers, newLayer],
        };
      }),
    }));
  };

  const updateLayer = (momentId, layerId, patch) => {
    setConfig((previous) => ({
      ...previous,
      timeline: previous.timeline.map((moment) => {
        if (moment.id !== momentId) return moment;
        return {
          ...moment,
          layers: moment.layers.map((layer) => {
            if (layer.id !== layerId) return layer;
            return { ...layer, ...patch };
          }),
        };
      }),
    }));
  };

  const removeLayer = async (momentId, layerId) => {
    const shouldRemove = await themedConfirm({
      title: 'Delete Component?',
      message: 'This component will be removed from the selected step.',
      confirmText: 'Delete',
      cancelText: 'Keep',
      variant: 'danger',
    });

    if (!shouldRemove) return;

    setConfig((previous) => ({
      ...previous,
      timeline: previous.timeline.map((moment) => {
        if (moment.id !== momentId) return moment;
        return {
          ...moment,
          layers: moment.layers.filter((layer) => layer.id !== layerId),
        };
      }),
    }));
  };

  const handleSave = async () => {
    if (!config) return;

    try {
      setSaving(true);
      setError('');

      const savePayload = compactConfigForSave(config);
      const simPatch = {
        SimulationTitle: meta.title,
        Description: meta.description,
      };
      const saveResponse = await axios.put(`/admin/simulations/${id}`, { config: savePayload, simulation: simPatch });
      const normalized = normalizeConfig(saveResponse?.data?.config || {}, { activityOrder });

      setConfig(normalized);
      setSaveNotice('Simulation saved successfully.');
    } catch (saveError) {
      console.error('Failed to save simulation:', saveError);
      setError(saveError?.response?.data?.message || 'Failed to save simulation changes.');
    } finally {
      setSaving(false);
    }
  };

  const closeCropper = () => {
    setShowCropper(false);
    setImageToCrop(null);
    setCropTarget(null);
  };

  const openMainAreaImageEditor = () => {
    if (!selectedMoment || !selectedLayer) {
      setError('Select a component with an image first.');
      return;
    }

    const sourcePath = selectedLayer.targetPath || selectedLayer.assetPath;
    if (!sourcePath) {
      setError('Select a component with an image first.');
      return;
    }

    setError('');
    setImageToCrop(simAssetUrl(sourcePath));
    setCropTarget({ momentId: selectedMoment.id, layerId: selectedLayer.id });
    setShowCropper(true);
  };

  const blobToDataUrl = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleSaveCroppedImage = async (croppedImageBlob) => {
    if (!cropTarget) {
      closeCropper();
      return;
    }

    try {
      const dataUrl = await blobToDataUrl(croppedImageBlob);
      updateLayer(cropTarget.momentId, cropTarget.layerId, { targetPath: dataUrl });
      setSaveNotice('Image updated. Save simulation to keep this edit.');
    } catch (cropError) {
      console.error('Failed to process cropped image:', cropError);
      setError('Failed to apply cropped image.');
    } finally {
      closeCropper();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA]">
        <AdminNavbar />
        <div className="flex items-center justify-center h-[70vh]">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (error && !config) {
    return (
      <div className="min-h-screen bg-[#F5F7FA]">
        <AdminNavbar />
        <div className="max-w-2xl mx-auto px-6 pt-20">
          <div className="bg-white rounded-xl shadow-sm border border-amber-200 p-8">
            <h2 className="text-2xl font-bold text-[#0B2B4C] mb-2">Simulation editor unavailable</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <button
              type="button"
              onClick={() => navigate('/admin/simulations')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-lg font-semibold transition-all shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Simulations
            </button>
          </div>
        </div>
      </div>
    );
  }

  const meta = config?.meta || {
    title: '',
    description: '',
    skill: '',
    steps: [],
  };

  const timeline = config?.timeline || [];
  const mappedSkillType = getDocxSkillForSimulation(simulation);
  const displaySkillType = mappedSkillType || meta.skill;
  const skillTheme = getSkillTheme(displaySkillType);

  return (
    <div className="simulation-theme min-h-screen bg-[#F5F7FA]">
      <AdminNavbar />

      {saveNotice && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100]">
          <div
            className="text-white px-7 py-3 rounded-lg shadow-lg flex items-center gap-3"
            style={{ backgroundColor: '#16A34A' }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-semibold">{saveNotice}</span>
          </div>
        </div>
      )}

      <div className="w-full px-5 md:px-8 py-8 min-h-[calc(100vh-80px)] custom-scrollbar">
        <div className="flex items-start gap-4 mb-8">
          <button
            type="button"
            onClick={() => navigate('/admin/simulations')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-lg font-semibold transition-all shadow-sm"
            title="Exit Simulation Editing"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
            Exit Editing
          </button>

          <div>
            <h1 className="simulation-title text-4xl font-bold text-[#0B2B4C]">Edit Simulation</h1>
            <p className="text-gray-600 mt-1">Two-stage editing flow: details and preview, then main area + side panel.</p>
          </div>
        </div>

        <div className="simulation-surface bg-white rounded-2xl shadow-sm p-6 mb-6 border border-[#e4ebf2]" style={{ borderTop: `4px solid ${ADMIN_ACCENT}` }}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Simulation</p>
              <h2 className="text-2xl font-bold text-[#0B2B4C] mt-1">
                {simulation?.SimulationTitle || `Activity ${activityOrder}`}
              </h2>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <span
                  className="px-3 py-1 text-xs font-semibold rounded-full"
                  style={{ backgroundColor: activityTheme.soft, color: activityTheme.text }}
                >
                  Activity {activityOrder || '-'}
                </span>
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                  style={{
                    backgroundColor: activityTheme.soft,
                    color: activityTheme.text,
                    border: `1px solid ${activityTheme.solid}66`,
                  }}
                  title={activityTheme.tag}
                >
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: activityTheme.solid }}
                  />
                  {activityTheme.label}
                </span>
                <span
                  className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
                  style={{ backgroundColor: skillTheme.soft, color: skillTheme.text, border: `1px solid ${skillTheme.solid}40` }}
                >
                  Skill: {skillTheme.skillType}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 text-white rounded-lg font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ backgroundColor: ADMIN_ACCENT }}
            >
              {saving ? 'Saving...' : 'Save Simulation'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-700">
            {error}
          </div>
        )}

        <div className="mb-6 bg-white rounded-xl border border-[#e4ebf2] p-3 flex flex-wrap items-center gap-3">
          <StageButton
            active={editStage === 'overview'}
            number={1}
            title="Introduction, Details & Preview"
            subtitle="Meta, objective, and learner preview"
            accentColor={ADMIN_ACCENT}
            onClick={() => setEditStage('overview')}
          />
          <StageButton
            active={editStage === 'builder'}
            number={2}
            title="Main Area + Side Panel"
            subtitle="Select step and add components"
            accentColor={ADMIN_ACCENT}
            onClick={() => setEditStage('builder')}
          />
        </div>

        {editStage === 'overview' ? (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
            <div className="bg-white rounded-xl shadow-sm p-6 border border-[#e4ebf2]">
              <div className="mb-5">
                <h3 className="text-xl font-bold text-[#0B2B4C]">Introduction Details</h3>
                <p className="text-sm text-gray-600 mt-1">Configure title, description, skill, and instructions for learners.</p>
              </div>
              <SimulationInfoEditor
                meta={meta}
                onUpdateMeta={updateMeta}
                accentColor={ADMIN_ACCENT}
                activityType={simulation?.ActivityType || ''}
                onUpdateActivityType={updateActivityType}
                onUpdateSkill={updateSkill}
                lessonNumber={simulation?.LessonNumber ?? null}
                onUpdateLessonNumber={updateLessonNumber}
                lessons={lessons}
              />
            </div>

            <PreviewCard
              title="Preview"
              subtitle="Learner-facing preview for the selected step"
              config={config}
              timeline={timeline}
              previewIndex={previewIndex}
              onPreviewIndexChange={setPreviewIndex}
              previewRevealedIds={previewRevealedIds}
              accentColor={ADMIN_ACCENT}
              activityType={activityType}
              sticky
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_440px] gap-6">
            <div className="bg-white rounded-xl shadow-sm p-6 border border-[#e4ebf2]">
              <PreviewCard
                title="Main Area"
                subtitle="Preview canvas while you update components from the side panel"
                config={config}
                timeline={timeline}
                previewIndex={previewIndex}
                onPreviewIndexChange={setPreviewIndex}
                previewRevealedIds={previewRevealedIds}
                accentColor={ADMIN_ACCENT}
                activityType={activityType}
                selectedLayer={selectedLayer}
                onEditImage={openMainAreaImageEditor}
                onAddZoomArea={() => {
                  if (!selectedMoment || !selectedLayer) return;
                  updateLayer(selectedMoment.id, selectedLayer.id, { zoomArea: { ...DEFAULT_ZOOM_AREA } });
                }}
                onRemoveZoomArea={() => {
                  if (!selectedMoment || !selectedLayer) return;
                  updateLayer(selectedMoment.id, selectedLayer.id, { zoomArea: null });
                }}
                onUpdateZoomArea={(updatedZoomArea) => {
                  if (!selectedMoment || !selectedLayer) return;
                  updateLayer(selectedMoment.id, selectedLayer.id, { zoomArea: normalizeZoomArea(updatedZoomArea) });
                }}
                onUpdateClickArea={(updatedClickArea) => {
                  if (!selectedMoment || !selectedLayer) return;
                  updateLayer(selectedMoment.id, selectedLayer.id, { clickArea: normalizeZoomArea(updatedClickArea) });
                }}
                onUpdateWrongClickArea={(updatedWrongClickArea) => {
                  if (!selectedMoment || !selectedLayer) return;
                  updateLayer(selectedMoment.id, selectedLayer.id, { wrongClickArea: normalizeZoomArea(updatedWrongClickArea) });
                }}
                embedded
              />
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6 border border-[#e4ebf2] h-fit xl:sticky xl:top-6">
              <div className="mb-5">
                <h3 className="text-xl font-bold text-[#0B2B4C]">Side Panel</h3>
                <p className="text-sm text-gray-600 mt-1">Choose a step, then add or update its components.</p>
              </div>

              <div className="mb-5 rounded-lg border border-gray-200 p-3">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <p className="text-sm font-semibold text-[#0B2B4C]">Steps</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={addMoment}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-white rounded-md text-xs font-semibold"
                      style={{ backgroundColor: ADMIN_ACCENT }}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                      </svg>
                      Add Step
                    </button>
                    {selectedMoment && (
                      <button
                        type="button"
                        onClick={() => removeMoment(selectedMoment.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-white rounded-md text-xs font-semibold"
                        style={{ backgroundColor: '#DC2626' }}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                        </svg>
                        Delete Step
                      </button>
                    )}
                  </div>
                </div>

                {timeline.length === 0 ? (
                  <p className="text-sm text-gray-500">No steps yet. Add a step to start placing components.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {timeline.map((moment, index) => {
                      const active = moment.id === selectedMomentId;
                      const isDragged = moment.id === draggedMomentId;
                      const isDragOver = moment.id === dragOverMomentId;
                      return (
                        <button
                          key={moment.id}
                          type="button"
                          draggable={timeline.length > 1}
                          onClick={() => {
                            setSelectedMomentId(moment.id);
                            setPreviewIndex(index);
                          }}
                          onDragStart={() => {
                            setDraggedMomentId(moment.id);
                          }}
                          onDragOver={(event) => {
                            if (moment.id === draggedMomentId) return;
                            event.preventDefault();
                            setDragOverMomentId(moment.id);
                          }}
                          onDragLeave={() => {
                            setDragOverMomentId((current) => (current === moment.id ? null : current));
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            if (!draggedMomentId || draggedMomentId === moment.id) return;
                            reorderMoments(draggedMomentId, moment.id);
                            setDraggedMomentId(null);
                            setDragOverMomentId(null);
                          }}
                          onDragEnd={() => {
                            setDraggedMomentId(null);
                            setDragOverMomentId(null);
                          }}
                          className="px-3 py-1.5 rounded-md text-xs font-semibold border transition-all whitespace-nowrap"
                          style={active
                            ? {
                              backgroundColor: ADMIN_ACCENT,
                              color: '#fff',
                              borderColor: ADMIN_ACCENT,
                              transform: isDragged ? 'scale(0.98)' : undefined,
                              opacity: isDragged ? 0.7 : 1,
                            }
                            : {
                              backgroundColor: isDragOver ? '#EFF6FF' : '#fff',
                              color: '#4B5563',
                              borderColor: isDragOver ? ADMIN_ACCENT : '#D1D5DB',
                              transform: isDragged ? 'scale(0.98)' : undefined,
                              opacity: isDragged ? 0.7 : 1,
                            }}
                          title={timeline.length > 1 ? 'Drag to reorder steps' : undefined}
                        >
                          Step {index + 1}
                        </button>
                      );
                    })}
                  </div>
                )}

              </div>

              <MomentDetailEditor
                moment={selectedMoment}
                accentColor={ADMIN_ACCENT}
                selectedLayerId={selectedLayerId}
                onSelectLayer={setSelectedLayerId}
                onAddLayer={() => {
                  if (!selectedMoment) return;
                  addLayer(selectedMoment.id);
                }}
                onUpdateLayer={(layerId, patch) => {
                  if (!selectedMoment) return;
                  updateLayer(selectedMoment.id, layerId, patch);
                }}
                onRemoveLayer={(layerId) => {
                  if (!selectedMoment) return;
                  removeLayer(selectedMoment.id, layerId);
                }}
              />
            </div>
          </div>
        )}
      </div>

      {showCropper && imageToCrop && (
        <ImageCropper
          image={imageToCrop}
          title="Edit Simulation Image"
          cropShape="rect"
          aspect={16 / 10}
          aspectOptions={[
            { label: '16:10', value: 16 / 10 },
            { label: '4:3', value: 4 / 3 },
            { label: '1:1', value: 1 },
          ]}
          outputSize={1200}
          outputFileName="simulation-image-cropped.png"
          onSave={handleSaveCroppedImage}
          onClose={closeCropper}
        />
      )}
    </div>
  );
};

const StageButton = ({ active, number, title, subtitle, accentColor, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 min-w-[250px] text-left rounded-lg border p-3 transition-all"
      style={active
        ? {
          borderColor: accentColor,
          backgroundColor: `${accentColor}14`,
        }
        : {
          borderColor: '#E5E7EB',
          backgroundColor: '#fff',
        }}
    >
      <div className="flex items-start gap-3">
        <span
          className="w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center"
          style={active
            ? { backgroundColor: accentColor, color: '#fff' }
            : { backgroundColor: '#F3F4F6', color: '#4B5563' }}
        >
          {number}
        </span>
        <div>
          <p className="text-sm font-bold text-[#0B2B4C]">{title}</p>
          <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
        </div>
      </div>
    </button>
  );
};

const SimulationInfoEditor = ({ meta, onUpdateMeta, accentColor, activityType, onUpdateActivityType, onUpdateSkill, lessonNumber, onUpdateLessonNumber, lessons }) => {
  const titleRef = React.useRef(null);
  const stepsRef = React.useRef(null);
  const descriptionRef = React.useRef(null);
  const [activeTextarea, setActiveTextarea] = useState(null);

  // Extract text content from contentEditable, handling div wrappers created by Enter key
  const extractTextFromContentEditable = (html = '') => {
    if (!html) return '';
    // Remove <div> and </div> tags, replacing with newlines to preserve line structure
    return String(html)
      .replace(/<div>/gi, '')
      .replace(/<\/div>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/&nbsp;/g, ' ')
      .trim();
  };

  // Apply text formatting
  const applyTextFormat = (format) => {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const activeEl = document.activeElement;
    if (!activeEl || activeEl.contentEditable !== 'true') return;

    switch (format) {
      case 'bold':
        document.execCommand('bold', false, null);
        break;
      case 'italic':
        document.execCommand('italic', false, null);
        break;
      case 'underline':
        document.execCommand('underline', false, null);
        break;
      case 'bullet':
        document.execCommand('insertUnorderedList', false, null);
        break;
      case 'numbering':
        document.execCommand('insertOrderedList', false, null);
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
      case 'indent':
        document.execCommand('indent', false, null);
        break;
      case 'outdent':
        document.execCommand('outdent', false, null);
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

    activeEl.dispatchEvent(new Event('input', { bubbles: true }));
  };

  // Keep contentEditable elements in sync with state
  useEffect(() => {
    const titleEl = titleRef.current;
    if (titleEl && document.activeElement !== titleEl) {
      const targetText = meta.title || '';
      if (titleEl.innerHTML !== targetText) {
        titleEl.innerHTML = targetText;
      }
    }

    const descriptionEl = descriptionRef.current;
    if (descriptionEl && document.activeElement !== descriptionEl) {
      const targetText = meta.description || '';
      if (descriptionEl.innerHTML !== targetText) {
        descriptionEl.innerHTML = targetText;
      }
    }

    const stepsEl = stepsRef.current;
    if (stepsEl && document.activeElement !== stepsEl) {
      const targetText = (meta.steps || []).join('\n');
      const currentText = extractTextFromContentEditable(stepsEl.innerHTML || '');
      if (currentText !== targetText) {
        stepsEl.innerHTML = targetText;
      }
    }
  }, [meta.title, meta.description, meta.steps]);

  // Handle Tab key for indentation
  useEffect(() => {
    const handleTabKey = (e) => {
      if (e.key !== 'Tab') return;
      const el = e.target;
      if (!el || el.contentEditable !== 'true') return;

      const selection = window.getSelection();
      const anchorNode = selection?.anchorNode || null;
      const anchorElement = anchorNode
        ? (anchorNode.nodeType === Node.TEXT_NODE ? anchorNode.parentElement : anchorNode)
        : null;
      const activeListItem = anchorElement?.closest?.('li');

      if (activeListItem) {
        e.preventDefault();
        document.execCommand(e.shiftKey ? 'outdent' : 'indent', false, null);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }

      e.preventDefault();
      document.execCommand('insertText', false, '\t');
    };

    document.addEventListener('keydown', handleTabKey);
    return () => document.removeEventListener('keydown', handleTabKey);
  }, []);

  // Handle Undo/Redo
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
      if (key === 'z' && !e.shiftKey) {
        document.execCommand('undo', false);
      } else if (key === 'z' && e.shiftKey) {
        document.execCommand('redo', false);
      } else if (key === 'y') {
        document.execCommand('redo', false);
      }
    };

    document.addEventListener('keydown', handleUndoRedoKey);
    return () => document.removeEventListener('keydown', handleUndoRedoKey);
  }, []);

  // Close toolbar when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!activeTextarea) return;

      const isTextField = e.target.id && (
        e.target.id.startsWith('input-') ||
        e.target.id.startsWith('textarea-')
      );

      const isInsideContentEditable = e.target.closest('[contenteditable="true"]');
      const isToolbar = e.target.closest('.formatting-toolbar');

      if (!isTextField && !isInsideContentEditable && !isToolbar) {
        setActiveTextarea(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeTextarea]);

  return (
    <>
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
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 6h2" />
                <path d="M4 12h2" />
                <path d="M4 18h2" />
                <path d="M9 6h11" />
                <path d="M9 12h11" />
                <path d="M9 18h11" />
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

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-[#0B2B4C] mb-2">Activity Title</label>
          <div
            ref={titleRef}
            id="input-simulation-title"
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => {
              if (e.currentTarget) {
                const newValue = e.currentTarget.innerHTML || '';
                onUpdateMeta({ title: newValue });
              }
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#D1D5DB';
              if (e.currentTarget) {
                const newValue = e.currentTarget.innerHTML || '';
                onUpdateMeta({ title: newValue });
              }
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = accentColor;
              setActiveTextarea('input-simulation-title');
            }}
            data-placeholder="Example: Activity 1 - Identify Computer Parts"
            className="w-full min-h-[48px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none text-gray-900 empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
            style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-[#0B2B4C] mb-2">Activity Type</label>
          <select
            value={activityType || ''}
            onChange={(event) => onUpdateActivityType?.(event.target.value)}
            className="w-full h-[48px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none text-gray-900 bg-white"
            onFocus={(event) => { event.currentTarget.style.borderColor = accentColor; }}
            onBlur={(event) => { event.currentTarget.style.borderColor = '#D1D5DB'; }}
          >
            <option value="" disabled>Select an activity type</option>
            <option value="Assembling">Assembling</option>
            <option value="Disassembling">Disassembling</option>
            <option value="Troubleshooting">Troubleshooting</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-[#0B2B4C] mb-2">Found in Lesson</label>
          <select
            value={lessonNumber ?? ''}
            onChange={(event) => onUpdateLessonNumber?.(event.target.value === '' ? null : Number(event.target.value))}
            className="w-full h-[48px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none text-gray-900 bg-white"
            onFocus={(event) => { event.currentTarget.style.borderColor = accentColor; }}
            onBlur={(event) => { event.currentTarget.style.borderColor = '#D1D5DB'; }}
          >
            <option value="">— Not assigned to a lesson —</option>
            {(lessons || []).map((lesson) => (
              <option key={lesson.ModuleID} value={lesson.LessonOrder}>
                Lesson {lesson.LessonOrder}: {lesson.ModuleTitle}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-[#0B2B4C] mb-2">Description</label>
          <div
            ref={descriptionRef}
            id="input-simulation-description"
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => {
              if (e.currentTarget) {
                const newValue = e.currentTarget.innerHTML || '';
                onUpdateMeta({ description: newValue });
              }
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#D1D5DB';
              if (e.currentTarget) {
                const newValue = e.currentTarget.innerHTML || '';
                onUpdateMeta({ description: newValue });
              }
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = accentColor;
              setActiveTextarea('input-simulation-description');
            }}
            data-placeholder="Describe what learners should accomplish in this simulation."
            className="w-full min-h-[100px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none text-gray-900 empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
            style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-[#0B2B4C] mb-2">Skill / Objective</label>
          <select
            value={meta.skill || ''}
            onChange={(event) => (onUpdateSkill ? onUpdateSkill(event.target.value) : onUpdateMeta({ skill: event.target.value }))}
            className="w-full h-[48px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none text-gray-900 bg-white"
            onFocus={(event) => { event.currentTarget.style.borderColor = accentColor; }}
            onBlur={(event) => { event.currentTarget.style.borderColor = '#D1D5DB'; }}
          >
            <option value="" disabled>Select a skill</option>
            <option value="Memorization">Memorization</option>
            <option value="Analytical Thinking">Analytical Thinking</option>
            <option value="Critical Thinking">Critical Thinking</option>
            <option value="Problem Solving">Problem Solving</option>
            <option value="Technical Comprehension">Technical Comprehension</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-[#0B2B4C] mb-2">
            Instruction Steps
            <span className="ml-2 text-xs text-gray-500 font-normal">One step per line</span>
          </label>
          <div
            ref={stepsRef}
            id="textarea-simulation-steps"
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => {
              if (e.currentTarget) {
                const rawHtml = e.currentTarget.innerHTML || '';
                const textContent = extractTextFromContentEditable(rawHtml);
                const steps = textContent
                  .split('\n')
                  .map((step) => step.trim())
                  .filter(Boolean);
                onUpdateMeta({ steps });
              }
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#D1D5DB';
              if (e.currentTarget) {
                const rawHtml = e.currentTarget.innerHTML || '';
                const textContent = extractTextFromContentEditable(rawHtml);
                const steps = textContent
                  .split('\n')
                  .map((step) => step.trim())
                  .filter(Boolean);
                onUpdateMeta({ steps });
              }
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = accentColor;
              setActiveTextarea('textarea-simulation-steps');
            }}
            data-placeholder="Step 1: ...\nStep 2: ...\nStep 3: ..."
            className="w-full min-h-[200px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none text-gray-700 font-mono text-sm leading-5 empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
            style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
          />
        </div>
      </div>
    </>
  );
};

const MomentDetailEditor = ({
  moment,
  accentColor,
  selectedLayerId,
  onSelectLayer,
  onAddLayer,
  onUpdateLayer,
  onRemoveLayer,
}) => {
  if (!moment) {
    return (
      <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center">
        <p className="text-sm text-gray-500">Select a step to edit components.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-[#0B2B4C]">
          Components
          <span className="ml-2 text-xs text-gray-500 font-normal">{moment.layers.length} total</span>
        </h4>
        <button
          type="button"
          onClick={onAddLayer}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-white rounded-lg text-sm font-semibold transition-all"
          style={{ backgroundColor: accentColor }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Add Component
        </button>
      </div>

      {moment.layers.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center text-sm text-gray-500">
          No components yet. Add images and define correct/wrong click areas.
        </div>
      ) : (
        <div className="space-y-3 max-h-[58vh] overflow-y-auto pr-1">
          {moment.layers.map((layer, index) => (
            <LayerEditorCard
              key={layer.id}
              layer={layer}
              index={index}
              accentColor={accentColor}
              selected={layer.id === selectedLayerId}
              onSelect={() => onSelectLayer(layer.id)}
              onUpdate={(patch) => onUpdateLayer(layer.id, patch)}
              onRemove={() => onRemoveLayer(layer.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const LayerEditorCard = ({ layer, index, accentColor, selected, onSelect, onUpdate, onRemove }) => {
  const hasCorrectArea = !!normalizeZoomArea(layer.clickArea);
  const clickArea = useMemo(() => normalizeZoomArea(layer.clickArea), [layer.clickArea]);
  const wrongClickArea = useMemo(() => normalizeZoomArea(layer.wrongClickArea), [layer.wrongClickArea]);
  const zoomArea = useMemo(() => normalizeZoomArea(layer.zoomArea), [layer.zoomArea]);
  const canUseZoomArea = true;
  const fileInputRef = React.useRef(null);

  const handleImageImport = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const fallbackLabel = file.name.replace(/\.[^/.]+$/, '');
      onUpdate({
        assetPath: result,
        targetPath: result,
        label: layer.label && layer.label !== 'New layer' ? layer.label : (fallbackLabel || 'Imported image'),
      });
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  return (
    <div
      onClick={onSelect}
      className="bg-white border-2 rounded-lg p-4 transition-all duration-200 cursor-pointer"
      style={selected
        ? { borderColor: `${accentColor}99`, boxShadow: `0 0 0 1px ${accentColor}33` }
        : { borderColor: '#E5E7EB' }}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <p className="text-xs text-gray-500">Component {index + 1}</p>
          <p className="text-sm font-semibold text-[#0B2B4C]">
            {hasCorrectArea ? 'Interactive Component' : 'Component (no interaction)'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageImport}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1.5 text-xs rounded-md font-semibold text-white"
            style={{ backgroundColor: accentColor }}
          >
            Add Image
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="px-2.5 py-1.5 text-xs rounded-md font-semibold text-gray-700 border border-gray-300 hover:bg-gray-100"
          >
            Remove
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[100px_minmax(0,1fr)] gap-4">
        <div className="space-y-2">
          <div className="w-[100px] h-[100px] border border-gray-200 rounded-lg bg-gray-50 overflow-hidden flex items-center justify-center">
            {layer.assetPath ? (
              <img
                src={simAssetUrl(layer.targetPath || layer.assetPath)}
                alt={layer.label || `Layer ${index + 1}`}
                className="w-full h-full object-contain"
              />
            ) : (
              <span className="text-[11px] text-gray-400 text-center px-2">No image</span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] text-gray-400 italic">
              Only components with a correct area are interactable. Add correct/wrong areas below to define interactions.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-[#0B2B4C] mb-1.5">Animation</label>
            <select
              value={layer.animation || 'none'}
              onChange={(event) => onUpdate({ animation: event.target.value })}
              className="w-full h-[42px] px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none text-sm bg-white"
              onFocus={(event) => { event.currentTarget.style.borderColor = accentColor; }}
              onBlur={(event) => { event.currentTarget.style.borderColor = '#D1D5DB'; }}
            >
              {LAYER_ANIMATIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#0B2B4C] mb-1.5">Label</label>
            <input
              type="text"
              value={layer.label}
              onChange={(event) => onUpdate({ label: event.target.value })}
              className="w-full h-[42px] px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none text-sm"
              onFocus={(event) => { event.currentTarget.style.borderColor = accentColor; }}
              onBlur={(event) => { event.currentTarget.style.borderColor = '#D1D5DB'; }}
              placeholder="Part name"
            />
          </div>

          {canUseZoomArea && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {!clickArea ? (
                  <button
                    type="button"
                    onClick={() => onUpdate({ clickArea: { ...DEFAULT_ZOOM_AREA } })}
                    className="px-2.5 py-1 text-[11px] rounded-md text-white font-semibold flex items-center gap-1"
                    style={{ backgroundColor: '#16A34A' }}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    Correct Area
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onUpdate({ clickArea: null })}
                    className="px-2.5 py-1 text-[11px] rounded-md font-semibold border flex items-center gap-1"
                    style={{ backgroundColor: '#DCFCE7', color: '#166534', borderColor: '#86EFAC' }}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    Remove Correct
                  </button>
                )}
              </div>
              {clickArea && (
                <p className="text-[11px] text-gray-500">
                  Drag and resize the correct area directly on the Main Area preview. Any interaction outside this area will deduct points.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const PreviewCard = ({
  title,
  subtitle,
  config,
  timeline,
  previewIndex,
  onPreviewIndexChange,
  previewRevealedIds,
  accentColor,
  activityType,
  selectedLayer,
  onEditImage,
  onAddZoomArea,
  onRemoveZoomArea,
  onUpdateZoomArea,
  onUpdateClickArea,
  onUpdateWrongClickArea,
  sticky = false,
  embedded = false,
}) => {
  const canGoBack = previewIndex > 0;
  const canGoNext = previewIndex < timeline.length - 1;
  const [editorImageBox, setEditorImageBox] = useState(null);
  const selectedClickArea = useMemo(() => normalizeZoomArea(selectedLayer?.clickArea), [selectedLayer?.clickArea]);
  const selectedWrongClickArea = useMemo(() => normalizeZoomArea(selectedLayer?.wrongClickArea), [selectedLayer?.wrongClickArea]);
  const selectedZoomArea = useMemo(() => normalizeZoomArea(selectedLayer?.zoomArea), [selectedLayer?.zoomArea]);

  // Build canvas overlay for area editors when in embedded mode
  const canvasOverlay = useMemo(() => {
    if (!embedded || !editorImageBox) return null;

    const overlays = [];

    if (selectedLayer && selectedZoomArea) {
      overlays.push(
        <div
          key="zoom-overlay"
          className="absolute z-10"
          style={{
            left: `${editorImageBox.x}%`, top: `${editorImageBox.y}%`,
            width: `${editorImageBox.width}%`, height: `${editorImageBox.height}%`,
          }}
        >
          <InteractiveZoomAreaEditor
            zoomArea={selectedZoomArea}
            onChange={onUpdateZoomArea}
            showInputs={false}
            showCanvasChrome={false}
            containerClassName="h-full"
            centerLabel="Drag or resize"
          />
        </div>
      );
    }

    if (selectedLayer && selectedClickArea) {
      overlays.push(
        <div
          key="click-overlay"
          className="absolute z-20"
          style={{
            left: `${editorImageBox.x}%`, top: `${editorImageBox.y}%`,
            width: `${editorImageBox.width}%`, height: `${editorImageBox.height}%`,
          }}
        >
          <InteractiveZoomAreaEditor
            zoomArea={selectedClickArea}
            onChange={onUpdateClickArea}
            showInputs={false}
            showCanvasChrome={false}
            containerClassName="h-full"
            centerLabel="✓ Correct area"
            colorTheme="click"
          />
        </div>
      );
    }

    return overlays.length > 0 ? overlays : null;
  }, [embedded, editorImageBox, selectedLayer, selectedZoomArea, selectedClickArea, onUpdateZoomArea, onUpdateClickArea]);

  const content = (
    <>
      {!embedded && (
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-[#0B2B4C]">{title}</h3>
            <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPreviewIndexChange(Math.max(0, previewIndex - 1))}
              disabled={!canGoBack}
              className="w-8 h-8 rounded-lg border text-gray-600 hover:text-[#0B2B4C] disabled:opacity-40"
              style={{ borderColor: '#D1D5DB' }}
              aria-label="Preview previous step"
            >
              {'<'}
            </button>
            <button
              type="button"
              onClick={() => onPreviewIndexChange(Math.min(timeline.length - 1, previewIndex + 1))}
              disabled={!canGoNext}
              className="w-8 h-8 rounded-lg border text-gray-600 hover:text-[#0B2B4C] disabled:opacity-40"
              style={{ borderColor: '#D1D5DB' }}
              aria-label="Preview next step"
            >
              {'>'}
            </button>
          </div>
        </div>
      )}

      {timeline.length > 0 && config ? (
        <>
          <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-[#f9fbfd]">
            <SimulationRenderer
              config={config}
              currentIndex={previewIndex}
              revealedIds={previewRevealedIds}
              readOnly
              showInstructions
              disassembly={activityType === 'Disassembling' || activityType === 'Troubleshooting'}
              assembling={activityType === 'Assembling'}
              assemblingAnchor="background"
              onImageBoxChange={setEditorImageBox}
              canvasOverlay={canvasOverlay}
            />

            {embedded && (
              <div className="absolute top-3 right-3 z-30 pointer-events-auto">
                <button
                  type="button"
                  onClick={onEditImage}
                  disabled={!selectedLayer}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold text-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ backgroundColor: accentColor }}
                >
                  Crop / Edit
                </button>
              </div>
            )}
          </div>

          {!embedded && timeline[previewIndex] && (
            <div className="mt-3 text-xs text-gray-600 space-y-1">
              <p>
                <span className="font-semibold text-[#0B2B4C]">Perspective:</span>{' '}
                {timeline[previewIndex].perspective}
              </p>
              <p>
                <span className="font-semibold text-[#0B2B4C]">Clickable Layers:</span>{' '}
                {timeline[previewIndex].layers.filter((layer) => layer.kind === 'focus').length}
              </p>
              <p>
                <span className="font-semibold text-[#0B2B4C]">Background Layers:</span>{' '}
                {timeline[previewIndex].layers.filter((layer) => layer.kind === 'scene').length}
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center text-sm text-gray-500">
          Add steps from the side panel to preview the simulation.
        </div>
      )}
    </>
  );

  if (embedded) return content;

  return (
    <div
      className={`bg-white rounded-xl shadow-sm p-6 border border-[#e4ebf2] h-fit ${sticky ? 'xl:sticky xl:top-6' : ''}`}
      style={{ boxShadow: `0 1px 2px 0 ${accentColor}10` }}
    >
      {content}
    </div>
  );
};

export default AdminSimulationEditor;
