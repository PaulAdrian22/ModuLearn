import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../App';
import { adminApi } from '../services/api';
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

const LAYER_KINDS = [
  { value: 'scene', label: 'Background' },
  { value: 'focus', label: 'Clickable Part' },
];

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
};

const getActivityType = (simulation = {}) => {
  const rawType = String(simulation?.ActivityType || '').trim().toLowerCase();
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

const uid = () => `id-${Math.random().toString(36).slice(2, 10)}`;

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

  const [selectedMomentId, setSelectedMomentId] = useState(null);
  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [editStage, setEditStage] = useState('overview');
  const [showCropper, setShowCropper] = useState(false);
  const [imageToCrop, setImageToCrop] = useState(null);
  const [cropTarget, setCropTarget] = useState(null);

  useEffect(() => {
    if (user && user.role !== 'admin') {
      navigate('/dashboard');
      return;
    }

    const loadEditor = async () => {
      try {
        setLoading(true);
        setError('');

        const sim = await adminApi.simulations.get(id);
        const order = Number(sim?.simulation_order || sim?.SimulationOrder || 0);
        const rawConfig = sim?.zone_data ?? sim?.ZoneData ?? {};
        const parsed = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig;
        const normalized = normalizeConfig(parsed || {}, { activityOrder: order });

        setSimulation(sim || null);
        setActivityOrder(order);
        setConfig(normalized);
        setSelectedMomentId(normalized.timeline[0]?.id || null);
        setPreviewIndex(0);
      } catch (loadError) {
        console.error('Failed to load simulation editor:', loadError);
        setError(loadError?.message || 'Failed to load simulation editor.');
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

  const removeMoment = async (momentId) => {
    const shouldRemove = await themedConfirm({
      title: 'Delete Step?',
      message: 'This step and all of its components will be removed.',
      confirmText: 'Delete',
      cancelText: 'Keep',
      variant: 'danger',
    });

    if (!shouldRemove) return;

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

      // Debug: Log what we're sending
      console.log('=== SAVING SIMULATION CONFIG ===');
      console.log('Full config being sent:', config);
      console.log('Timeline:', config.timeline);
      config.timeline.forEach((moment, momentIdx) => {
        console.log(`  Moment ${momentIdx} (${moment.id}):`, moment);
        moment.layers.forEach((layer, layerIdx) => {
          console.log(`    Layer ${layerIdx} (${layer.id}):`, {
            assetPath: layer.assetPath,
            label: layer.label,
            kind: layer.kind,
            animation: layer.animation,
            clickArea: layer.clickArea,
            zoomArea: layer.zoomArea
          });
        });
      });

      // Persist the config blob into simulations.zone_data jsonb directly.
      const saved = await adminApi.simulations.update(id, { zone_data: config });
      const rawConfig = saved?.zone_data ?? saved?.ZoneData ?? {};
      const parsed = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig;
      const normalized = normalizeConfig(parsed || {}, { activityOrder });

      setConfig(normalized);
      setSaveNotice('Simulation saved successfully.');
    } catch (saveError) {
      console.error('Failed to save simulation:', saveError);
      setError(saveError?.message || 'Failed to save simulation changes.');
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
            style={{ backgroundColor: activityTheme.solid }}
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

        <div className="simulation-surface bg-white rounded-2xl shadow-sm p-6 mb-6 border border-[#e4ebf2]" style={{ borderTop: `4px solid ${skillTheme.solid}` }}>
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
              style={{ backgroundColor: skillTheme.solid }}
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
            accentColor={activityTheme.solid}
            onClick={() => setEditStage('overview')}
          />
          <StageButton
            active={editStage === 'builder'}
            number={2}
            title="Main Area + Side Panel"
            subtitle="Select step and add components"
            accentColor={activityTheme.solid}
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
              <SimulationInfoEditor meta={meta} onUpdateMeta={updateMeta} accentColor={activityTheme.solid} />
            </div>

            <PreviewCard
              title="Preview"
              subtitle="Learner-facing preview for the selected step"
              config={config}
              timeline={timeline}
              previewIndex={previewIndex}
              onPreviewIndexChange={setPreviewIndex}
              previewRevealedIds={previewRevealedIds}
              accentColor={activityTheme.solid}
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
                accentColor={activityTheme.solid}
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
                  <button
                    type="button"
                    onClick={addMoment}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-white rounded-md text-xs font-semibold"
                    style={{ backgroundColor: activityTheme.solid }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Step
                  </button>
                </div>

                {timeline.length === 0 ? (
                  <p className="text-sm text-gray-500">No steps yet. Add a step to start placing components.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {timeline.map((moment, index) => {
                      const active = moment.id === selectedMomentId;
                      return (
                        <button
                          key={moment.id}
                          type="button"
                          onClick={() => {
                            setSelectedMomentId(moment.id);
                            setPreviewIndex(index);
                          }}
                          className="px-3 py-1.5 rounded-md text-xs font-semibold border transition-all"
                          style={active
                            ? {
                              backgroundColor: activityTheme.solid,
                              color: '#fff',
                              borderColor: activityTheme.solid,
                            }
                            : {
                              backgroundColor: '#fff',
                              color: '#4B5563',
                              borderColor: '#D1D5DB',
                            }}
                        >
                          Step {index + 1}
                        </button>
                      );
                    })}
                  </div>
                )}

                {selectedMoment && timeline.length > 0 && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => removeMoment(selectedMoment.id)}
                      className="px-2.5 py-1 text-xs border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100"
                    >
                      Delete Selected Step
                    </button>
                  </div>
                )}
              </div>

              <MomentDetailEditor
                moment={selectedMoment}
                accentColor={activityTheme.solid}
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

const SimulationInfoEditor = ({ meta, onUpdateMeta, accentColor }) => {
  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-semibold text-[#0B2B4C] mb-2">Activity Title</label>
        <input
          type="text"
          value={meta.title}
          onChange={(event) => onUpdateMeta({ title: event.target.value })}
          className="w-full h-[48px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none text-gray-900"
          style={{ '--focus-border': accentColor }}
          onFocus={(event) => { event.currentTarget.style.borderColor = accentColor; }}
          onBlur={(event) => { event.currentTarget.style.borderColor = '#D1D5DB'; }}
          placeholder="Example: Activity 1 - Identify Computer Parts"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-[#0B2B4C] mb-2">Description</label>
        <textarea
          rows={4}
          value={meta.description}
          onChange={(event) => onUpdateMeta({ description: event.target.value })}
          className="w-full min-h-[100px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none text-gray-900"
          onFocus={(event) => { event.currentTarget.style.borderColor = accentColor; }}
          onBlur={(event) => { event.currentTarget.style.borderColor = '#D1D5DB'; }}
          placeholder="Describe what learners should accomplish in this simulation."
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-[#0B2B4C] mb-2">Skill / Objective</label>
        <input
          type="text"
          value={meta.skill}
          onChange={(event) => onUpdateMeta({ skill: event.target.value })}
          className="w-full h-[48px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none text-gray-900"
          onFocus={(event) => { event.currentTarget.style.borderColor = accentColor; }}
          onBlur={(event) => { event.currentTarget.style.borderColor = '#D1D5DB'; }}
          placeholder="Example: Technical Comprehension"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-[#0B2B4C] mb-2">
          Instruction Steps
          <span className="ml-2 text-xs text-gray-500 font-normal">One step per line</span>
        </label>
        <textarea
          rows={10}
          value={(meta.steps || []).join('\n')}
          onChange={(event) => {
            const steps = event.target.value
              .split('\n')
              .map((step) => step.trim())
              .filter(Boolean);
            onUpdateMeta({ steps });
          }}
          className="w-full h-48 px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none text-gray-700 font-mono text-sm leading-5 resize-none"
          onFocus={(event) => { event.currentTarget.style.borderColor = accentColor; }}
          onBlur={(event) => { event.currentTarget.style.borderColor = '#D1D5DB'; }}
          placeholder={'Step 1: ...\nStep 2: ...\nStep 3: ...'}
        />
      </div>
    </div>
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
          No components yet. Add a background or a clickable part.
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
  const kindLabel = layer.kind === 'scene' ? 'Background' : 'Clickable Part';
  const clickArea = useMemo(() => normalizeZoomArea(layer.clickArea), [layer.clickArea]);
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
          <p className="text-sm font-semibold text-[#0B2B4C]">{kindLabel}</p>
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
            {LAYER_KINDS.map((kind) => {
              const active = layer.kind === kind.value;
              return (
                <button
                  key={kind.value}
                  type="button"
                  onClick={() => onUpdate({ kind: kind.value })}
                  className="w-full px-2 py-1.5 text-[11px] rounded-md font-semibold transition-all border"
                  style={active
                    ? {
                      backgroundColor: `${accentColor}22`,
                      color: accentColor,
                      borderColor: `${accentColor}66`,
                    }
                    : {
                      backgroundColor: '#F3F4F6',
                      color: '#4B5563',
                      borderColor: '#E5E7EB',
                    }}
                >
                  {kind.label}
                </button>
              );
            })}
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
            <div className="space-y-3">
              <div className="flex items-center justify-end gap-2">
                {!clickArea ? (
                  <button
                    type="button"
                    onClick={() => onUpdate({ clickArea: { ...DEFAULT_ZOOM_AREA } })}
                    className="px-2.5 py-1 text-[11px] rounded-md text-white font-semibold"
                    style={{ backgroundColor: accentColor }}
                  >
                    Add Click Area
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onUpdate({ clickArea: null })}
                    className="px-2.5 py-1 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100 font-semibold"
                  >
                    Remove Click
                  </button>
                )}
              </div>

              {clickArea && (
                <p className="text-[11px] text-gray-500">
                  Drag and resize this click area directly on the Main Area preview.
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
  selectedLayer,
  onEditImage,
  onAddZoomArea,
  onRemoveZoomArea,
  onUpdateZoomArea,
  onUpdateClickArea,
  sticky = false,
  embedded = false,
}) => {
  const canGoBack = previewIndex > 0;
  const canGoNext = previewIndex < timeline.length - 1;
  const selectedClickArea = useMemo(() => normalizeZoomArea(selectedLayer?.clickArea), [selectedLayer?.clickArea]);
  const selectedZoomArea = useMemo(() => normalizeZoomArea(selectedLayer?.zoomArea), [selectedLayer?.zoomArea]);

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
            <span className="text-sm font-semibold text-[#0B2B4C] min-w-[68px] text-center">
              {timeline.length > 0 ? `${previewIndex + 1} / ${timeline.length}` : '0 / 0'}
            </span>
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

            {embedded && selectedLayer && selectedZoomArea && (
              <div className="absolute inset-0 z-10">
                <InteractiveZoomAreaEditor
                  zoomArea={selectedZoomArea}
                  onChange={onUpdateZoomArea}
                  showInputs={false}
                  showCanvasChrome={false}
                  containerClassName="h-full"
                  centerLabel="Drag or resize"
                />
              </div>
            )}

            {embedded && selectedLayer && selectedClickArea && (
              <div className="absolute inset-0 z-20">
                <InteractiveZoomAreaEditor
                  zoomArea={selectedClickArea}
                  onChange={onUpdateClickArea}
                  showInputs={false}
                  showCanvasChrome={false}
                  containerClassName="h-full"
                  centerLabel="Drag click area"
                  colorTheme="click"
                />
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
