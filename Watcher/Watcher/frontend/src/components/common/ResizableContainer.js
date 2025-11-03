import React, { useState, useRef, useEffect, useCallback } from 'react';

const ResizableContainer = ({
  leftComponent,
  rightComponent,
  defaultLeftWidth = 60,
  storageKey = 'resizable-container'
}) => {
  const [leftWidth, setLeftWidth] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? parseFloat(saved) : defaultLeftWidth;
  });

  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(storageKey, leftWidth.toString());
  }, [leftWidth, storageKey]);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const mouseX = e.clientX - containerRect.left;
    let newLeftWidth = (mouseX / containerWidth) * 100;
    newLeftWidth = Math.max(0, Math.min(100, newLeftWidth));
    setLeftWidth(newLeftWidth);
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const resetToDefault = () => {
    setLeftWidth(defaultLeftWidth);
  };

  const rightWidth = 100 - leftWidth;
  const idleWidthPx = 8;
  const activeWidthPx = 14;

  const dividerBaseClasses = 'position-relative d-flex align-items-center justify-content-center mx-1 user-select-none';
  const isActiveVisual = isDragging || isHovering;
  const tooltipClasses = 'position-absolute bg-primary text-white px-3 py-2 rounded shadow small fw-bold text-nowrap';

  return (
    <div ref={containerRef} className="d-flex w-100 h-100 position-relative">
      <div className={`overflow-hidden ${leftWidth > 0 ? 'pe-1' : 'd-none'}`} style={{ width: `${leftWidth}%` }}>
        {leftComponent}
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={handleMouseDown}
        onDoubleClick={resetToDefault}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        className={dividerBaseClasses}
        style={{
          width: `${isActiveVisual ? activeWidthPx : idleWidthPx}px`,
          cursor: 'col-resize',
          zIndex: 10,
          transition: 'width 160ms ease, box-shadow 160ms ease, background-color 160ms ease',
          borderRadius: isActiveVisual ? '6px' : '999px'
        }}
        title="Drag to resize panels • Double-click to reset"
      >
        <div
          className={isActiveVisual ? 'w-100 h-100 bg-primary rounded shadow-sm' : 'w-100 h-100 bg-secondary bg-opacity-25 border border-secondary rounded'}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            pointerEvents: 'none'
          }}
          aria-hidden="true"
        />

        <div
          className={isActiveVisual ? 'bg-white opacity-100' : 'bg-white opacity-50'}
          style={{
            width: isActiveVisual ? 6 : 2,
            height: isActiveVisual ? 40 : 24,
            borderRadius: 4,
            zIndex: 11,
            transition: 'all 160ms ease'
          }}
          aria-hidden="true"
        />

        {isDragging && (
          <div
            className={tooltipClasses}
            style={{
              top: '-50px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1000,
              whiteSpace: 'nowrap'
            }}
            role="status"
            aria-live="polite"
          >
            {leftWidth.toFixed(0)}% <span className="mx-1">|</span> {rightWidth.toFixed(0)}%
            {leftWidth === 0 && <span className="ms-1">(Left Hidden)</span>}
            {rightWidth === 0 && <span className="ms-1">(Right Hidden)</span>}

            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderTop: '6px solid var(--bs-primary)'
              }}
            />
          </div>
        )}
      </div>

      <div className={`overflow-hidden ${rightWidth > 0 ? 'ps-1' : 'd-none'}`} style={{ width: `${rightWidth}%` }}>
        {rightComponent}
      </div>
    </div>
  );
};

export default ResizableContainer;