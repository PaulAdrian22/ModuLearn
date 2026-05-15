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

// Shared timeline renderer used by both the learner activity and the admin preview.
// Parent owns progression state; this component paints the current moment and emits
// callbacks when the learner interacts with focus layers.
//
// Props:
//   config           — { meta, timeline }
//   currentIndex     — index into config.timeline
//   revealedIds      — Set of focus-layer ids that have been interacted with
//   onAdvance        — fn(layerId) called when learner completes an interaction
//   onWrongClick     — fn() called on a wrong-area click/drop
//   readOnly         — when true, no hotspots active; used by admin editor preview
//   showInstructions — whether to render the step cue label
//   assembling       — when true, focus layers move to a side tray and the learner
//                      drag-and-drops them onto their target zones on the canvas
const SimulationRenderer = ({
  config,
  currentIndex = 0,
  revealedIds = new Set(),
  onAdvance,
  onWrongClick,
  readOnly = false,
  showInstructions = true,
  assembling = false,
  disassembly: disassemblyProp,
  canvasOverlay = null,
}) => {
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [activeAnimationLayerId, setActiveAnimationLayerId] = useState('');
  const [hoveredLayerId, setHoveredLayerId] = useState('');
  const [draggingLayerId, setDraggingLayerId] = useState(null);
  const [dragOverZoneId, setDragOverZoneId] = useState(null);
  const revealTimerRef = useRef(null);

  const timeline = useMemo(() => config?.timeline || [], [config]);
  const meta = useMemo(() => config?.meta || {}, [config]);
  // Prefer the explicit prop (driven by ActivityType DB field) over the title-based inference.
  const disassembly = disassemblyProp !== undefined ? disassemblyProp : isDisassemblyActivity(meta);

  const scene = useMemo(() => composeScene(timeline, currentIndex), [timeline, currentIndex]);
  const currentMoment = timeline[currentIndex] || null;

  // Editor preview shows only the current step's scene layers as backdrop so each
  // step is self-contained. Learner mode accumulates scene layers across same-perspective
  // steps so the background builds up progressively.
  const backdrops = useMemo(() => {
    if (readOnly && currentMoment) {
      return currentMoment.layers.filter((l) => l.kind === 'scene');
    }
    return scene.backdrops;
  }, [readOnly, currentMoment, scene.backdrops]);

  useEffect(() => () => {
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
  }, []);

  useEffect(() => {
    setIsAdvancing(false);
    setActiveAnimationLayerId('');
    setHoveredLayerId('');
    setDraggingLayerId(null);
    setDragOverZoneId(null);
  }, [currentIndex]);

  const handleWrongClick = () => {
    if (readOnly || isAdvancing) return;
    if (onWrongClick) onWrongClick();
  };

  const handleFocusClick = (layer) => {
    if (readOnly || !onAdvance) return;
    if (isAdvancing) return;
    setIsAdvancing(true);
    const layerAnimation = String(layer?.animation || 'none').toLowerCase();
    const hasLayerAnimation = layerAnimation !== 'none';
    // In assembling mode always set the active id so the placed image appears
    // immediately at the target zone even when no animation is configured.
    if (hasLayerAnimation || assembling) setActiveAnimationLayerId(layer.id);
    revealTimerRef.current = setTimeout(() => {
      onAdvance(layer.id);
      setActiveAnimationLayerId('');
      setIsAdvancing(false);
    }, hasLayerAnimation ? LAYER_ANIMATION_MS : REVEAL_DELAY_MS);
  };

  // Called when a tray item is dropped onto a canvas zone.
  const handleDrop = (targetLayer) => {
    setDragOverZoneId(null);
    if (!draggingLayerId) return;
    if (draggingLayerId === targetLayer.id) {
      handleFocusClick(targetLayer);
    } else if (onWrongClick) {
      onWrongClick();
    }
    setDraggingLayerId(null);
  };

  const focusLayers = scene.focusLayers;

  // Assembling: hidden until correctly dropped (or animating into place).
  // Disassembly: visible until removed.
  // Exploration: hidden until clicked.
  const showFocusLayer = (layer) => {
    if (readOnly) return true;
    if (assembling) {
      // Show during the snap-in animation even before revealedIds is updated.
      return revealedIds.has(layer.id) || activeAnimationLayerId === layer.id;
    }
    if (disassembly) return !revealedIds.has(layer.id);
    return revealedIds.has(layer.id);
  };

  // Suppress scene layer hotspot buttons while any focus layer is still unrevealed —
  // they would intercept clicks meant for focus layers and block them via isAdvancing.
  const unrevealedFocusCount = focusLayers.filter((l) => !revealedIds.has(l.id)).length;
  const sceneHotspotsEnabled = !readOnly && !isAdvancing && unrevealedFocusCount === 0;
  const currentSceneLayers = currentMoment?.layers.filter((layer) => layer.kind === 'scene') || [];

  // Parts that still need to be placed in assembling mode.
  // Exclude the layer currently animating into place so it doesn't flicker in both tray and canvas.
  const unplacedFocusLayers = assembling && !readOnly
    ? focusLayers.filter((l) => !revealedIds.has(l.id) && activeAnimationLayerId !== l.id)
    : [];

  const hotspotBaseClass = 'absolute border-0 p-0 cursor-pointer focus:outline-none transition-all duration-150';
  const hotspotHoverClass = 'bg-emerald-400/10 ring-2 ring-emerald-400/80 shadow-[0_0_0_1px_rgba(16,185,129,0.22)]';

  return (
    <div className="w-full">
      {/* ── Main canvas ── */}
      <div
        className="relative w-full max-w-full mx-auto aspect-[16/10] max-h-[55vh] sm:max-h-[65vh] lg:max-h-none rounded-xl bg-[#f3f5f8] border-2 border-transparent overflow-hidden select-none transition-transform duration-500 ease-out scale-100"
        onDragOver={assembling && !readOnly ? (e) => e.preventDefault() : undefined}
        onDrop={assembling && !readOnly ? (e) => {
          e.preventDefault();
          if (!draggingLayerId) return;
          // Canvas-level drop: only place parts that have no specific target zone
          // (zoned layers are handled by their zone div's onDrop + stopPropagation).
          const layer = focusLayers.find((l) => l.id === draggingLayerId);
          if (layer) {
            const hasZone = !!(normalizeZoomArea(layer.clickArea) || normalizeZoomArea(layer.zoomArea));
            if (!hasZone) handleFocusClick(layer);
          }
          setDraggingLayerId(null);
          setDragOverZoneId(null);
        } : undefined}
      >
        {/* Scene backdrops */}
        {backdrops.map((layer) => (
          <img
            key={`bg-${layer.id}`}
            src={simAssetUrl(layer.targetPath || layer.assetPath)}
            alt=""
            draggable={false}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            style={activeAnimationLayerId === layer.id ? layerAnimationStyle(layer) : undefined}
          />
        ))}

        {/* Scene-layer hotspot buttons (exploration/no-focus-layers steps) */}
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
                  onMouseLeave={() => setHoveredLayerId((p) => (p === layer.id ? '' : p))}
                  aria-label={`Interact with ${layer.label}`}
                  className={`${hotspotBaseClass} ${hoveredLayerId === layer.id ? hotspotHoverClass : 'bg-transparent'}`}
                  style={{
                    left: `${hotspotArea.x}%`, top: `${hotspotArea.y}%`,
                    width: `${hotspotArea.width}%`, height: `${hotspotArea.height}%`,
                  }}
                />
              )}
              {readOnly && (
                <div
                  className="absolute rounded-md border-2 border-emerald-400/80 bg-emerald-100/15 pointer-events-none"
                  style={{
                    left: `${hotspotArea.x}%`, top: `${hotspotArea.y}%`,
                    width: `${hotspotArea.width}%`, height: `${hotspotArea.height}%`,
                  }}
                />
              )}
            </React.Fragment>
          );
        })}

        {/* Previously-revealed focus layers from earlier moments (same perspective) */}
        {/* Skip in editor — each step is previewed independently */}
        {!readOnly && timeline.slice(0, currentIndex).map((moment) => {
          if (moment.perspective !== scene.perspective) return null;
          return moment.layers
            .filter((layer) => layer.kind === 'focus')
            .filter((layer) => assembling
              ? revealedIds.has(layer.id)
              : disassembly
                ? !revealedIds.has(layer.id)
                : revealedIds.has(layer.id)
            )
            .map((layer) => {
              const pastClickArea = normalizeZoomArea(layer.clickArea);
              const pastZoomArea = normalizeZoomArea(layer.zoomArea);
              const pastZone = pastClickArea || pastZoomArea;
              if (assembling && pastZone) {
                return (
                  <img
                    key={`past-${layer.id}`}
                    src={simAssetUrl(layer.targetPath || layer.assetPath)}
                    alt={layer.label}
                    draggable={false}
                    className="absolute object-contain pointer-events-none"
                    style={{
                      left: `${pastZone.x}%`, top: `${pastZone.y}%`,
                      width: `${pastZone.width}%`, height: `${pastZone.height}%`,
                    }}
                  />
                );
              }
              return (
                <img
                  key={`past-${layer.id}`}
                  src={simAssetUrl(layer.targetPath || layer.assetPath)}
                  alt={layer.label}
                  draggable={false}
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                  style={activeAnimationLayerId === layer.id ? layerAnimationStyle(layer) : undefined}
                />
              );
            });
        })}

        {/* Current moment focus layers */}
        {focusLayers.map((layer) => {
          // isActive: layer still needs interaction. Hide during animation so the drop zone
          // disappears the instant a part is placed (before revealedIds updates).
          const isActive = !readOnly && !revealedIds.has(layer.id) && activeAnimationLayerId !== layer.id;
          const visible = showFocusLayer(layer);
          if (!visible && !isActive) return null;
          const clickArea = normalizeZoomArea(layer.clickArea);
          const zoomArea = normalizeZoomArea(layer.zoomArea);
          const hotspotArea = clickArea || zoomArea;

          return (
            <React.Fragment key={`focus-${layer.id}`}>
              {/* Placed/revealed image */}
              {/* Assembling: part snaps into the zone area. Other modes: full-canvas overlay. */}
              {visible && assembling && hotspotArea && (
                <img
                  src={simAssetUrl(layer.targetPath || layer.assetPath)}
                  alt={layer.label}
                  draggable={false}
                  className="absolute object-contain pointer-events-none"
                  style={{
                    left: `${hotspotArea.x}%`,
                    top: `${hotspotArea.y}%`,
                    width: `${hotspotArea.width}%`,
                    height: `${hotspotArea.height}%`,
                    ...(activeAnimationLayerId === layer.id ? layerAnimationStyle(layer) : undefined),
                  }}
                />
              )}
              {visible && (!assembling || !hotspotArea) && (
                <img
                  src={simAssetUrl(layer.targetPath || layer.assetPath)}
                  alt={layer.label}
                  draggable={false}
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                  style={activeAnimationLayerId === layer.id || readOnly || revealedIds.has(layer.id)
                    ? layerAnimationStyle(layer)
                    : undefined}
                />
              )}

              {/* ── Assembling mode: drop zone on canvas ── */}
              {/* The invisible hit-target is always present so drops register even when
                  the visual indicator is hidden. The visible border only shows during
                  an active drag so the "empty slot" doesn't look like a placed part. */}
              {isActive && assembling && hotspotArea && (
                <div
                  className={`absolute rounded-lg border-2 border-dashed transition-all duration-200 flex items-center justify-center ${
                    dragOverZoneId === layer.id
                      ? 'border-emerald-400 bg-emerald-400/20 scale-[1.03]'
                      : draggingLayerId
                        ? 'border-emerald-300 bg-emerald-100/20 animate-pulse'
                        : 'border-transparent bg-transparent'
                  }`}
                  style={{
                    left: `${hotspotArea.x}%`, top: `${hotspotArea.y}%`,
                    width: `${hotspotArea.width}%`, height: `${hotspotArea.height}%`,
                  }}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverZoneId(layer.id); }}
                  onDragLeave={() => setDragOverZoneId((p) => (p === layer.id ? null : p))}
                  onDrop={(e) => { e.stopPropagation(); e.preventDefault(); handleDrop(layer); }}
                >
                  {draggingLayerId && (
                    <span className="text-emerald-600 text-[10px] font-bold pointer-events-none select-none drop-shadow">
                      Drop here
                    </span>
                  )}
                </div>
              )}

              {/* ── Assembling mode: canvas-level zone for layers without a defined target ── */}
              {/* (handled by canvas onDrop above; nothing to render here) */}

              {/* ── Disassembly / Exploration: click buttons ── */}
              {isActive && !assembling && !hotspotArea && (
                <button
                  type="button"
                  onClick={() => handleFocusClick(layer)}
                  onMouseEnter={() => setHoveredLayerId(layer.id)}
                  onMouseLeave={() => setHoveredLayerId((p) => (p === layer.id ? '' : p))}
                  aria-label={disassembly ? `Remove ${layer.label}` : `Reveal ${layer.label}`}
                  className={`${hotspotBaseClass} inset-0 w-full h-full ${hoveredLayerId === layer.id ? hotspotHoverClass : 'bg-transparent'}`}
                />
              )}

              {isActive && !assembling && hotspotArea && (
                <button
                  type="button"
                  onClick={() => handleFocusClick(layer)}
                  onMouseEnter={() => setHoveredLayerId(layer.id)}
                  onMouseLeave={() => setHoveredLayerId((p) => (p === layer.id ? '' : p))}
                  aria-label={`Interact with ${layer.label}`}
                  className={`${hotspotBaseClass} ${hoveredLayerId === layer.id ? hotspotHoverClass : 'bg-transparent'}`}
                  style={{
                    left: `${hotspotArea.x}%`, top: `${hotspotArea.y}%`,
                    width: `${hotspotArea.width}%`, height: `${hotspotArea.height}%`,
                  }}
                />
              )}

              {/* Wrong-click zone (disassembly/exploration only) */}
              {isActive && !assembling && normalizeZoomArea(layer.wrongClickArea) && (() => {
                const wrongArea = normalizeZoomArea(layer.wrongClickArea);
                const wrongHoverId = `wrong-${layer.id}`;
                return (
                  <button
                    key={`wrong-${layer.id}`}
                    type="button"
                    onClick={handleWrongClick}
                    onMouseEnter={() => setHoveredLayerId(wrongHoverId)}
                    onMouseLeave={() => setHoveredLayerId((p) => (p === wrongHoverId ? '' : p))}
                    aria-label="Wrong area"
                    className={`${hotspotBaseClass} ${hoveredLayerId === wrongHoverId ? 'bg-red-400/10 ring-2 ring-red-400/80 shadow-[0_0_0_1px_rgba(239,68,68,0.22)]' : 'bg-transparent'}`}
                    style={{
                      left: `${wrongArea.x}%`, top: `${wrongArea.y}%`,
                      width: `${wrongArea.width}%`, height: `${wrongArea.height}%`,
                    }}
                  />
                );
              })()}

              {/* Editor zone overlays */}
              {readOnly && hotspotArea && (
                <div
                  className="absolute rounded-md border-2 border-emerald-400/80 bg-emerald-100/15 pointer-events-none"
                  style={{
                    left: `${hotspotArea.x}%`, top: `${hotspotArea.y}%`,
                    width: `${hotspotArea.width}%`, height: `${hotspotArea.height}%`,
                  }}
                />
              )}
              {readOnly && normalizeZoomArea(layer.wrongClickArea) && (() => {
                const wrongArea = normalizeZoomArea(layer.wrongClickArea);
                return (
                  <div
                    className="absolute rounded-md border-2 border-red-400/80 bg-red-100/15 pointer-events-none"
                    style={{
                      left: `${wrongArea.x}%`, top: `${wrongArea.y}%`,
                      width: `${wrongArea.width}%`, height: `${wrongArea.height}%`,
                    }}
                  />
                );
              })()}
            </React.Fragment>
          );
        })}

        {/* Step cue label */}
        {showInstructions && currentMoment && !readOnly && (
          <div className="absolute top-3 right-3 z-10 px-3 py-1.5 rounded-full bg-[#0B2B4C]/90 text-white text-xs font-semibold shadow">
            {scene.perspective || scene.category} view · Step {currentIndex + 1} of {timeline.length}
          </div>
        )}

        {/* Canvas-scoped overlay (e.g. wrong-click flash) */}
        {canvasOverlay}

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

      {/* ── Parts tray (assembling mode only) ── */}
      {assembling && !readOnly && unplacedFocusLayers.length > 0 && (
        <div className="mt-3 px-3 py-3 bg-[#EEF3F9] rounded-xl border border-[#D1DFF0]">
          <p className="text-[11px] font-semibold text-[#4A6B8A] uppercase tracking-wide mb-2 select-none">
            Parts to assemble — drag to the target zone above
          </p>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(110px, 100%), 1fr))` }}>
            {unplacedFocusLayers.map((layer) => (
              <div
                key={`tray-${layer.id}`}
                draggable={!isAdvancing}
                onDragStart={(e) => {
                  if (isAdvancing) { e.preventDefault(); return; }
                  setDraggingLayerId(layer.id);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', layer.id);
                }}
                onDragEnd={() => { setDraggingLayerId(null); setDragOverZoneId(null); }}
                title={layer.label}
                className={`relative rounded-lg overflow-hidden border-2 select-none transition-all duration-150 aspect-[16/10] ${
                  isAdvancing
                    ? 'opacity-40 cursor-not-allowed border-gray-300'
                    : draggingLayerId === layer.id
                      ? 'opacity-40 scale-95 border-emerald-400 cursor-grabbing shadow-lg'
                      : 'border-[#BDD0E4] hover:border-emerald-400 hover:scale-105 cursor-grab shadow-sm hover:shadow-md'
                }`}
              >
                <img
                  src={simAssetUrl(layer.targetPath || layer.assetPath)}
                  alt={layer.label}
                  draggable={false}
                  className="w-full h-full object-contain bg-white"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-[#0B2B4C]/75 text-white text-[9px] text-center py-0.5 truncate px-1 pointer-events-none select-none">
                  {layer.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SimulationRenderer;
