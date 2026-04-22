import React, { useCallback, useRef, useState } from 'react';

const InteractiveZoomAreaEditor = ({
  zoomArea,
  onChange,
  showInputs = true,
  showCanvasChrome = true,
  containerClassName = '',
  centerLabel = 'Drag to move',
  colorTheme = 'zoom',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState(null); // null, 'move', 'nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const handleMouseDown = useCallback((e, mode) => {
    e.preventDefault();
    setIsDragging(true);
    setDragMode(mode);
    setDragStart({ x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !dragMode) return;

    const deltaX = ((e.clientX - dragStart.x) / (containerRef.current?.offsetWidth || 1)) * 100;
    const deltaY = ((e.clientY - dragStart.y) / (containerRef.current?.offsetHeight || 1)) * 100;

    let newArea = { ...zoomArea };

    if (dragMode === 'move') {
      // Move entire rectangle
      const maxX = 100 - zoomArea.width;
      const maxY = 100 - zoomArea.height;
      newArea.x = clamp(zoomArea.x + deltaX, 0, maxX);
      newArea.y = clamp(zoomArea.y + deltaY, 0, maxY);
    } else if (dragMode === 'nw') {
      // Northwest: move x, y and shrink width, height
      const newX = clamp(zoomArea.x + deltaX, 0, zoomArea.x + zoomArea.width - 5);
      const newY = clamp(zoomArea.y + deltaY, 0, zoomArea.y + zoomArea.height - 5);
      newArea.width = clamp(zoomArea.width - (newX - zoomArea.x), 5, 100 - newX);
      newArea.height = clamp(zoomArea.height - (newY - zoomArea.y), 5, 100 - newY);
      newArea.x = newX;
      newArea.y = newY;
    } else if (dragMode === 'ne') {
      // Northeast: move y, grow width, shrink height
      const newY = clamp(zoomArea.y + deltaY, 0, zoomArea.y + zoomArea.height - 5);
      const newWidth = clamp(zoomArea.width + deltaX, 5, 100 - zoomArea.x);
      newArea.width = newWidth;
      newArea.height = clamp(zoomArea.height - (newY - zoomArea.y), 5, 100 - newY);
      newArea.y = newY;
    } else if (dragMode === 'sw') {
      // Southwest: move x, grow height, shrink width
      const newX = clamp(zoomArea.x + deltaX, 0, zoomArea.x + zoomArea.width - 5);
      const newHeight = clamp(zoomArea.height + deltaY, 5, 100 - zoomArea.y);
      newArea.x = newX;
      newArea.width = clamp(zoomArea.width - (newX - zoomArea.x), 5, 100 - newX);
      newArea.height = newHeight;
    } else if (dragMode === 'se') {
      // Southeast: grow width and height
      newArea.width = clamp(zoomArea.width + deltaX, 5, 100 - zoomArea.x);
      newArea.height = clamp(zoomArea.height + deltaY, 5, 100 - zoomArea.y);
    } else if (dragMode === 'n') {
      // North: move y, shrink height
      const newY = clamp(zoomArea.y + deltaY, 0, zoomArea.y + zoomArea.height - 5);
      newArea.y = newY;
      newArea.height = clamp(zoomArea.height - (newY - zoomArea.y), 5, 100 - newY);
    } else if (dragMode === 's') {
      // South: grow height
      newArea.height = clamp(zoomArea.height + deltaY, 5, 100 - zoomArea.y);
    } else if (dragMode === 'e') {
      // East: grow width
      newArea.width = clamp(zoomArea.width + deltaX, 5, 100 - zoomArea.x);
    } else if (dragMode === 'w') {
      // West: move x, shrink width
      const newX = clamp(zoomArea.x + deltaX, 0, zoomArea.x + zoomArea.width - 5);
      newArea.x = newX;
      newArea.width = clamp(zoomArea.width - (newX - zoomArea.x), 5, 100 - newX);
    }

    onChange(newArea);
    setDragStart({ x: e.clientX, y: e.clientY });
  }, [isDragging, dragMode, dragStart, zoomArea, onChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragMode(null);
  }, []);

  React.useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  if (!zoomArea) return null;

  const isClickTheme = colorTheme === 'click';
  const handleClassName = isClickTheme
    ? 'absolute bg-amber-500 hover:bg-amber-600 transition-colors cursor-grab active:cursor-grabbing'
    : 'absolute bg-emerald-500 hover:bg-emerald-600 transition-colors cursor-grab active:cursor-grabbing';
  const areaClassName = isClickTheme
    ? 'absolute border-2 border-amber-500 bg-amber-200/30 rounded-sm hover:bg-amber-200/40 transition-colors'
    : 'absolute border-2 border-emerald-500 bg-emerald-200/30 rounded-sm hover:bg-emerald-200/40 transition-colors';
  const centerLabelClassName = isClickTheme
    ? 'text-xs font-semibold text-amber-800 bg-white/80 px-1.5 py-0.5 rounded'
    : 'text-xs font-semibold text-emerald-700 bg-white/80 px-1.5 py-0.5 rounded';
  const dragButtonClassName = isClickTheme
    ? 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-7 px-2 rounded-md bg-amber-600/90 text-white text-xs font-semibold cursor-move border border-amber-700/60 shadow-sm'
    : 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-7 px-2 rounded-md bg-emerald-600/90 text-white text-xs font-semibold cursor-move border border-emerald-700/60 shadow-sm';
  const inputClassName = isClickTheme
    ? 'w-full h-[34px] px-2 py-1 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-amber-400'
    : 'w-full h-[34px] px-2 py-1 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400';

  const ResizeHandle = ({ position, cursor }) => (
    <div
      onMouseDown={(e) => handleMouseDown(e, position)}
      className={handleClassName}
      style={{
        cursor,
        ...getHandlePosition(position),
      }}
    />
  );

  const getHandlePosition = (position) => {
    const handleSize = 8;
    const positions = {
      nw: { top: -handleSize / 2, left: -handleSize / 2, width: handleSize, height: handleSize, borderRadius: '50%' },
      ne: { top: -handleSize / 2, right: -handleSize / 2, width: handleSize, height: handleSize, borderRadius: '50%' },
      sw: { bottom: -handleSize / 2, left: -handleSize / 2, width: handleSize, height: handleSize, borderRadius: '50%' },
      se: { bottom: -handleSize / 2, right: -handleSize / 2, width: handleSize, height: handleSize, borderRadius: '50%' },
      n: { top: -4, left: '50%', transform: 'translateX(-50%)', width: 24, height: 8 },
      s: { bottom: -4, left: '50%', transform: 'translateX(-50%)', width: 24, height: 8 },
      e: { top: '50%', right: -4, transform: 'translateY(-50%)', width: 8, height: 24 },
      w: { top: '50%', left: -4, transform: 'translateY(-50%)', width: 8, height: 24 },
    };
    return positions[position] || {};
  };

  const canvasClassName = showCanvasChrome
    ? 'relative w-full h-32 rounded-md border border-[#d6e3ef] bg-gradient-to-br from-white to-gray-50 overflow-hidden'
    : 'relative w-full h-full overflow-hidden';

  return (
    <div className={`${showInputs ? 'space-y-3' : 'w-full h-full'} ${containerClassName}`.trim()}>
      <div
        ref={containerRef}
        className={canvasClassName}
      >
        <div
          className={areaClassName}
          style={{
            left: `${zoomArea.x}%`,
            top: `${zoomArea.y}%`,
            width: `${zoomArea.width}%`,
            height: `${zoomArea.height}%`,
          }}
        >
          {/* Corner handles */}
          <ResizeHandle position="nw" cursor="nw-resize" />
          <ResizeHandle position="ne" cursor="ne-resize" />
          <ResizeHandle position="sw" cursor="sw-resize" />
          <ResizeHandle position="se" cursor="se-resize" />

          {/* Edge handles */}
          <ResizeHandle position="n" cursor="n-resize" />
          <ResizeHandle position="s" cursor="s-resize" />
          <ResizeHandle position="e" cursor="e-resize" />
          <ResizeHandle position="w" cursor="w-resize" />

          {/* Center label */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className={centerLabelClassName}>
              {centerLabel}
            </span>
          </div>

          <button
            type="button"
            onMouseDown={(e) => handleMouseDown(e, 'move')}
            className={dragButtonClassName}
            aria-label="Drag area"
          >
            Drag
          </button>
        </div>
      </div>

      {showInputs && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] font-semibold text-[#0B2B4C] mb-1">X %</label>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={Math.round(zoomArea.x)}
              onChange={(e) => {
                const newX = clamp(Number(e.target.value) || 0, 0, 100 - zoomArea.width);
                onChange({ ...zoomArea, x: newX });
              }}
              className={inputClassName}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#0B2B4C] mb-1">Y %</label>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={Math.round(zoomArea.y)}
              onChange={(e) => {
                const newY = clamp(Number(e.target.value) || 0, 0, 100 - zoomArea.height);
                onChange({ ...zoomArea, y: newY });
              }}
              className={inputClassName}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#0B2B4C] mb-1">Width %</label>
            <input
              type="number"
              min={5}
              max={100}
              step={1}
              value={Math.round(zoomArea.width)}
              onChange={(e) => {
                const newWidth = clamp(Number(e.target.value) || 5, 5, 100 - zoomArea.x);
                onChange({ ...zoomArea, width: newWidth });
              }}
              className={inputClassName}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#0B2B4C] mb-1">Height %</label>
            <input
              type="number"
              min={5}
              max={100}
              step={1}
              value={Math.round(zoomArea.height)}
              onChange={(e) => {
                const newHeight = clamp(Number(e.target.value) || 5, 5, 100 - zoomArea.y);
                onChange({ ...zoomArea, height: newHeight });
              }}
              className={inputClassName}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default InteractiveZoomAreaEditor;
