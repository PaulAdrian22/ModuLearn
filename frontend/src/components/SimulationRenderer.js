import React, { useEffect, useMemo, useRef, useState } from 'react';
import { API_SERVER_URL } from '../config/api';
import { composeScene, isDisassemblyActivity, normalizeZoomArea } from '../data/simulationActivities';

const REVEAL_DELAY_MS = 650;
const LAYER_ANIMATION_MS = 1200;

const layerAnimationStyle = (layer) => {
  const animation = String(layer?.animation || 'none').toLowerCase();
  if (animation === 'zoom-in') return { animation: 'simLayerZoomIn 1.2s ease-out forwards' };
  if (animation === 'zoom-out') return { animation: 'simLayerZoomOut 1.2s ease-out forwards' };
  if (animation === 'move-away-left') return { animation: 'simLayerMoveAwayLeft 1.2s ease-out forwards' };
  if (animation === 'move-away-right') return { animation: 'simLayerMoveAwayRight 1.2s ease-out forwards' };
  if (animation === 'wipe') return { animation: 'simLayerWipe 1.2s ease-out forwards' };
  return undefined;
};

export const simAssetUrl = (relativePath = '') => {
  if (!relativePath) return '';

  const raw = String(relativePath).trim();
  if (!raw) return '';
  if (/^(data:|blob:|https?:\/\/)/i.test(raw)) return raw;
  if (raw.startsWith(API_SERVER_URL)) return raw;
  if (raw.startsWith('/uploads/') || raw.startsWith('/sim-assets/')) return `${API_SERVER_URL}${raw}`;

  const normalized = raw.split('\\').join('/').replace(/^\/+/, '');
  const encoded = normalized.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  return `${API_SERVER_URL}/sim-assets/${encoded}`;
};

