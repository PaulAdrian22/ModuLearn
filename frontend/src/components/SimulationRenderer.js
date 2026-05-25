import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  assemblingAnchor = 'zone-top-left',
  persistFocusLayers,
  disassembly: disassemblyProp,
  canvasOverlay = null,
  onImageBoxChange,
}) => {
  const canvasRef = useRef(null);
  const firstImageRef = useRef(null);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [activeAnimationLayerId, setActiveAnimationLayerId] = useState('');
  const [hoveredLayerId, setHoveredLayerId] = useState('');
  const [draggingLayerId, setDraggingLayerId] = useState(null);
  const [dragOverZoneId, setDragOverZoneId] = useState(null);
  const revealTimerRef = useRef(null);
  const [naturalPixelSizes, setNaturalPixelSizes] = useState({}); // { layerId: { widthPx, heightPx } }
  const [imageBoxLocal, setImageBoxLocal] = useState(null);
  const [backgroundScale, setBackgroundScale] = useState({ scaleX: 1, scaleY: 1 });
  const [showCorrectAreas, setShowCorrectAreas] = useState(false);
  const correctAreaTimerRef = useRef(null);
  const [mistakeCount, setMistakeCount] = useState(0);

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

  // Report the displayed image bounding box (relative to canvas) when layout changes.
  useEffect(() => {
    const report = () => {
      try {
        const canvas = canvasRef.current;
        const img = firstImageRef.current || (canvas && canvas.querySelector('img')) || null;
        if (!canvas || !img) {
          setImageBoxLocal(null);
          if (typeof onImageBoxChange === 'function') onImageBoxChange(null);
          return;
        }
        const iRect = img.getBoundingClientRect();
        const cRect = canvas.getBoundingClientRect();
        const left = ((iRect.left - cRect.left) / cRect.width) * 100;
        const top = ((iRect.top - cRect.top) / cRect.height) * 100;
        const width = (iRect.width / cRect.width) * 100;
        const height = (iRect.height / cRect.height) * 100;
        const box = { x: left, y: top, width, height };
        setImageBoxLocal((prev) => {
          if (!prev) return box;
          if (
            Math.abs(prev.x - box.x) < 0.01
            && Math.abs(prev.y - box.y) < 0.01
            && Math.abs(prev.width - box.width) < 0.01
            && Math.abs(prev.height - box.height) < 0.01
          ) {
            return prev;
          }
          return box;
        });
        if (typeof onImageBoxChange === 'function') onImageBoxChange(box);
      } catch (e) {
        // ignore
      }
    };
    report();
    window.addEventListener('resize', report);
    return () => window.removeEventListener('resize', report);
  }, [currentIndex, onImageBoxChange]);

  useEffect(() => {
    setIsAdvancing(false);
    setActiveAnimationLayerId('');
    setHoveredLayerId('');
    setDraggingLayerId(null);
    setDragOverZoneId(null);
    setMistakeCount(0); // Reset mistake counter on step change
  }, [currentIndex]);

  const updateBackgroundScale = useCallback(() => {
    const img = firstImageRef.current;
    if (!img) return;
    const naturalWidth = img.naturalWidth || img.width || 1;
    const naturalHeight = img.naturalHeight || img.height || 1;
    const rect = img.getBoundingClientRect();
    const scaleX = rect.width / naturalWidth;
    const scaleY = rect.height / naturalHeight;
    setBackgroundScale((prev) => {
      if (prev.scaleX === scaleX && prev.scaleY === scaleY) return prev;
      return { scaleX, scaleY };
    });
  }, []);

  // Track background display scale relative to its natural size.
  useEffect(() => {
    updateBackgroundScale();
    window.addEventListener('resize', updateBackgroundScale);
    return () => window.removeEventListener('resize', updateBackgroundScale);
  }, [currentIndex, updateBackgroundScale]);

  const registerNaturalSize = (layerId, imgEl) => {
    if (!imgEl || !canvasRef.current) return;
    const naturalWidth = imgEl.naturalWidth || imgEl.width || 0;
    const naturalHeight = imgEl.naturalHeight || imgEl.height || 0;
    if (!naturalWidth || !naturalHeight) return;
    setNaturalPixelSizes((p) => {
      const current = p[layerId];
      if (
        current
        && current.widthPx === naturalWidth
        && current.heightPx === naturalHeight
      ) {
        return p;
      }
      return {
        ...p,
        [layerId]: {
          naturalWidth,
          naturalHeight,
          widthPx: naturalWidth,
          heightPx: naturalHeight,
        },
      };
    });
  };

  const handleWrongClick = () => {
    if (readOnly || isAdvancing) return;
    const newCount = mistakeCount + 1;
    setMistakeCount(newCount);
    // Show correct areas briefly with pulse effect after 3 mistakes
    if (newCount >= 3) {
      setShowCorrectAreas(true);
      if (correctAreaTimerRef.current) clearTimeout(correctAreaTimerRef.current);
      correctAreaTimerRef.current = setTimeout(() => {
        setShowCorrectAreas(false);
        setMistakeCount(0);
      }, 2000);
    }
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
  const anchorMode = assemblingAnchor || 'zone-top-left';
  const anchorToBackground = anchorMode === 'background';
  const allowPastFocusLayers = !readOnly && (persistFocusLayers !== undefined ? persistFocusLayers : assembling);

  const mapAreaToCanvas = (area) => {
    if (!area) return null;
    if (!imageBoxLocal) return area;
    const left = imageBoxLocal.x + (area.x * (imageBoxLocal.width / 100));
    const top = imageBoxLocal.y + (area.y * (imageBoxLocal.height / 100));
    const width = area.width * (imageBoxLocal.width / 100);
    const height = area.height * (imageBoxLocal.height / 100);
    return { x: left, y: top, width, height };
  };

  // Assembling: hidden until correctly dropped (or animating into place).
  // Disassembly: visible until removed.
  // Exploration: hidden until clicked.
  const showFocusLayer = (layer) => {
    if (readOnly) return true;
    if (assembling) {
      // Layers without a target zone (no clickArea/zoomArea) are always visible
      // in the main area - they're pre-placed and not draggable.
      const clickArea = normalizeZoomArea(layer.clickArea);
      const zoomArea = normalizeZoomArea(layer.zoomArea);
      const hasTargetZone = !!(clickArea || zoomArea);
      if (!hasTargetZone) return true;
      // For layers with a target zone: show when revealed or during snap-in animation.
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

  // Parts tray: only include focus layers that have a target zone (clickArea/zoomArea).
  // Layers without a target zone are pre-placed in the main area and not draggable.
  // Also exclude layers that are currently animating (being placed).
  const partsTrayLayers = assembling && !readOnly
    ? focusLayers.filter((l) => {
        // Exclude layers currently animating (being placed)
        if (activeAnimationLayerId === l.id) return false;
        // Only include layers that have a target zone (draggable parts)
        const clickArea = normalizeZoomArea(l.clickArea);
        const zoomArea = normalizeZoomArea(l.zoomArea);
        return !!(clickArea || zoomArea);
      })
    : [];

  const hotspotBaseClass = 'absolute border-0 p-0 cursor-pointer focus:outline-none';

  return (
    <div className="w-full">
      {/* ── Main canvas ── */}
      <div
        ref={canvasRef}
        className="relative w-full max-w-full mx-auto aspect-[16/10] max-h-[55vh] sm:max-h-[65vh] lg:max-h-none rounded-xl bg-[#f3f5f8] border-2 border-transparent overflow-hidden select-none transition-transform duration-500 ease-out scale-100"
        onClick={!assembling && !readOnly ? (e) => {
          // Check if click was on a hotspot button (handled by its own onClick)
          // If click is on the canvas itself (not a button), it's a wrong click
          if (e.target === canvasRef.current) {
            handleWrongClick();
          }
        } : undefined}
        onDragOver={assembling && !readOnly ? (e) => e.preventDefault() : undefined}
        onDrop={assembling && !readOnly ? (e) => {
          e.preventDefault();
          if (!draggingLayerId) return;
          // Canvas-level drop outside any target zone: trigger wrong click
          // (zoned layers are handled by their zone div's onDrop + stopPropagation).
          const layer = focusLayers.find((l) => l.id === draggingLayerId);
          if (layer) {
            const hasZone = !!(normalizeZoomArea(layer.clickArea) || normalizeZoomArea(layer.zoomArea));
            if (!hasZone) {
              // Layer has no target zone - dropping anywhere is valid
              handleFocusClick(layer);
            } else {
              // Layer has a target zone but was dropped outside it - wrong drop
              handleWrongClick();
            }
          }
          setDraggingLayerId(null);
          setDragOverZoneId(null);
        } : undefined}
      >
        {/* Scene backdrops */}
        {backdrops.map((layer, idx) => (
          <img
            ref={idx === 0 ? ((el) => { firstImageRef.current = el; }) : undefined}
            key={`bg-${layer.id}`}
            src={simAssetUrl(layer.targetPath || layer.assetPath)}
            alt=""
            draggable={false}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            style={activeAnimationLayerId === layer.id ? layerAnimationStyle(layer) : undefined}
            onLoad={idx === 0 ? updateBackgroundScale : undefined}
          />
        ))}

        {/* Scene-layer hotspot buttons (exploration/no-focus-layers steps) */}
        {currentSceneLayers.map((layer) => {
          const clickArea = normalizeZoomArea(layer.clickArea);
          const zoomArea = normalizeZoomArea(layer.zoomArea);
          // Only layers with a clickArea are interactable. Layers without clickArea
          // are just visual elements (background/decoration).
          const hotspotArea = clickArea;
          if (!hotspotArea) return null;
          const sceneHotspot = mapAreaToCanvas(hotspotArea) || hotspotArea;
          return (
            <React.Fragment key={`scene-${layer.id}`}>
              {sceneHotspotsEnabled && (
                <button
                  type="button"
                  onClick={() => handleFocusClick(layer)}
                  onMouseEnter={() => setHoveredLayerId(layer.id)}
                  onMouseLeave={() => setHoveredLayerId((p) => (p === layer.id ? '' : p))}
                  aria-label={`Interact with ${layer.label}`}
                  className={`${hotspotBaseClass} bg-transparent`}
                  style={{
                    left: `${sceneHotspot.x}%`, top: `${sceneHotspot.y}%`,
                    width: `${sceneHotspot.width}%`, height: `${sceneHotspot.height}%`,
                  }}
                />
              )}
              {readOnly && (
                <div
                  className="absolute rounded-md border-2 border-emerald-400/80 bg-emerald-100/15 pointer-events-none"
                  style={{
                    left: `${sceneHotspot.x}%`, top: `${sceneHotspot.y}%`,
                    width: `${sceneHotspot.width}%`, height: `${sceneHotspot.height}%`,
                  }}
                />
              )}
            </React.Fragment>
          );
        })}

        {/* Previously-revealed focus layers from earlier moments (same perspective) */}
        {/* Skip in editor — each step is previewed independently */}
        {allowPastFocusLayers && timeline.slice(0, currentIndex).map((moment) => {
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
              if (assembling) {
                const pastClickArea = normalizeZoomArea(layer.clickArea);
                const pastZoomArea = normalizeZoomArea(layer.zoomArea);
                const pastZone = pastClickArea || pastZoomArea;
                const anchor = imageBoxLocal || { x: 0, y: 0, width: 0, height: 0 };
                const canvasPast = pastZone ? (mapAreaToCanvas(pastZone) || pastZone) : null;
                const useBackground = anchorToBackground || !canvasPast;
                const useCenter = anchorMode === 'zone-center';
                const left = useBackground
                  ? anchor.x
                  : (useCenter ? (canvasPast.x + canvasPast.width / 2) : canvasPast.x);
                const top = useBackground
                  ? anchor.y
                  : (useCenter ? (canvasPast.y + canvasPast.height / 2) : canvasPast.y);
                const transform = !useBackground && useCenter ? 'translate(-50%, -50%)' : undefined;
                return (
                  <img
                    key={`past-${layer.id}`}
                    ref={(el) => { if (el) registerNaturalSize(layer.id, el); }}
                    src={simAssetUrl(layer.assetPath || layer.targetPath)}
                    alt={layer.label}
                    draggable={false}
                    className="absolute object-contain pointer-events-none"
                    style={{
                      left: `${left}%`,
                      top: `${top}%`,
                      transform,
                      width: naturalPixelSizes[layer.id]?.naturalWidth
                        ? `${naturalPixelSizes[layer.id].naturalWidth * backgroundScale.scaleX}px`
                        : 'auto',
                      height: naturalPixelSizes[layer.id]?.naturalHeight
                        ? `${naturalPixelSizes[layer.id].naturalHeight * backgroundScale.scaleY}px`
                        : 'auto',
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
          // Only layers with a clickArea are interactable. Layers without clickArea
          // are just visual elements (background/decoration).
          const hotspotArea = clickArea;

          return (
            <React.Fragment key={`focus-${layer.id}`}>
              {/* Full-canvas overlay image for all visible components (same size/position in editor and learner view) */}
              {visible && (
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

              {/* ── Assembling mode: invisible drop zone (hit-target only, no visual) ── */}
              {isActive && assembling && hotspotArea && (() => {
                const canvasArea = mapAreaToCanvas(hotspotArea) || hotspotArea;
                return (
                  <div
                    className="absolute cursor-pointer"
                    style={{
                      left: `${canvasArea.x}%`, top: `${canvasArea.y}%`,
                      width: `${canvasArea.width}%`, height: `${canvasArea.height}%`,
                    }}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverZoneId(layer.id); }}
                    onDragLeave={() => setDragOverZoneId((p) => (p === layer.id ? null : p))}
                    onDrop={(e) => { e.stopPropagation(); e.preventDefault(); handleDrop(layer); }}
                  />
                );
              })()}

              {/* ── Assembling mode: canvas-level zone for layers without a defined target ── */}
              {/* (handled by canvas onDrop above; nothing to render here) */}

              {/* ── Disassembly / Exploration: click buttons ── */}
              {/* Only render click buttons for layers with a clickArea (hotspotArea).
                  Layers without clickArea are not interactable. */}
              {isActive && !assembling && hotspotArea && (() => {
                const activeArea = mapAreaToCanvas(hotspotArea) || hotspotArea;
                return (
                  <button
                    type="button"
                    onClick={() => handleFocusClick(layer)}
                    onMouseEnter={() => setHoveredLayerId(layer.id)}
                    onMouseLeave={() => setHoveredLayerId((p) => (p === layer.id ? '' : p))}
                    aria-label={`Interact with ${layer.label}`}
                    className={`${hotspotBaseClass} bg-transparent`}
                    style={{
                      left: `${activeArea.x}%`, top: `${activeArea.y}%`,
                      width: `${activeArea.width}%`, height: `${activeArea.height}%`,
                    }}
                  />
                );
              })()}

              {/* Editor zone overlays — only show for zoomArea, not clickArea
              which have their own dedicated editors with proper color themes */}
              {readOnly && hotspotArea && !clickArea && !normalizeZoomArea(layer.wrongClickArea) && (() => {
                const editorArea = mapAreaToCanvas(hotspotArea) || hotspotArea;
                return (
                  <div
                    className="absolute rounded-md border-2 border-emerald-400/80 bg-emerald-100/15 pointer-events-none"
                    style={{
                      left: `${editorArea.x}%`, top: `${editorArea.y}%`,
                      width: `${editorArea.width}%`, height: `${editorArea.height}%`,
                    }}
                  />
                );
              })()}
            </React.Fragment>
          );
        })}

        {/* Correct areas hint overlay - shown briefly after wrong click */}
        {showCorrectAreas && !readOnly && focusLayers.map((layer) => {
          const clickArea = normalizeZoomArea(layer.clickArea);
          if (!clickArea) return null;
          const canvasArea = mapAreaToCanvas(clickArea) || clickArea;
          return (
            <div
              key={`hint-${layer.id}`}
              className="absolute rounded-md border-2 border-emerald-400/40 bg-emerald-400/10 animate-pulse pointer-events-none"
              style={{
                left: `${canvasArea.x}%`, top: `${canvasArea.y}%`,
                width: `${canvasArea.width}%`, height: `${canvasArea.height}%`,
              }}
            />
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
      {assembling && !readOnly && partsTrayLayers.length > 0 && (
        <div className="mt-3 px-3 py-3 bg-[#EEF3F9] rounded-xl border border-[#D1DFF0]">
          <p className="text-[11px] font-semibold text-[#4A6B8A] uppercase tracking-wide mb-2 select-none">
            Parts to assemble — drag to the target zone above
          </p>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(110px, 100%), 1fr))` }}>
              {partsTrayLayers.map((layer) => (
              <div
                key={`tray-${layer.id}`}
                  draggable={!isAdvancing && !revealedIds.has(layer.id)}
                  onDragStart={(e) => {
                    if (isAdvancing || revealedIds.has(layer.id)) { e.preventDefault(); return; }
                    setDraggingLayerId(layer.id);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', layer.id);
                  }}
                onDragEnd={() => { setDraggingLayerId(null); setDragOverZoneId(null); }}
                title={layer.label}
                className={`relative rounded-lg overflow-hidden border-2 select-none transition-all duration-150 aspect-[16/10] ${
                    revealedIds.has(layer.id)
                      ? 'opacity-40 cursor-not-allowed border-gray-300'
                      : isAdvancing
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
