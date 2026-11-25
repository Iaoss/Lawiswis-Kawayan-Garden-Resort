import React, { useEffect, useMemo, useRef, useState } from 'react';
import { auth } from '../../firebase/firebase';
import { roomAccessLabel, roomIsStepFree } from '../../lib/roomAccess';
import PageLayout from '../components/PageLayout';
import { useSettings } from '../components/SettingsContext';
import { enqueue, flushOutbox, getOutbox, subscribeOutbox } from '../lib/offlineOutbox';
import { subscribeCollection } from '../lib/liveCollection';
import { sendStaffRequest } from '../lib/staffApi';
import './housekeeping.css';

const FILTERS = [
  { id: 'all', label: 'All rooms' },
  { id: 'cleaning', label: 'Cleaning' },
  { id: 'available', label: 'Available' },
  { id: 'maintenance', label: 'Out of Order' },
];

const normalizeStatus = status => {
  const value = String(status || '').toLowerCase();
  if (['vacant', 'available'].includes(value)) return 'available';
  if (['maintenance', 'out-of-order', 'out-of-service', 'unavailable'].includes(value)) return 'maintenance';
  return value;
};

const statusLabel = status => ({
  available: 'Available',
  cleaning: 'Cleaning',
  maintenance: 'Out of Order',
  occupied: 'Occupied',
}[status] || status || 'Unknown');

const roomIsAccessible = room => /wheelchair|pwd.?friendly|accessible/i.test(String(room.amenities || ''));

