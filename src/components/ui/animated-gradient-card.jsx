import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

function useDebouncedDimensions(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!ref.current) return undefined;

    const element = ref.current;
    let timeoutId;

    const update = () => {
      const next = {
        width: element.clientWidth,
        height: element.clientHeight,
      };
      setSize(prev => (prev.width === next.width && prev.height === next.height ? prev : next));
    };

    const debounced = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(update, 60);
    };

    update();
    const resizeObserver = new ResizeObserver(debounced);
    resizeObserver.observe(element);
    window.addEventListener('resize', debounced);

    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', debounced);
    };
  }, [ref]);

  return size;
}

export function AnimatedGradient({
  colors = ['#8b5cf6', '#0ea5e9', '#22c55e'],
  blur = 'medium',
  className,
  children,
}) {
  const containerRef = useRef(null);
  const { width, height } = useDebouncedDimensions(containerRef);
  const baseSize = Math.max(width, height, 220);
  const blurPx = blur === 'light' ? '28px' : blur === 'strong' ? '80px' : '54px';

  const blobs = useMemo(() => {
    const picks = [
      { top: '8%', left: '12%', tx: [0, 54, -20, 28, 0], ty: [0, -70, 35, -40, 0], scale: 1.1 },
      { top: '52%', left: '58%', tx: [0, -40, 50, -30, 0], ty: [0, 60, -40, 20, 0], scale: 1.2 },
      { top: '30%', left: '48%', tx: [0, 70, -50, 40, 0], ty: [0, -35, 55, -20, 0], scale: 0.95 },
      { top: '68%', left: '18%', tx: [0, -25, 35, -35, 0], ty: [0, -30, 25, 40, 0], scale: 1.3 },
    ];

    return colors.map((color, index) => {
      const pattern = picks[index % picks.length];
      return {
        color,
        top: pattern.top,
        left: pattern.left,
        width: baseSize * (0.7 + (index % 3) * 0.22),
        height: baseSize * (0.7 + (index % 3) * 0.22),
        scale: pattern.scale,
      };
    });
  }, [baseSize, colors]);

  return (
    <div
      ref={containerRef}
      className={cn('relative isolate overflow-hidden rounded-[22px] border border-black/[0.06]', className)}
      style={{
        background: `linear-gradient(135deg, ${colors[0]} 0%, ${colors[1] || colors[0]} 100%)`,
      }}
    >
      <div className="absolute inset-0 bg-grid-soft opacity-25" />
      <div className="absolute inset-0" style={{ filter: `blur(${blurPx})` }}>
        {blobs.map((blob, index) => (
          <div
            key={`${blob.color}-${index}`}
            className="absolute rounded-full"
            style={{
              top: blob.top,
              left: blob.left,
              width: blob.width,
              height: blob.height,
              background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.9), ${blob.color} 40%, rgba(15,23,42,0.0) 72%)`,
              opacity: 0.3,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 h-full w-full">{children}</div>
    </div>
  );
}
