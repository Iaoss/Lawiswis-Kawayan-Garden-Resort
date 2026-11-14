// client/components/OccupancyBadge.js
//
// Pill showing how busy the resort is ("Low crowd" / "Moderate" / "High
// occupancy") for a date range, backed by /api/occupancy. Styled as liquid
// glass to match the guest website's top bar: a blurred, see-through pill
// with a light rim and an inner highlight, tinted by the crowd level.
//
// Usage:
//   Listing page banner (resort-wide, next 7 days):
//     <OccupancyBadge />
//
//   Booking page (live, tied to the guest's selected dates):
//     <OccupancyBadge startDate={form.checkIn} endDate={form.checkOut} />
//
// Shows nothing while there isn't a valid date range yet, and a quiet
// message if the request fails.

import React, { useEffect, useState } from 'react';

const LEVELS = {
  low:      { tint: 'rgba(24, 74, 42, 0.62)',  dot: '#6ee7a0', label: 'Low crowd' },
  moderate: { tint: 'rgba(110, 76, 8, 0.6)',   dot: '#fcd34d', label: 'Moderate crowd' },
  busy:     { tint: 'rgba(122, 28, 28, 0.62)', dot: '#fca5a5', label: 'High crowd' },
  full:     { tint: 'rgba(127, 29, 29, 0.85)', dot: '#fecaca', label: 'Fully booked' },
  neutral:  { tint: 'rgba(16, 26, 20, 0.45)',  dot: 'rgba(255,255,255,0.7)', label: '' },
};

const GLASS_CSS = `
  .occupancy-glass {
    position: relative; isolation: isolate; overflow: hidden;
    display: inline-flex; align-items: center; gap: 10px;
    border-radius: 999px; padding: 9px 16px 9px 12px;
    color: #fff; font: 600 12px/1.35 'Poppins', sans-serif;
    background: linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.05) 45%, rgba(255,255,255,0.14) 100%), var(--occ-tint);
    -webkit-backdrop-filter: blur(22px) saturate(180%); backdrop-filter: blur(22px) saturate(180%);
    border: 1px solid rgba(255,255,255,0.28);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -1px 0 rgba(255,255,255,0.06), 0 10px 30px rgba(10,18,12,0.22);
    text-shadow: 0 1px 1px rgba(0,0,0,0.18);
  }
  .occupancy-glass::before {
    content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: -1;
    background: radial-gradient(120% 160% at 12% -30%, rgba(255,255,255,0.32), transparent 55%);
  }
  .occupancy-glass__dot {
    width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; background: var(--occ-dot);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--occ-dot) 28%, transparent), 0 0 10px var(--occ-dot);
    animation: occupancy-pulse 2.4s ease-in-out infinite;
  }
  .occupancy-glass__level { font-weight: 700; letter-spacing: .01em; }
  .occupancy-glass__detail { font-weight: 500; opacity: .88; }
  @keyframes occupancy-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }
  @media (prefers-reduced-motion: reduce) { .occupancy-glass__dot { animation: none; } }
  @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    .occupancy-glass { background: var(--occ-tint); }
  }
`;

// The API message starts with an emoji dot; the pill draws its own dot.
const cleanMessage = message => String(message || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();

function GlassPill({ level = 'neutral', children, style, role = 'status' }) {
  const s = LEVELS[level] || LEVELS.neutral;
  return (
    <>
      <style>{GLASS_CSS}</style>
      <div role={role} aria-live="polite" className="occupancy-glass"
        style={{ '--occ-tint': s.tint, '--occ-dot': s.dot, ...style }}>
        <span className="occupancy-glass__dot" aria-hidden="true" />
        <span>{children}</span>
      </div>
    </>
  );
}

export default function OccupancyBadge({ startDate, endDate, style = {} }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);

    fetch(`/api/occupancy?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error('Occupancy API unavailable');
        return res.json();
      })
      .then((json) => { if (!cancelled) setData(json.level ? json : null); })
      .catch((requestError) => {
        console.error('Unable to load live guest occupancy:', requestError);
        if (!cancelled) {
          setData(null);
          setError(true);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [startDate, endDate]);

  if (loading) return <GlassPill style={style}><span className="occupancy-glass__detail">Checking how busy it is…</span></GlassPill>;
  if (error) return <GlassPill style={style}><span className="occupancy-glass__detail">Live guest count is unavailable right now.</span></GlassPill>;
  if (!data) return null;

  const level = LEVELS[data.level] ? data.level : 'moderate';
  // "Low Crowd — ~12 guests currently booked. Ideal for a quiet stay."
  const [, detail = ''] = cleanMessage(data.message).split(/\s+[—-]\s+/, 2);
  return (
    <GlassPill level={level} style={style}>
      <span className="occupancy-glass__level">{LEVELS[level].label}</span>
      {detail && <span className="occupancy-glass__detail"> · {detail}</span>}
    </GlassPill>
  );
}
