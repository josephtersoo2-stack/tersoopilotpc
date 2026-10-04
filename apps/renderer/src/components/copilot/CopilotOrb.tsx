import { useRef, useState, type PointerEvent } from 'react';
import { useCopilotStore } from '../../stores/copilotStore';
import { SparklesIcon } from '../icons';

export function CopilotOrb() {
  const { isOpen, toggleOpen, position, setPosition, hasUnread } = useCopilotStore();
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    orbX: number;
    orbY: number;
    hasMoved: boolean;
  }>({
    pointerX: 0,
    pointerY: 0,
    orbX: 0,
    orbY: 0,
    hasMoved: false,
  });

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsPointerDown(true);
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      orbX: position.x,
      orbY: position.y,
      hasMoved: false,
    };
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!isPointerDown) return;
    const dx = e.clientX - dragStartRef.current.pointerX;
    const dy = e.clientY - dragStartRef.current.pointerY;

    if (Math.hypot(dx, dy) > 4) {
      dragStartRef.current.hasMoved = true;
    }

    if (dragStartRef.current.hasMoved) {
      setPosition({
        x: dragStartRef.current.orbX + dx,
        y: dragStartRef.current.orbY + dy,
      });
    }
  };

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    setIsPointerDown(false);

    // If it wasn't dragged significantly, treat as click
    if (!dragStartRef.current.hasMoved) {
      toggleOpen();
    }
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      title="Tersoo Copilot (Click to open, Drag anywhere to move)"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: '52px',
        height: '52px',
        borderRadius: '50%',
        zIndex: 2147483600,
        cursor: isPointerDown ? 'grabbing' : 'grab',
        userSelect: 'none',
        touchAction: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
        boxShadow: isHovered || isPointerDown
          ? '0 0 28px rgba(124, 58, 237, 0.65), 0 8px 24px rgba(0, 0, 0, 0.5)'
          : '0 0 18px rgba(59, 130, 246, 0.4), 0 6px 18px rgba(0, 0, 0, 0.4)',
        border: '1.5px solid rgba(255, 255, 255, 0.25)',
        transform: isPointerDown ? 'scale(0.94)' : isHovered ? 'scale(1.08)' : 'scale(1)',
        transition: isPointerDown ? 'box-shadow 0.2s' : 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s',
      }}
    >
      {/* Ambient Pulsating Glow Ring */}
      <div
        style={{
          position: 'absolute',
          inset: '-3px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(96, 165, 250, 0.4) 0%, transparent 70%)',
          pointerEvents: 'none',
          animation: 'pulse 2.4s infinite ease-in-out',
        }}
      />

      {/* Sparkles Icon */}
      <div
        style={{
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: isHovered ? 'rotate(15deg)' : 'none',
          transition: 'transform 0.3s ease',
        }}
      >
        <SparklesIcon size={24} />
      </div>

      {/* Unread / Notification Indicator Badge */}
      {hasUnread && !isOpen && (
        <span
          style={{
            position: 'absolute',
            top: '0px',
            right: '0px',
            width: '13px',
            height: '13px',
            backgroundColor: '#10b981',
            border: '2px solid #0f172a',
            borderRadius: '50%',
            boxShadow: '0 0 8px rgba(16, 185, 129, 0.8)',
          }}
        />
      )}
    </div>
  );
}
