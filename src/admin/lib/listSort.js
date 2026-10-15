import React from 'react';

export const SORT_BY_OPTIONS = [
  { value: 'booked', label: 'Date Booked' },
  { value: 'checkin', label: 'Check-in Date' },
];

export const SORT_DIR_OPTIONS = [
  { value: 'desc', label: 'Newest first' },
  { value: 'asc', label: 'Oldest first' },
];

export function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

const bookedMillis = r => toMillis(r.createdAt || r.paidAt || r.paymentDate || r.date || r.timestamp);
const checkInMillis = r => toMillis(r.checkIn || r.checkInDate || r.reservation?.checkIn);

export function sortRecords(list, sortBy = 'booked', dir = 'desc') {
  const get = sortBy === 'checkin' ? checkInMillis : bookedMillis;
  const factor = dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => (get(a) - get(b)) * factor);
}

export function SortControls({ sortBy, sortDir, onSortBy, onSortDir, style }) {
  return (
    <>
      <select aria-label="Sort by" value={sortBy} onChange={e => onSortBy(e.target.value)} style={style}>
        {SORT_BY_OPTIONS.map(o => <option key={o.value} value={o.value}>Sort: {o.label}</option>)}
      </select>
      <select aria-label="Sort order" value={sortDir} onChange={e => onSortDir(e.target.value)} style={style}>
        {SORT_DIR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </>
  );
}
