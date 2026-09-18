// client/components/OccupancyBadge.js
//
// Reusable pill showing a friendly occupancy level ("Quiet" / "Moderate" /
// "Busy") for a date range, backed by /api/occupancy.
//
// Usage:
//   Listing page banner (resort-wide, next 7 days):
//     <OccupancyBadge />
//
//   Booking page (live, tied to the guest's selected dates):
//     <OccupancyBadge startDate={form.checkIn} endDate={form.checkOut} />
//
// Renders nothing while there isn't a valid date range yet, and nothing if
// the request fails, so it fails quietly rather than showing a broken pill.

import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';

const LEVEL_STYLES = {
  quiet:    { bg: 'rgba(74,124,89,0.12)',   color: '#2f6b3f', dot: '#4a7c59', label: 'Quiet' },
  moderate: { bg: 'rgba(251,191,36,0.14)',  color: '#92620a', dot: '#fbbf24', label: 'Moderate' },
  busy:     { bg: 'rgba(248,113,113,0.14)', color: '#a33333', dot: '#f87171', label: 'Busy' },
};

const levelFromPercentage = (percentage) => {
  if (percentage <= 30) return { level: 'quiet', message: 'Quiet — shared facilities should be relaxed.' };
  if (percentage <= 65) return { level: 'moderate', message: 'Moderate — expect some company around the pools and common areas.' };
  return { level: 'busy', message: 'Busy — pools and common areas may be more crowded than usual.' };
};

export default function OccupancyBadge({ startDate, endDate, style = {} }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);

    fetch(`/api/occupancy?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error('Occupancy API unavailable');
        return res.json();
      })
      .then((json) => { if (!cancelled) setData(json.level ? json : null); })
      .catch(async () => {
        try {
          const snapshot = await getDocs(collection(db, 'rooms'));
          const rooms = snapshot.docs.map((room) => room.data());
          const occupied = rooms.filter((room) => room.status === 'occupied').length;
          const fallback = levelFromPercentage(rooms.length ? Math.round((occupied / rooms.length) * 100) : 0);
          if (!cancelled) setData(fallback);
        } catch {
          if (!cancelled) setData(null);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [startDate, endDate]);

  if (loading) {
    return (
      <div style={{ fontSize: 12, color: '#9ca3af', ...style }}>
        Checking occupancy…
      </div>
    );
  }

  if (!data) return null;

  const s = LEVEL_STYLES[data.level] || LEVEL_STYLES.moderate;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        background: s.bg,
        color: s.color,
        borderRadius: 20,
        padding: '8px 14px',
        fontSize: 12,
        fontWeight: 600,
        fontFamily: "'Poppins', sans-serif",
        ...style,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      <span>{data.message}</span>
    </div>
  );
}