// Shared timeline renderer. Used by both the live learner activity and the
// admin editor's preview pane. Parent owns the progression state; this
// component just paints the current moment and emits a callback when the
// learner interacts with the focus part.
//
// Props:
//   config          — { meta, timeline }
//   currentIndex    — index into config.timeline
//   revealedIds     — Set of focus-layer ids that have been interacted with
//   onAdvance       — fn(layerId) called when learner completes an interaction
//                      (ignored in readOnly/preview mode)
//   readOnly        — when true, no hotspot is active; scene is shown as-is
//   showInstructions— whether to render the hotspot cue label
const SimulationRenderer = ({
  config,
  currentIndex = 0,
  revealedIds = new Set(),
  onAdvance,
  readOnly = false,
  showInstructions = true
}) => {
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [activeAnimationLayerId, setActiveAnimationLayerId] = useState('');
  const [hoveredLayerId, setHoveredLayerId] = useState('');
  const revealTimerRef = useRef(null);

  const timeline = useMemo(() => config?.timeline || [], [config]);
  const meta = useMemo(() => config?.meta || {}, [config]);
  const disassembly = isDisassemblyActivity(meta);

  const scene = useMemo(() => composeScene(timeline, currentIndex), [timeline, currentIndex]);
  const currentMoment = timeline[currentIndex] || null;

  useEffect(() => () => {
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
  }, []);

  useEffect(() => {
    setIsAdvancing(false);
    setActiveAnimationLayerId('');
    setHoveredLayerId('');
  }, [currentIndex]);

  const handleFocusClick = (layer) => {
    if (readOnly || !onAdvance) return;
    if (isAdvancing) return;
    setIsAdvancing(true);
    const layerAnimation = String(layer?.animation || 'none').toLowerCase();
    const hasLayerAnimation = layerAnimation !== 'none';

    if (hasLayerAnimation) {
      setActiveAnimationLayerId(layer.id);
    }

    revealTimerRef.current = setTimeout(() => {
      onAdvance(layer.id);
      setActiveAnimationLayerId('');
    }, hasLayerAnimation ? LAYER_ANIMATION_MS : REVEAL_DELAY_MS);
  };

  const focusLayers = scene.focusLayers;
  const hasFocus = focusLayers.length > 0;

  // For assembly/exploration activities, focus layers stay hidden until the
  // learner clicks the hotspot. For disassembly, they start visible and are
  // hidden once removed (matching the narrative of pulling a part out).
  const showFocusLayer = (layer) => {
    if (disassembly) return !revealedIds.has(layer.id);
    return revealedIds.has(layer.id);
  };

  const sceneHotspotsEnabled = !readOnly && !isAdvancing;
  const currentSceneLayers = currentMoment?.layers.filter((layer) => layer.kind === 'scene') || [];

  const hotspotBaseClass = 'absolute border-0 p-0 cursor-pointer focus:outline-none transition-all duration-150';
  const hotspotHoverClass = 'bg-emerald-400/10 ring-2 ring-emerald-400/80 shadow-[0_0_0_1px_rgba(16,185,129,0.22)]';

  return (
    <div
      className={`relative w-full aspect-[16/10] rounded-xl bg-[#f3f5f8] border-2 border-transparent overflow-hidden select-none transition-transform duration-500 ease-out ${
        'scale-100'
      }`}
    >
      {scene.backdrops.map((layer) => (
        <img
          key={`bg-${layer.id}`}
          src={simAssetUrl(layer.targetPath || layer.assetPath)}
          alt=""
          draggable={false}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          style={activeAnimationLayerId === layer.id ? layerAnimationStyle(layer) : undefined}
        />
      ))}

      {currentSceneLayers.map((layer) => {
        const clickArea = normalizeZoomArea(layer.clickArea);
        const zoomArea = normalizeZoomArea(layer.zoomArea);
        const hotspotArea = clickArea || zoomArea;
        if (!hotspotArea) return null;

        return (
          <React.Fragment key={`scene-${layer.id}`}>
            {sceneHotspotsEnabled && (
              <button
                type="button"
                onClick={() => handleFocusClick(layer)}
                onMouseEnter={() => setHoveredLayerId(layer.id)}
                onMouseLeave={() => setHoveredLayerId((previous) => (previous === layer.id ? '' : previous))}
                aria-label={`Interact with ${layer.label}`}
                className={`${hotspotBaseClass} ${hoveredLayerId === layer.id ? hotspotHoverClass : 'bg-transparent'}`}
                style={{
                  left: `${hotspotArea.x}%`,
                  top: `${hotspotArea.y}%`,
                  width: `${hotspotArea.width}%`,
                  height: `${hotspotArea.height}%`,
                }}
              />
            )}

            {readOnly && (
              <div
                className="absolute rounded-md border-2 border-emerald-400/80 bg-emerald-100/15 pointer-events-none"
                style={{
                  left: `${hotspotArea.x}%`,
                  top: `${hotspotArea.y}%`,
                  width: `${hotspotArea.width}%`,
                  height: `${hotspotArea.height}%`,
                }}
              />
            )}
          </React.Fragment>
        );
      })}

      {/* Previously-revealed focus layers from earlier moments in the same perspective */}
      {timeline.slice(0, currentIndex).map((moment) => {
        if (moment.perspective !== scene.perspective) return null;
        return moment.layers
          .filter((layer) => layer.kind === 'focus')
          .filter((layer) => (disassembly ? !revealedIds.has(layer.id) : revealedIds.has(layer.id)))
          .map((layer) => (
            <img
              key={`past-${layer.id}`}
              src={simAssetUrl(layer.targetPath || layer.assetPath)}
              alt={layer.label}
              draggable={false}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              style={activeAnimationLayerId === layer.id ? layerAnimationStyle(layer) : undefined}
            />
          ));
      })}

      {/* Current moment focus layers */}
      {focusLayers.map((layer) => {
        const visible = showFocusLayer(layer);
        if (!visible) return null;
        const isActive = !readOnly && !revealedIds.has(layer.id);
        const clickArea = normalizeZoomArea(layer.clickArea);
        const zoomArea = normalizeZoomArea(layer.zoomArea);
        const hotspotArea = clickArea || zoomArea;
        return (
          <React.Fragment key={`focus-${layer.id}`}>
            <img
              src={simAssetUrl(layer.targetPath || layer.assetPath)}
              alt={layer.label}
              draggable={false}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              style={activeAnimationLayerId === layer.id || readOnly || revealedIds.has(layer.id)
                ? layerAnimationStyle(layer)
                : undefined}
            />

            {isActive && !hotspotArea && (
              <button
                type="button"
                onClick={() => handleFocusClick(layer)}
                onMouseEnter={() => setHoveredLayerId(layer.id)}
                onMouseLeave={() => setHoveredLayerId((previous) => (previous === layer.id ? '' : previous))}
                aria-label={disassembly ? `Remove ${layer.label}` : `Reveal ${layer.label}`}
                className={`${hotspotBaseClass} inset-0 w-full h-full ${hoveredLayerId === layer.id ? hotspotHoverClass : 'bg-transparent'}`}
              />
            )}

            {isActive && hotspotArea && (
              <button
                type="button"
                onClick={() => handleFocusClick(layer)}
                onMouseEnter={() => setHoveredLayerId(layer.id)}
                onMouseLeave={() => setHoveredLayerId((previous) => (previous === layer.id ? '' : previous))}
                aria-label={`Interact with ${layer.label}`}
                className={`${hotspotBaseClass} ${hoveredLayerId === layer.id ? hotspotHoverClass : 'bg-transparent'}`}
                style={{
                  left: `${hotspotArea.x}%`,
                  top: `${hotspotArea.y}%`,
                  width: `${hotspotArea.width}%`,
                  height: `${hotspotArea.height}%`,
                }}
              />
            )}

            {readOnly && hotspotArea && (
              <div
                className="absolute rounded-md border-2 border-emerald-400/80 bg-emerald-100/15 pointer-events-none"
                style={{
                  left: `${hotspotArea.x}%`,
                  top: `${hotspotArea.y}%`,
                  width: `${hotspotArea.width}%`,
                  height: `${hotspotArea.height}%`,
                }}
              />
            )}
          </React.Fragment>
        );
      })}

      {/* No generic advance button - only click areas and zoom areas are interactive */}

      {/* Cue label overlay */}
      {showInstructions && currentMoment && !readOnly && (
        <div className="absolute top-3 right-3 z-10 px-3 py-1.5 rounded-full bg-[#0B2B4C]/90 text-white text-xs font-semibold shadow">
          {scene.perspective || scene.category} view · Step {currentIndex + 1} of {timeline.length}
        </div>
      )}

      <style>{`
        @keyframes simLayerZoomIn {
          from { transform: scale(1); }
          to { transform: scale(1.08); }
        }
        @keyframes simLayerZoomOut {
          from { transform: scale(1); }
          to { transform: scale(0.92); }
        }
        @keyframes simLayerMoveAwayLeft {
          from { transform: translateX(0) scale(1); opacity: 1; }
          to { transform: translateX(-150%) scale(0.9); opacity: 0; }
        }
        @keyframes simLayerMoveAwayRight {
          from { transform: translateX(0) scale(1); opacity: 1; }
          to { transform: translateX(150%) scale(0.9); opacity: 0; }
        }
        @keyframes simLayerWipe {
          from { clip-path: inset(0 100% 0 0); opacity: 0.3; }
          to { clip-path: inset(0 0 0 0); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default SimulationRenderer;
