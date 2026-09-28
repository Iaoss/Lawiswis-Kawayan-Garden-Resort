import React from 'react';

export function AnimatedGradient({ colors = [], blur = 'medium', className = '' }) {
  const gradientColors = colors.length ? colors : ['#dff8ee', '#b6ecd5'];
  const blurAmount = blur === 'large' ? '34px' : blur === 'small' ? '14px' : '24px';

  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        position: 'absolute',
        inset: '-18%',
        pointerEvents: 'none',
        opacity: 0.72,
        filter: `blur(${blurAmount})`,
        background: `radial-gradient(circle at 24% 30%, ${gradientColors[0]} 0%, transparent 48%), radial-gradient(circle at 78% 68%, ${gradientColors[1] || gradientColors[0]} 0%, transparent 52%)`,
        animation: 'animated-gradient-drift 8s ease-in-out infinite alternate',
      }}
    />
  );
}

export default AnimatedGradient;