export default function Housekeeping() {
  const { settings } = useSettings();
  const dark = settings?.darkMode;
  const [rooms, setRooms] = useState([]);
  const [filter, setFilter] = useState('all');
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const [outbox, setOutbox] = useState(getOutbox);
  const [overrides, setOverrides] = useState({});
  const [syncedRooms, setSyncedRooms] = useState({});
  const [notes, setNotes] = useState({});
  const [busyRoom, setBusyRoom] = useState('');
  const [error, setError] = useState('');
  const previousOutbox = useRef(getOutbox());

  useEffect(() => subscribeCollection('rooms',
    snapshot => setRooms(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))),
    loadError => {
      console.error('Housekeeping rooms could not be loaded:', loadError);
      setError('Rooms could not be loaded. Please reconnect and try again.');
    }), []);

  useEffect(() => subscribeOutbox(items => {
    const previous = previousOutbox.current;
    const currentIds = new Set(items.map(item => item.id));
    previous.filter(item => item.path === 'housekeeping'
      && item.body?.roomId
      && item.status === 'pending'
      && !currentIds.has(item.id))
      .forEach(item => setSyncedRooms(current => ({ ...current, [item.body.roomId]: Date.now() })));
    previousOutbox.current = items;
    setOutbox(items);
  }), []);

  useEffect(() => {
    const setConnection = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', setConnection);
    window.addEventListener('offline', setConnection);
    return () => {
      window.removeEventListener('online', setConnection);
      window.removeEventListener('offline', setConnection);
    };
  }, []);

  useEffect(() => {
    setOverrides(current => {
      const next = { ...current };
      rooms.forEach(room => {
        const override = next[room.id];
        if (override && normalizeStatus(room.status) === override.status
          && (override.status !== 'maintenance' || (room.maintenanceNote || '') === override.maintenanceNote)) {
          delete next[room.id];
        }
      });
      return next;
    });
  }, [rooms]);

  const queuedByRoom = useMemo(() => {
    const pending = new Map();
    outbox.filter(item => item.path === 'housekeeping' && item.body?.roomId)
      .forEach(item => pending.set(item.body.roomId, item));
    return pending;
  }, [outbox]);

  const counts = useMemo(() => rooms.reduce((total, room) => {
    const queued = queuedByRoom.get(room.id);
    const status = overrides[room.id]?.status || (queued ? normalizeStatus(queued.body.status) : normalizeStatus(room.status));
    total[status] = (total[status] || 0) + 1;
    return total;
  }, {}), [rooms, queuedByRoom, overrides]);

  const visibleRooms = useMemo(() => rooms
    .map(room => {
      const queued = queuedByRoom.get(room.id);
      const override = overrides[room.id];
      const status = override?.status || (queued ? normalizeStatus(queued.body.status) : normalizeStatus(room.status));
      const maintenanceNote = override?.maintenanceNote ?? (queued?.body.maintenanceNote ?? room.maintenanceNote ?? '');
      return { ...room, displayStatus: status, displayMaintenanceNote: maintenanceNote, queued };
    })
    .filter(room => filter === 'all' || room.displayStatus === filter)
    .sort((a, b) => String(a.roomNumber || '').localeCompare(String(b.roomNumber || ''), undefined, { numeric: true })), [rooms, queuedByRoom, overrides, filter]);

  const setRoomStatus = async (room, status, maintenanceNote = '') => {
    if (busyRoom || room.displayStatus === 'occupied') return;
    if (status === 'maintenance' && !maintenanceNote.trim()) {
      setError(`Add a short maintenance note for Room ${room.roomNumber}.`);
      return;
    }

    setError('');
    setBusyRoom(room.id);
    setSyncedRooms(current => {
      const next = { ...current };
      delete next[room.id];
      return next;
    });
    const override = { status, maintenanceNote: status === 'maintenance' ? maintenanceNote.trim() : '' };
    setOverrides(current => ({ ...current, [room.id]: override }));
    try {
      const body = {
        action: 'set-room-status',
        roomId: room.id,
        status: status === 'maintenance' ? 'out-of-order' : status,
        maintenanceNote: override.maintenanceNote,
      };
      const queued = enqueue('housekeeping', body, 'POST', auth.currentUser?.uid || '');
      if (!getOutbox().some(item => item.id === queued.id)) {
        throw new Error('This device could not save the update for offline sync. Check available storage and try again.');
      }
      if (navigator.onLine !== false) {
        await flushOutbox(sendStaffRequest, { uid: auth.currentUser?.uid || '' });
      }
    } catch (requestError) {
      console.error('Housekeeping room update failed:', requestError);
      setOverrides(current => {
        const next = { ...current };
        delete next[room.id];
        return next;
      });
      setError(requestError.message || `Room ${room.roomNumber} could not be updated.`);
    } finally {
      setBusyRoom('');
    }
  };

  const palette = dark
    ? { bg: '#020b09', card: '#1c1c1c', border: '#282827', text: '#e8e8d8', muted: '#a3a393' }
    : { bg: '#f4f6f4', card: '#ffffff', border: '#e5e7eb', text: '#1f2937', muted: '#6b7280' };

  return (
    <PageLayout>
      <main className="housekeeping-page" data-dark={dark ? 'true' : 'false'} style={{ background: palette.bg, color: palette.text, fontFamily: "'Poppins', sans-serif" }}>
        <header className="housekeeping-header">
          <div>
            <div className="housekeeping-eyebrow">STAFF · ROOMS</div>
            <h1>Housekeeping &amp; Maintenance</h1>
            <p>Update room readiness. Changes are saved here and sync automatically when you reconnect.</p>
          </div>
          <div className={`housekeeping-connection ${online ? 'is-online' : 'is-offline'}`} role="status">
            <span aria-hidden="true" className="housekeeping-connection-dot" />
            {online ? 'Online · Sync enabled' : 'Offline · Changes saved on this device'}
          </div>
        </header>

        <section className="housekeeping-filters" aria-label="Filter rooms">
          {FILTERS.map(item => (
            <button key={item.id} type="button" aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={`housekeeping-filter ${filter === item.id ? 'is-active' : ''}`}>
              {item.label}
              <span>{item.id === 'all' ? rooms.length : counts[item.id] || 0}</span>
            </button>
          ))}
        </section>

        {error && <div className="housekeeping-error" role="alert">{error}</div>}
        {!online && (
          <div className="housekeeping-offline-note">
            Updates will appear immediately on this phone. Pending status changes will be sent automatically when the connection returns.
          </div>
        )}

        <section className="housekeeping-grid" aria-label="Room list">
          {visibleRooms.map(room => {
            const access = roomAccessLabel(room);
            const isOccupied = room.displayStatus === 'occupied';
            const failed = room.queued?.status === 'failed';
            const syncLabel = room.queued
              ? (failed ? 'Sync needs attention' : 'Saved Offline (Pending Sync)')
              : (syncedRooms[room.id] ? 'Synced' : '');
            const accessible = roomIsAccessible(room);
            return (
              <article key={room.id} className="housekeeping-card" style={{ background: palette.card, borderColor: palette.border }}>
                <div className="housekeeping-card-heading">
                  <div>
                    <h2>Room {room.roomNumber || room.id}</h2>
                    <p>{room.type || 'Room'}{room.floor ? ` · ${room.floor === 'ground' ? 'Ground floor' : room.floor === 'upper' ? 'Upper floor' : room.floor}` : ''}</p>
                  </div>
                  <span className={`housekeeping-status status-${room.displayStatus}`}>{statusLabel(room.displayStatus)}</span>
                </div>

                <div className="housekeeping-tags">
                  <span className={`housekeeping-tag access-${access.tone}`}>{access.text}</span>
                  {roomIsStepFree(room) && <span className="housekeeping-tag access-ok">Step-free</span>}
                  {accessible && <span className="housekeeping-tag access-ok">PWD-friendly</span>}
                </div>

                {room.displayStatus === 'maintenance' && room.displayMaintenanceNote && (
                  <div className="housekeeping-maintenance-note">
                    <strong>Issue:</strong> {room.displayMaintenanceNote}
                  </div>
                )}

                {syncLabel && (
                  <div className={`housekeeping-sync ${failed ? 'sync-failed' : syncedRooms[room.id] && !room.queued ? 'sync-done' : ''}`} role="status">
                    {syncedRooms[room.id] && !room.queued ? '✓ ' : '☁ '}
                    {syncLabel}
                    {room.queued?.error ? ` · Retrying: ${room.queued.error}` : ''}
                  </div>
                )}

                {isOccupied ? (
                  <p className="housekeeping-readonly">Occupied rooms cannot be changed here.</p>
                ) : (
                  <div className="housekeeping-actions">
                    {room.displayStatus === 'cleaning' && (
                      <button type="button" className="housekeeping-primary" disabled={Boolean(busyRoom)}
                        onClick={() => setRoomStatus(room, 'available')}>
                        {busyRoom === room.id ? 'Saving…' : 'Mark as Available'}
                      </button>
                    )}
                    {room.displayStatus === 'maintenance' && (
                      <button type="button" className="housekeeping-primary" disabled={Boolean(busyRoom)}
                        onClick={() => setRoomStatus(room, 'available')}>
                        {busyRoom === room.id ? 'Saving…' : 'Mark Repaired & Available'}
                      </button>
                    )}
                    {room.displayStatus !== 'maintenance' && (
                      <div className="housekeeping-report">
                        <label htmlFor={`issue-${room.id}`}>Maintenance issue</label>
                        <select id={`issue-${room.id}`} aria-label={`Maintenance issue for Room ${room.roomNumber}`}
                          value={notes[room.id] || ''}
                          onChange={event => setNotes(current => ({ ...current, [room.id]: event.target.value }))}>
                          <option value="">Select an issue</option>
                          <option value="AC leaking">AC leaking</option>
                          <option value="Plumbing damage">Plumbing damage</option>
                          <option value="Other">Other</option>
                        </select>
                        <textarea aria-label={`Maintenance note for Room ${room.roomNumber}`}
                          value={notes[room.id] || ''}
                          onChange={event => setNotes(current => ({ ...current, [room.id]: event.target.value }))}
                          placeholder="Describe the issue (e.g. AC leaking)" maxLength={500} rows={2} />
                        <button type="button" className="housekeeping-danger" disabled={Boolean(busyRoom)}
                          onClick={() => setRoomStatus(room, 'maintenance', notes[room.id] || '')}>
                          {busyRoom === room.id ? 'Saving…' : 'Mark Out of Order'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
          {!visibleRooms.length && (
            <div className="housekeeping-empty" style={{ borderColor: palette.border, color: palette.muted }}>
              No rooms match this filter.
            </div>
          )}
        </section>
      </main>
    </PageLayout>
  );
}
