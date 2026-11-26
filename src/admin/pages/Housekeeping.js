import React, { useEffect, useMemo, useRef, useState } from 'react';
import { auth, db } from '../../firebase/firebase';
import { collection, query, where } from 'firebase/firestore';
import PageLayout from '../components/PageLayout';
import { useSettings } from '../components/SettingsContext';
import { enqueue, flushOutbox, getOutbox, subscribeOutbox } from '../lib/offlineOutbox';
import { subscribeCollection, subscribeLive } from '../lib/liveCollection';
import { sendStaffRequest } from '../lib/staffApi';
import './housekeeping.css';

const FILTERS = [
  { id: 'all', label: 'All rooms' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'cleaning', label: 'Cleaning' },
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

const ISSUE_TYPES = [
  { id: 'air-conditioning', label: 'Air conditioning / AC' },
  { id: 'plumbing', label: 'Plumbing' },
  { id: 'electrical', label: 'Electrical' },
  { id: 'other', label: 'Other' },
];
const reportDate = value => {
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  if (typeof value?._seconds === 'number') return new Date(value._seconds * 1000);
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
};

export default function Housekeeping() {
  const { settings } = useSettings();
  const dark = settings?.darkMode;
  const isHousekeeper = window.location.pathname.startsWith('/housekeeper');
  const [filter, setFilter] = useState(() => (isHousekeeper ? 'attention' : 'all'));
  const [rooms, setRooms] = useState([]);
  const [reports, setReports] = useState([]);
  const [roomType, setRoomType] = useState('all');
  const [reportFilter, setReportFilter] = useState('all');
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const [outbox, setOutbox] = useState(getOutbox);
  const [overrides, setOverrides] = useState({});
  const [syncedRooms, setSyncedRooms] = useState({});
  const [issueTypes, setIssueTypes] = useState({});
  const [notes, setNotes] = useState({});
  const [busyRoom, setBusyRoom] = useState('');
  const [error, setError] = useState('');
  const [reportError, setReportError] = useState('');
  const previousOutbox = useRef(getOutbox());

  useEffect(() => subscribeCollection('rooms',
    snapshot => setRooms(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))),
    loadError => {
      console.error('Housekeeping rooms could not be loaded:', loadError);
      setError('Rooms could not be loaded. Please reconnect and try again.');
    }), []);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return undefined;
    const key = isHousekeeper ? `maintenanceReports:housekeeper:${uid}` : 'maintenanceReports:staff';
    const makeQuery = () => isHousekeeper
      ? query(collection(db, 'maintenanceReports'), where('status', '==', 'open'))
      : collection(db, 'maintenanceReports');
    return subscribeLive(key, makeQuery, snapshot => {
      setReports(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
      setReportError('');
    }, loadError => {
      console.error('Maintenance reports could not be loaded:', loadError);
      setReportError('Maintenance reports could not be loaded. Check your connection or permissions.');
    });
  }, [isHousekeeper]);

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
    let active = true;
    const sync = async () => {
      const uid = auth.currentUser?.uid || '';
      const hasPendingHousekeeping = getOutbox().some(item => item.path === 'housekeeping'
        && item.status === 'pending'
        && (!item.uid || !uid || item.uid === uid));
      if (navigator.onLine === false || !hasPendingHousekeeping) return;
      try {
        await flushOutbox(sendStaffRequest, { uid });
      } catch (syncError) {
        console.error('Housekeeping changes could not sync:', syncError);
        if (active) setError('Saved room changes could not sync right now. They remain queued and will retry automatically.');
      }
    };
    const setConnection = () => {
      const isOnline = navigator.onLine !== false;
      setOnline(isOnline);
      if (isOnline) sync();
    };
    window.addEventListener('online', setConnection);
    window.addEventListener('offline', setConnection);
    const timer = setInterval(sync, 30000);
    if (navigator.onLine !== false) sync();
    return () => {
      active = false;
      clearInterval(timer);
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
      .forEach(item => {
        const status = item.body.action === 'report-issue' ? 'maintenance' : normalizeStatus(item.body.status);
        const maintenanceNote = item.body.action === 'report-issue' ? item.body.note : item.body.maintenanceNote;
        pending.set(item.body.roomId, { ...item, displayStatus: status, displayMaintenanceNote: maintenanceNote || '' });
      });
    return pending;
  }, [outbox]);

  const counts = useMemo(() => rooms.reduce((total, room) => {
    const queued = queuedByRoom.get(room.id);
    const status = overrides[room.id]?.status || (queued ? queued.displayStatus : normalizeStatus(room.status));
    total[status] = (total[status] || 0) + 1;
    return total;
  }, {}), [rooms, queuedByRoom, overrides]);

  const visibleRooms = useMemo(() => rooms
    .map(room => {
      const queued = queuedByRoom.get(room.id);
      const override = overrides[room.id];
      const status = override?.status || (queued ? queued.displayStatus : normalizeStatus(room.status));
      const maintenanceNote = override?.maintenanceNote ?? (queued?.displayMaintenanceNote ?? room.maintenanceNote ?? '');
      return { ...room, displayStatus: status, displayMaintenanceNote: maintenanceNote, queued };
    })
    .filter(room => filter === 'all'
      || (filter === 'attention' && ['cleaning', 'maintenance'].includes(room.displayStatus))
      || room.displayStatus === filter)
    .filter(room => roomType === 'all' || room.type === roomType)
    .sort((a, b) => String(a.roomNumber || '').localeCompare(String(b.roomNumber || ''), undefined, { numeric: true })), [rooms, queuedByRoom, overrides, filter, roomType]);

  const roomTypes = useMemo(() => [...new Set(rooms.map(room => String(room.type || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b)), [rooms]);

  const setRoomStatus = async (room, status) => {
    if (busyRoom || room.displayStatus === 'occupied') return;

    setError('');
    setBusyRoom(room.id);
    setSyncedRooms(current => {
      const next = { ...current };
      delete next[room.id];
      return next;
    });
    const override = { status, maintenanceNote: '' };
    setOverrides(current => ({ ...current, [room.id]: override }));
    try {
      const body = {
        action: 'set-room-status',
        roomId: room.id,
        status,
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

  const submitReport = async room => {
    if (busyRoom || room.displayStatus === 'occupied') return;
    const issueType = issueTypes[room.id] || '';
    const note = String(notes[room.id] || '').trim();
    if (!issueType || note.length < 3) {
      setError(`Choose an issue type and describe the problem for Room ${room.roomNumber}.`);
      return;
    }

    setError('');
    setBusyRoom(room.id);
    setSyncedRooms(current => {
      const next = { ...current };
      delete next[room.id];
      return next;
    });
    setOverrides(current => ({ ...current, [room.id]: { status: 'maintenance', maintenanceNote: note } }));
    try {
      const body = {
        action: 'report-issue',
        roomId: room.id,
        roomNumber: room.roomNumber,
        issueType,
        note,
      };
      const queued = enqueue('housekeeping', body, 'POST', auth.currentUser?.uid || '');
      if (!getOutbox().some(item => item.id === queued.id)) {
        throw new Error('This device could not save the report for offline sync. Check available storage and try again.');
      }
      if (navigator.onLine !== false) {
        await flushOutbox(sendStaffRequest, { uid: auth.currentUser?.uid || '' });
      }
    } catch (requestError) {
      console.error('Housekeeping maintenance report failed:', requestError);
      setOverrides(current => {
        const next = { ...current };
        delete next[room.id];
        return next;
      });
      setError(requestError.message || `A report for Room ${room.roomNumber} could not be saved.`);
    } finally {
      setBusyRoom('');
    }
  };

  const resolveReport = async (reportId, roomId) => {
    if (busyRoom) return;
    setError('');
    setBusyRoom(roomId || reportId);
    try {
      await sendStaffRequest('housekeeping-reports', { action: 'resolve-report', reportId });
    } catch (requestError) {
      console.error('Maintenance report resolution failed:', requestError);
      setError(requestError.message || 'The maintenance report could not be resolved.');
    } finally {
      setBusyRoom('');
    }
  };

  const localReports = useMemo(() => outbox
    .filter(item => item.path === 'housekeeping'
      && item.body?.action === 'report-issue'
      && (!auth.currentUser?.uid || !item.uid || item.uid === auth.currentUser.uid))
    .map(item => ({
      id: item.id,
      roomId: item.body.roomId,
      roomNumber: item.body.roomNumber || rooms.find(room => room.id === item.body.roomId)?.roomNumber || item.body.roomId,
      issueType: item.body.issueType,
      note: item.body.note,
      reportedByName: 'You',
      reportedByRole: isHousekeeper ? 'Housekeeper' : window.location.pathname.startsWith('/receptionist') ? 'Receptionist' : 'Admin',
      reportedAt: item.createdAt,
      status: 'pending',
      syncError: item.error,
    })), [outbox, rooms, isHousekeeper]);

  const visibleReports = useMemo(() => {
    const serverIds = new Set(reports.map(report => report.id));
    return [...reports, ...localReports.filter(report => !serverIds.has(report.id))]
      .filter(report => reportFilter === 'all'
        || (reportFilter === 'open' && ['open', 'pending'].includes(report.status))
        || (reportFilter === 'resolved' && report.status === 'resolved'))
      .sort((a, b) => reportDate(b.reportedAt) - reportDate(a.reportedAt));
  }, [reports, localReports, reportFilter]);

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
            <p>{isHousekeeper ? 'Update room readiness and report maintenance issues. Your updates sync automatically when you reconnect.' : 'Review room readiness and the latest maintenance reports.'}</p>
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
              <span>{item.id === 'all' ? rooms.length : item.id === 'attention'
                ? (counts.cleaning || 0) + (counts.maintenance || 0)
                : counts[item.id] || 0}</span>
            </button>
          ))}
          <label className="housekeeping-type-filter">
            Room type
            <select aria-label="Filter by room type" value={roomType} onChange={event => setRoomType(event.target.value)}>
              <option value="all">All types</option>
              {roomTypes.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
        </section>

        {error && <div className="housekeeping-error" role="alert">{error}</div>}
        {!online && (
          <div className="housekeeping-offline-note">
            Updates and reports appear immediately on this phone. Pending changes are sent automatically when the connection returns.
          </div>
        )}

        <section className="housekeeping-grid" aria-label="Room list">
          {visibleRooms.map(room => {
            const isOccupied = room.displayStatus === 'occupied';
            const failed = room.queued?.status === 'failed';
            const syncLabel = room.queued
              ? (failed ? 'Sync needs attention' : 'Saved Offline (Pending Sync)')
              : (syncedRooms[room.id] ? 'Synced' : '');
            const maintenanceReport = reports.find(report => report.id === room.maintenanceReportId)
              || reports.find(report => (room.openMaintenanceReportIds || []).includes(report.id));
            return (
              <article key={room.id} className="housekeeping-card" style={{ background: palette.card, borderColor: palette.border }}>
                <div className="housekeeping-card-heading">
                  <div>
                    <h2>Room {room.roomNumber || room.id}</h2>
                    <p>{room.type || 'Room'}{room.floor ? ` · ${room.floor === 'ground' ? 'Ground floor' : room.floor === 'upper' ? 'Upper floor' : room.floor}` : ''}</p>
                  </div>
                  <span className={`housekeeping-status status-${room.displayStatus}`}>{statusLabel(room.displayStatus)}</span>
                </div>

                {room.displayStatus === 'maintenance' && (maintenanceReport || room.displayMaintenanceNote) && (
                  <div className="housekeeping-maintenance-note">
                    <strong>{ISSUE_TYPES.find(item => item.id === maintenanceReport?.issueType)?.label || 'Issue'}:</strong>{' '}
                    {maintenanceReport?.note || room.displayMaintenanceNote}
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
                    {!isHousekeeper && room.displayStatus === 'available' && (
                      <button type="button" className="housekeeping-primary" disabled={Boolean(busyRoom)}
                        onClick={() => setRoomStatus(room, 'cleaning')}>
                        {busyRoom === room.id ? 'Sending…' : 'Notify Housekeeper to Clean'}
                      </button>
                    )}
                    {room.displayStatus === 'cleaning' && (
                      <button type="button" className="housekeeping-primary" disabled={Boolean(busyRoom)}
                        onClick={() => setRoomStatus(room, 'available')}>
                        {busyRoom === room.id ? 'Saving…' : 'Mark as Available'}
                      </button>
                    )}
                    {room.displayStatus === 'maintenance' && (
                      isHousekeeper
                        ? <p className="housekeeping-readonly">Only a receptionist or administrator can clear an out-of-order room.</p>
                        : room.queued?.body.action === 'report-issue'
                          ? <p className="housekeeping-readonly">The room will be blocked as soon as this report syncs.</p>
                          : <button type="button" className="housekeeping-primary" disabled={Boolean(busyRoom)}
                            onClick={() => room.maintenanceReportId
                              ? resolveReport(room.maintenanceReportId, room.id)
                              : setRoomStatus(room, 'available')}>
                            {busyRoom === room.id ? 'Saving…' : 'Mark Repaired & Available'}
                          </button>
                    )}
                    <div className="housekeeping-report">
                      <label htmlFor={`issue-${room.id}`}>Report a maintenance issue</label>
                      <select id={`issue-${room.id}`} aria-label={`Maintenance issue type for Room ${room.roomNumber}`}
                        value={issueTypes[room.id] || ''}
                        onChange={event => setIssueTypes(current => ({ ...current, [room.id]: event.target.value }))}>
                        <option value="">Select issue type</option>
                        {ISSUE_TYPES.map(issue => <option key={issue.id} value={issue.id}>{issue.label}</option>)}
                      </select>
                      <textarea aria-label={`Maintenance note for Room ${room.roomNumber}`}
                        value={notes[room.id] || ''}
                        onChange={event => setNotes(current => ({ ...current, [room.id]: event.target.value }))}
                        placeholder="Describe the problem (e.g. AC is leaking)" maxLength={500} rows={2} />
                      <button type="button" className="housekeeping-danger" disabled={Boolean(busyRoom)}
                        onClick={() => submitReport(room)}>
                        {busyRoom === room.id ? 'Saving…' : 'Report Issue & Block Room'}
                      </button>
                    </div>
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

        <section className="housekeeping-reports" aria-labelledby="maintenance-reports-heading">
          <div className="housekeeping-reports-heading">
            <div>
              <div className="housekeeping-eyebrow">SHARED STAFF INBOX</div>
              <h2 id="maintenance-reports-heading">{isHousekeeper ? 'My maintenance reports' : 'Maintenance reports'}</h2>
              <p>{isHousekeeper ? 'Track reports you submitted.' : 'Reports from housekeepers are shared here in real time.'}</p>
            </div>
            <div className="housekeeping-report-filters" aria-label="Filter maintenance reports">
              {[
                { id: 'all', label: 'All' },
                { id: 'open', label: 'Open' },
                { id: 'resolved', label: 'Resolved' },
              ].map(item => (
                <button key={item.id} type="button" aria-pressed={reportFilter === item.id}
                  className={`housekeeping-filter ${reportFilter === item.id ? 'is-active' : ''}`}
                  onClick={() => setReportFilter(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {reportError && <div className="housekeeping-error" role="alert">{reportError}</div>}
          {visibleReports.length ? (
            <div className="housekeeping-report-list">
              {visibleReports.map(report => {
                const issue = ISSUE_TYPES.find(item => item.id === report.issueType)?.label || report.issueType || 'Maintenance';
                const pending = report.status === 'pending';
                return (
                  <article key={report.id} className="housekeeping-report-card" style={{ background: palette.card, borderColor: palette.border }}>
                    <div className="housekeeping-report-card-top">
                      <div>
                        <h3>Room {report.roomNumber || report.roomId}</h3>
                        <p>{issue} · {reportDate(report.reportedAt).toLocaleString()}</p>
                      </div>
                      <span className={`housekeeping-status ${report.status === 'resolved' ? 'status-available' : pending ? 'status-cleaning' : 'status-maintenance'}`}>
                        {pending ? 'Saved Offline (Pending Sync)' : report.status === 'resolved' ? 'Resolved' : 'Open'}
                      </span>
                    </div>
                    <p className="housekeeping-report-note">{report.note}</p>
                    <div className="housekeeping-report-meta">
                      Reported by {report.reportedByName || 'Staff member'}{report.reportedByRole ? ` · ${report.reportedByRole}` : ''}
                    </div>
                    {report.syncError && <div className="housekeeping-report-meta">Retrying: {report.syncError}</div>}
                    {!isHousekeeper && report.status === 'open' && (
                      <button type="button" className="housekeeping-primary housekeeping-resolve-button" disabled={Boolean(busyRoom)}
                        onClick={() => resolveReport(report.id, report.roomId)}>
                        {busyRoom === report.roomId ? 'Saving…' : 'Mark Resolved & Release Room'}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="housekeeping-empty" style={{ borderColor: palette.border, color: palette.muted }}>
              No {reportFilter === 'all' ? '' : `${reportFilter} `}maintenance reports.
            </div>
          )}
        </section>
      </main>
    </PageLayout>
  );
}
