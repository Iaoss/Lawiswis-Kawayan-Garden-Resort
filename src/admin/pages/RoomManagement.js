import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../../firebase/firebase';
import { onSnapshot, collection, addDoc, updateDoc, deleteDoc, doc, query, where } from 'firebase/firestore';
import PageLayout from '../components/PageLayout';
import RoomExcelImport from '../components/RoomExcelImport';
import { logStaffActivity } from '../lib/activityLog';
import { useSettings } from '../components/SettingsContext';
import { ROOM_TYPES, ROOM_TYPE_CATEGORY_MAP, normalizeRoomType } from '../utils/roomCatalog';
import { resolveRoomImage } from '../../client/components/clientTheme';
import { uploadImage } from '../lib/uploadImage';
import SeasonalRatesManager from '../components/SeasonalRatesManager';
import { formatSeasonDates, getCurrentOrNextSeason, normalizeSeasonPeriods, seasonalNightlyRate } from '../../lib/seasonalRates';
import { money } from '../lib/money';
import { formatClockLabel, getRoomsNotReadyForArrivals } from '../lib/roomReadiness';
import { manilaDateKey } from '../../lib/reservationStatus';
import { subscribeCollection, subscribeLive } from '../lib/liveCollection';

// ── Cloudinary config ────────────────────────────────────────
// Photos upload through the server, so no Cloudinary setting is in the page.
const uploadToCloudinary = file => uploadImage(file, 'room');

const LIME  = '#9cb56f';
const DARK  = '#0a1a0a';

const ROOM_META = {
  Standard: { size: '25m²', bed: 'Queen Bed',     guests: '2 guests',       defaultDesc: 'Comfortable, affordable stay for solo travelers or couples.', features: ['Queen bed','Work desk','En-suite bathroom','Essential amenities'], facilities: ['High-speed Wi-Fi','Flat-screen TV','Air conditioning','In-room safe','Coffee/tea maker','Mini-fridge'] },
  Deluxe:   { size: '35m²', bed: 'King Bed',      guests: '2 guests',       defaultDesc: 'Romantic rooms designed for couples. King bed, separate seating, larger desk.', features: ['Private balcony','Work desk','Spacious layout','Large windows'], facilities: ['High-speed Wi-Fi','Flat-screen TV','Air conditioning','In-room safe','Coffee/tea maker','Mini-fridge'] },
  FamilyRoom: { size: '45–55m²', bed: '2 Queen Beds (+ Sofa Bed for 6)', guests: 'Up to 6 guests', defaultDesc: 'Spacious rooms for families of 4 or 6. Two queen beds (plus sofa bed for larger groups), seating area, 50-inch TV.', features: ['2 Queen beds','Seating area','50-inch TV','En-suite bathroom'], facilities: ['High-speed Wi-Fi','Flat-screen TV','Air conditioning','In-room safe','Coffee/tea maker','Extra beds'] },
  JuniorSuite4:      { size: '50m²', bed: 'King Bed',                 guests: 'Up to 4 guests',  defaultDesc: 'Junior suites with living area for up to 4.', features: ['Separate living room','King bed','Work desk','Premium furnishings'], facilities: ['High-speed Wi-Fi','Flat-screen TV','Air conditioning','Jacuzzi','Coffee/tea maker','Mini-fridge'] },
  FamilySuite:       { size: '55–65m²', bed: 'King or 2 Queen Beds + Sofa Bed', guests: 'Up to 6 guests', defaultDesc: 'Full suite with family amenities for 4 or 6 guests.', features: ['Separate living room','Kitchenette','Premium furnishings','Extra beds available'], facilities: ['High-speed Wi-Fi','Flat-screen TV','Air conditioning','Jacuzzi','Coffee/tea maker','Mini-fridge'] },
  PresidentialSuite: { size: '90m²+', bed: 'Multiple Beds',           guests: 'Up to 12 guests', defaultDesc: 'Premium presidential suite for large groups. Private living room, full kitchen, garden.', features: ['Private living room','Full kitchen','Garden','Multiple bedrooms'], facilities: ['High-speed Wi-Fi','Smart TV','Air conditioning','Private pool','Kitchen','BBQ area'] },
  MainVilla:         { size: '150m²+', bed: 'Multiple Beds',         guests: 'Up to 25 guests', defaultDesc: 'The iconic Main Villa with full kitchen \u2014 the resort\u2019s largest and most exclusive accommodation, ideal for reunions, events, and large groups.', features: ['Private pool','Full kitchen','Event space','Multiple bedrooms'], facilities: ['High-speed Wi-Fi','Smart TV','Air conditioning','Private pool','Full kitchen','BBQ & event area'] },
};

const TYPE_CATEGORY_MAP = ROOM_TYPE_CATEGORY_MAP;

// Solid pills shown on top of the room photo
const STATUS_PILL = {
  vacant:      '#16a34a',
  available:   '#16a34a',
  occupied:    '#dc2626',
  cleaning:    '#d97706',
  maintenance: '#64748b',
};
const PULSING_STATUSES = new Set(['occupied', 'cleaning']);
const badgeLabel = (s) => ({ vacant: 'Available', occupied: 'Occupied', cleaning: 'Cleaning', maintenance: 'Maintenance', available: 'Available' })[s] || s;

const CheckIcon = () => (
  <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'rgba(200,240,110,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
    <i className="ti ti-check" style={{ fontSize: 9, color: LIME }} />
  </div>
);

const StatusDot = ({ pulse }) => (
  <motion.span
    animate={pulse ? { opacity: [1, 0.35, 1] } : {}}
    transition={pulse ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : {}}
    style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', display: 'inline-block', flexShrink: 0 }}
  />
);



const panelVariants = {
  hidden:  { opacity: 0, height: 0 },
  visible: { opacity: 1, height: 'auto', transition: { duration: 0.25, ease: 'easeOut' } },
  exit:    { opacity: 0, height: 0, transition: { duration: 0.2, ease: 'easeIn' } },
};
const headerVariants = {
  hidden: { opacity: 0, y: -8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
};
const roomCardVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: (i) => ({ opacity: 1, y: 0, transition: { delay: Math.min(i, 10) * 0.035, duration: 0.32, ease: 'easeOut' } }),
};
const backdropVariants = { hidden: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0 } };
const modalVariants = {
  hidden: { opacity: 0, scale: 0.94, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
  exit: { opacity: 0, scale: 0.96, y: 6, transition: { duration: 0.15 } },
};

const CAPACITY_OPTIONS = {
  Standard: [2],
  Deluxe: [2],
  FamilyRoom: [4, 6],
  JuniorSuite4: [4],
  FamilySuite: [4, 6],
  PresidentialSuite: [8],
  MainVilla: [20],
};

const emptyForm = { roomNumber: '', type: '', baseCapacity: '', price: '', status: 'vacant', amenities: '', description: '', imageUrl: '' };

// Activity Log line for a room save; price and status changes are spelled out.
function describeRoomSave(before, after) {
  if (!before) return `Added Room ${after.roomNumber} (${after.type}, ${money(Number(after.price || 0))})`;
  const changes = [];
  if (Number(before.price) !== Number(after.price)) changes.push(`price ${money(Number(before.price || 0))} → ${money(Number(after.price || 0))}`);
  if (before.status !== after.status) changes.push(`status ${badgeLabel(before.status)} → ${badgeLabel(after.status)}`);
  return `Updated Room ${after.roomNumber}${changes.length ? `: ${changes.join(', ')}` : ''}`;
}

export default function RoomManagement() {
  const { settings } = useSettings();
  const dark = settings?.darkMode;
  const isReceptionist = window.location.pathname.startsWith('/receptionist');

  const BG      = dark ? '#020b09' : '#f9fafb';
  const CARD    = dark ? '#1c1c1c' : '#ffffff';
  const BORDER  = dark ? '#282827' : '#e5e7eb';
  const TEXT    = dark ? '#e8e8d8' : '#111827';
  const MUTED   = dark ? '#5a5a4a' : '#9ca3af';
  const SUBTEXT = dark ? '#8a8a7a' : '#6b7280';
  const INPUT_BG= dark ? '#282827' : '#ffffff';
  const HOVER   = dark ? '#282827' : '#f3f4f6';

  const [rooms, setRooms]           = useState([]);
  const [showForm, setShowForm]     = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editRoom, setEditRoom]     = useState(null);
  const [openId, setOpenId]         = useState(null);   // room whose details window is open
  // Holiday / peak-season rate happening now or coming up, shown on the cards.
  const [seasonPeriods, setSeasonPeriods] = useState([]);
  useEffect(() => onSnapshot(doc(db, 'settings', 'seasonalRates'),
    snapshot => setSeasonPeriods(normalizeSeasonPeriods(snapshot.data())),
    () => setSeasonPeriods([])), []);
  // Today's arrivals, to warn when their room is still being cleaned.
  const [arrivalsToday, setArrivalsToday] = useState([]);
  useEffect(() => {
    const today = manilaDateKey();
    return subscribeLive(`bell:arrivingToday:${today}`, () => query(collection(db, 'reservations'), where('checkIn', '>=', today), where('checkIn', '<=', `${today}`)),
      snapshot => setArrivalsToday(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => setArrivalsToday([]));
  }, []);
  const season = getCurrentOrNextSeason(seasonPeriods, new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10));
  // Escape closes the details window.
  useEffect(() => {
    if (!openId) return undefined;
    const onKey = event => { if (event.key === 'Escape') setOpenId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId]);
  const [menuId, setMenuId]         = useState(null);   // which card's ⋯ menu is open
  const [search, setSearch]         = useState('');
  const [filterType, setFilterType] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy]         = useState('name');
  const [form, setForm] = useState(emptyForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // ── Image upload state ──────────────────────────────────────
  const [imageFile, setImageFile]       = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [removeImage, setRemoveImage]   = useState(false);
  const [uploading, setUploading]       = useState(false);
  const [uploadError, setUploadError]   = useState('');

  // Shared live list of rooms: updates by itself after any change, and
  // reopening this page reads nothing again.
  const fetchRooms = useCallback(async () => {}, []);
  useEffect(() => subscribeCollection('rooms',
    snapshot => setRooms(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))),
    error => console.error('Rooms could not be loaded:', error)), []);

  useEffect(() => {
    return () => { if (imagePreview) URL.revokeObjectURL(imagePreview); };
  }, [imagePreview]);

  // Close the ⋯ menu on any outside click
  useEffect(() => {
    if (!menuId) return undefined;
    const close = () => setMenuId(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuId]);

  const resetImageState = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview('');
    setRemoveImage(false);
    setUploadError('');
  };

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setRemoveImage(false);
    setUploadError('');
  };

  const handleRemoveImageClick = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview('');
    setRemoveImage(true);
  };

  const handleSubmit = async () => {
    if (!form.roomNumber || !form.type || !form.price) return;
    if (isReceptionist && !editRoom) return;

    let imageUrl = form.imageUrl || '';

    try {
      if (imageFile) {
        setUploading(true);
        setUploadError('');
        imageUrl = await uploadToCloudinary(imageFile);
        setUploading(false);
      } else if (removeImage) {
        // Just clear the field — unsigned uploads can't be deleted from Cloudinary without server-side signing.
        imageUrl = '';
      }

      const payload = { ...form, baseCapacity: Number(form.baseCapacity) || '', imageUrl };
      if (editRoom) await updateDoc(doc(db, 'rooms', editRoom.id), payload);
      else await addDoc(collection(db, 'rooms'), payload);
      logStaffActivity(editRoom ? 'room_updated' : 'room_created', describeRoomSave(editRoom, payload));

      setForm(emptyForm);
      resetImageState();
      setShowForm(false); setEditRoom(null); fetchRooms();
    } catch (err) {
      setUploading(false);
      console.error('Failed to save room:', err);
      setUploadError('Image upload failed. Please check your connection and try again.');
    }
  };

  const handleEdit = (room) => {
    if (isReceptionist) return;
    setOpenId(null); // close the room's details window first
    setEditRoom(room); setForm({ ...emptyForm, ...room }); setShowForm(true); setShowImport(false);
    resetImageState();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const requestDelete = (id) => {
    if (isReceptionist) return;
    setOpenId(null); // close the room's details window first
    setConfirmDeleteId(id);
  };

  const confirmDelete = async () => {
    if (isReceptionist || !confirmDeleteId) return;
    await deleteDoc(doc(db, 'rooms', confirmDeleteId));
    const deleted = rooms.find(r => r.id === confirmDeleteId);
    logStaffActivity('room_deleted', `Deleted Room ${deleted?.roomNumber || confirmDeleteId}`);
    setOpenId(null);
    setConfirmDeleteId(null);
    fetchRooms();
  };

  // Any staff member can set a room's status from its card. (Check-in and
  // check-out also set Occupied and Cleaning automatically.)
  const [statusError, setStatusError] = useState('');
  const changeStatus = async (room, status) => {
    const current = room.status === 'vacant' ? 'available' : room.status;
    if (!status || status === current) return;
    setStatusError('');
    try {
      await updateDoc(doc(db, 'rooms', room.id), { status });
      logStaffActivity('room_status_changed', `Changed Room ${room.roomNumber} from ${badgeLabel(room.status)} to ${badgeLabel(status)}`);
      fetchRooms();
    } catch (error) {
      console.error('Could not change room status:', error);
      setStatusError(`Room ${room.roomNumber}'s status could not be changed. Please try again.`);
    }
  };

  const markCleaned = async (room) => {
    await updateDoc(doc(db, 'rooms', room.id), { status: 'available' });
    logStaffActivity('room_status_changed', `Marked Room ${room.roomNumber} as available (was ${room.status})`);
    fetchRooms();
  };

  // ── Filters, tabs, sorting ──
  const isAvailable = (r) => ['vacant', 'available'].includes(r.status);
  const isMaintenance = (r) => ['maintenance', 'cleaning'].includes(r.status);
  const statusTabs = [
    { value: '',            label: 'All Status',  count: rooms.length },
    { value: 'available',   label: 'Available',   count: rooms.filter(isAvailable).length },
    { value: 'occupied',    label: 'Occupied',    count: rooms.filter(r => r.status === 'occupied').length },
    { value: 'maintenance', label: 'Maintenance', count: rooms.filter(isMaintenance).length },
  ];

  const filtered = rooms.filter(r => {
    const normalizedType = normalizeRoomType(r.type);
    const q = search.toLowerCase();
    const matchesSearch = (
      r.roomNumber?.toLowerCase().includes(q) ||
      r.type?.toLowerCase().includes(q) ||
      normalizedType?.toLowerCase().includes(q)
    );
    const matchesType = filterType ? (normalizedType === filterType || r.type === filterType) : true;
    const matchesStatus = statusFilter === 'available' ? isAvailable(r)
      : statusFilter === 'maintenance' ? isMaintenance(r)
      : statusFilter ? r.status === statusFilter : true;
    return matchesSearch && matchesType && matchesStatus;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'price-asc') return Number(a.price) - Number(b.price);
    if (sortBy === 'price-desc') return Number(b.price) - Number(a.price);
    return String(a.roomNumber).localeCompare(String(b.roomNumber), undefined, { numeric: true });
  });

  const inputStyle = {
    width: '100%', padding: '9px 12px',
    border: `1px solid ${BORDER}`, borderRadius: 8,
    fontSize: 12, fontFamily: 'inherit', outline: 'none',
    background: INPUT_BG, color: TEXT, boxSizing: 'border-box',
  };

  const deleteTargetRoom = rooms.find(r => r.id === confirmDeleteId);
  const formImagePreviewSrc = imagePreview || (removeImage ? '' : form.imageUrl);

  // ── One room card ──
  const renderCard = (room, i) => {
    const m = ROOM_META[room.type] || {};
    const open = openId === room.id;
    const photoUrl = resolveRoomImage(room);
    const pill = STATUS_PILL[room.status] || STATUS_PILL.maintenance;
    const rows = [
      ['Bed', m.bed],
      ['Guests', room.baseCapacity ? `${room.baseCapacity} guests` : m.guests],
      ['Size', m.size],
    ].filter(r => r[1]);

    return (
      <motion.div key={room.id} custom={i} variants={roomCardVariants} initial="hidden" animate="visible"
        onClick={() => setOpenId(room.id)}
        style={{
          background: CARD, borderRadius: 16, padding: 10, cursor: 'pointer',
          border: open ? `2px solid ${LIME}` : `1px solid ${BORDER}`,
          transition: 'box-shadow .3s, border-color .3s',
        }}>
        {/* Photo with status pill + ⋯ menu */}
        <div style={{
          position: 'relative', height: 150, borderRadius: 12, overflow: 'hidden',
          background: photoUrl ? `url(${photoUrl}) center/cover no-repeat` : (dark ? '#282827' : '#f1f5f1'),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {!photoUrl && <i className="ti ti-bed" style={{ fontSize: 44, color: dark ? LIME : '#4a7c59' }} />}
          <span style={{ position: 'absolute', top: 10, left: 10, background: pill, color: '#fff', padding: '3px 10px 3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <StatusDot pulse={PULSING_STATUSES.has(room.status)} />{badgeLabel(room.status)}
          </span>
          {!isReceptionist && (
            <div style={{ position: 'absolute', top: 8, right: 8 }}>
              <button type="button" aria-label="Room actions"
                onClick={e => { e.stopPropagation(); setMenuId(menuId === room.id ? null : room.id); }}
                style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.92)', color: '#111', cursor: 'pointer', fontSize: 14, lineHeight: 1, fontWeight: 700 }}>⋯</button>
              {menuId === room.id && (
                <div onClick={e => e.stopPropagation()}
                  style={{ position: 'absolute', top: 32, right: 0, minWidth: 120, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, boxShadow: '0 10px 28px rgba(0,0,0,0.25)', padding: 4, zIndex: 5 }}>
                  <button type="button" onClick={() => { setMenuId(null); handleEdit(room); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '8px 10px', fontSize: 12, color: TEXT, cursor: 'pointer', fontFamily: 'inherit', borderRadius: 6 }}><i className="ti ti-pencil" aria-hidden="true" style={{ marginRight: 6, verticalAlign: '-2px' }} />Edit</button>
                  <button type="button" onClick={() => { setMenuId(null); requestDelete(room.id); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '8px 10px', fontSize: 12, color: '#f87171', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 6 }}><i className="ti ti-trash" aria-hidden="true" style={{ marginRight: 6, verticalAlign: '-2px' }} />Delete</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Summary */}
        <div style={{ padding: '12px 4px 2px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>{room.roomNumber}</div>
          <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>#{room.id.slice(0, 6).toUpperCase()} · {room.type}</div>
          <div style={{ height: 1, background: BORDER, margin: '10px 0' }} />
          {rows.map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, marginBottom: 5 }}>
              <span style={{ color: MUTED }}>{label}</span>
              <span style={{ color: TEXT, textAlign: 'right' }}>{value}</span>
            </div>
          ))}
          <div style={{ height: 1, background: BORDER, margin: '10px 0' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 17, fontWeight: 800, color: dark ? LIME : '#111' }}>
              {money(Number(room.price))}<span style={{ fontSize: 10, fontWeight: 400, color: MUTED }}>/night</span>
            </span>
            <span style={{ fontSize: 10, color: SUBTEXT, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              Details <i className="ti ti-arrow-up-right" style={{ fontSize: 12 }} />
            </span>
          </div>
          {season && Number(room.price) > 0 && (
            <div title={`${season.name}: ${season.percent > 0 ? '+' : ''}${season.percent}% on nights from ${season.from} to ${season.to}`}
              style={{ marginTop: 6, fontSize: 10.5, fontWeight: 600, color: season.percent > 0 ? '#b45309' : '#15803d', display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="ti ti-calendar-dollar" aria-hidden="true" />
              {money(seasonalNightlyRate(room.price, season))}/night on {formatSeasonDates(season)} ({season.percent > 0 ? '+' : ''}{season.percent}%)
            </div>
          )}
        </div>

      </motion.div>
    );
  };


  // ── Details window for one room (opens over a blurred page) ──
  const renderDetails = room => {
    const m = ROOM_META[room.type] || {};
    const photoUrl = resolveRoomImage(room);
    const pill = STATUS_PILL[room.status] || STATUS_PILL.maintenance;
    const amenities = room.amenities
      ? room.amenities.split(',').map(a => a.trim()).filter(Boolean)
      : (m.facilities || []);
    return (
      <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpenId(null); }}
        style={{ position: 'fixed', inset: 0, zIndex: 1100, background: dark ? 'rgba(0,0,0,0.55)' : 'rgba(15,23,20,0.35)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'grid', placeItems: 'center', padding: 16 }}>
        <section role="dialog" aria-modal="true" aria-label={`Room ${room.roomNumber}`}
          style={{ width: '100%', maxWidth: 560, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 18, boxShadow: '0 24px 70px rgba(0,0,0,0.35)', fontFamily: "'Poppins', sans-serif" }}>
          <div style={{ position: 'relative', height: 220, background: photoUrl ? `url(${photoUrl}) center/cover no-repeat` : (dark ? '#282827' : '#f1f5f1'), borderRadius: '18px 18px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {!photoUrl && <i className="ti ti-bed" style={{ fontSize: 52, color: dark ? LIME : '#4a7c59' }} />}
            <span style={{ position: 'absolute', top: 12, left: 12, background: pill, color: '#fff', padding: '4px 11px 4px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <StatusDot pulse={PULSING_STATUSES.has(room.status)} />{badgeLabel(room.status)}
            </span>
            <button type="button" aria-label="Close" onClick={() => setOpenId(null)}
              style={{ position: 'absolute', top: 10, right: 10, width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.92)', color: '#111', fontSize: 18, cursor: 'pointer' }}>×</button>
          </div>
          <div style={{ padding: '16px 20px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div style={{ fontSize: 19, fontWeight: 700, color: TEXT }}>{room.roomNumber}</div>
              <div style={{ fontSize: 11, color: MUTED }}>#{room.id.slice(0, 6).toUpperCase()} · {room.type}{m.bed ? ` · ${m.bed}` : ''}{m.size ? ` · ${m.size}` : ''}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 19, fontWeight: 800, color: dark ? LIME : '#111' }}>{money(Number(room.price))}<span style={{ fontSize: 11, fontWeight: 400, color: MUTED }}>/night</span></div>
              {season && Number(room.price) > 0 && (
                <div style={{ fontSize: 11, fontWeight: 600, color: season.percent > 0 ? '#b45309' : '#15803d' }}>
                  {money(seasonalNightlyRate(room.price, season))} on {formatSeasonDates(season)} · {season.name}
                </div>
              )}
            </div>
          </div>
          <div style={{ padding: '0 16px 10px' }}>
          <div style={{ padding: '14px 4px 4px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 11, color: dark ? '#89D7B7' : '#428475', fontWeight: 500 }}><i className="ti ti-folder" aria-hidden="true" style={{ marginRight: 6, verticalAlign: '-2px' }} />{TYPE_CATEGORY_MAP[room.type] || '—'}</div>
            <p style={{ fontSize: 11, color: SUBTEXT, lineHeight: 1.7, margin: 0 }}>{room.description || m.defaultDesc || 'No description yet.'}</p>

            {m.features?.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, marginBottom: 8 }}>Features</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {m.features.map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: SUBTEXT }}><CheckIcon />{f}</div>
                  ))}
                </div>
              </div>
            )}

            {amenities.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, marginBottom: 8 }}>Amenities</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {amenities.map(a => (
                    <div key={a} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: SUBTEXT }}><CheckIcon />{a}</div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingBottom: 6, alignItems: 'center' }}>
              <select
                aria-label={`Status of Room ${room.roomNumber}`}
                value={room.status === 'vacant' ? 'available' : (room.status || 'available')}
                onChange={event => changeStatus(room, event.target.value)}
                style={{ padding: '6px 10px', background: HOVER, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: TEXT }}
              >
                <option value="available">Available</option>
                <option value="occupied">Occupied</option>
                <option value="cleaning">Cleaning</option>
                <option value="maintenance">Maintenance</option>
              </select>
              {['cleaning', 'maintenance'].includes(room.status) && (
                <button type="button" onClick={() => markCleaned(room)}
                  style={{ padding: '7px 14px', background: LIME, border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: DARK }}>
                  Mark as Cleaned
                </button>
              )}
              {!isReceptionist && (
                <>
                  <button type="button" onClick={() => handleEdit(room)}
                    style={{ padding: '7px 14px', background: HOVER, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: TEXT }}>
                    Edit
                  </button>
                  <button type="button" onClick={() => requestDelete(room.id)}
                    style={{ padding: '7px 14px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#f87171' }}>
                    <i className="ti ti-trash" aria-hidden="true" style={{ marginRight: 6, verticalAlign: '-2px' }} />Delete
                  </button>
                </>
              )}
            </div>
          </div>
                  </div>
        </section>
      </div>
    );
  };

  return (
    <PageLayout>
      <div style={{ fontFamily: "'Poppins', sans-serif", background: BG, minHeight: '100vh', padding: 20 }}>

        {/* ── Page header ── */}
        <motion.div variants={headerVariants} initial="hidden" animate="visible" style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: TEXT }}>Rooms</div>
          <div style={{ fontSize: 12, color: SUBTEXT, marginTop: 2 }}>
            {rooms.length} room{rooms.length === 1 ? '' : 's'} total · click a room to see its details
          </div>
        </motion.div>

        {/* ── Holiday / peak-season prices (admins) ── */}
        {!isReceptionist && (
          <SeasonalRatesManager colors={{ CARD, BORDER, TEXT, SUBTEXT, INPUT_BG, ACCENT: settings?.accentColor || '#9cb56f' }} />
        )}

        {/* ── Add/Edit Form ── */}
        <AnimatePresence initial={false}>
          {showForm && (
            <motion.div variants={panelVariants} initial="hidden" animate="visible" exit="exit" style={{ overflow: 'hidden' }}>
              <div style={{ background: CARD, borderRadius: 18, padding: '20px 22px', border: `1px solid ${BORDER}`, marginBottom: 16, boxShadow: dark ? '0 8px 32px rgba(0,0,0,0.4)' : '0 2px 12px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 16 }}>
                  {editRoom ? <><i className="ti ti-pencil" aria-hidden="true" style={{ marginRight: 6, verticalAlign: '-2px' }} />Edit Room</> : <><i className="ti ti-plus" aria-hidden="true" style={{ marginRight: 6, verticalAlign: '-2px' }} />Add New Room</>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[
                    { label: 'Room Name / Number', key: 'roomNumber', placeholder: 'e.g. Panaginip, 101' },
                    { label: 'Price per night (₱)', key: 'price', type: 'number', placeholder: 'e.g. 3000' },
                    { label: 'Amenities', key: 'amenities', placeholder: 'AC, TV, WiFi' },
                    { label: 'Description', key: 'description', placeholder: 'Short description' },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={{ fontSize: 11, color: SUBTEXT, marginBottom: 5, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.label}</label>
                      <input style={inputStyle} type={f.type || 'text'} value={form[f.key]} placeholder={f.placeholder}
                        onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
                    </div>
                  ))}
                  <div>
                    <label style={{ fontSize: 11, color: SUBTEXT, marginBottom: 5, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Room Type</label>
                    <select style={inputStyle} value={form.type} onChange={e => {
                      const type = e.target.value;
                      const capacities = CAPACITY_OPTIONS[type] || [];
                      setForm(previous => ({
                        ...previous,
                        type,
                        baseCapacity: capacities.includes(Number(previous.baseCapacity)) ? previous.baseCapacity : (capacities[0] || ''),
                      }));
                    }}>
                      <option value="">Select type</option>
                      {ROOM_TYPES.map(t => <option key={t} value={t}>{t} — {TYPE_CATEGORY_MAP[t]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: SUBTEXT, marginBottom: 5, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Base Guest Capacity</label>
                    <select style={inputStyle} value={form.baseCapacity || ''} onChange={e => setForm({ ...form, baseCapacity: e.target.value })}>
                      <option value="">Select capacity</option>
                      {(CAPACITY_OPTIONS[form.type] || []).map(capacity => (
                        <option key={capacity} value={capacity}>{capacity} guests</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: SUBTEXT, marginBottom: 5, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</label>
                    <select style={inputStyle} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                      <option value="vacant">Vacant (Available)</option>
                      <option value="occupied">Occupied</option>
                      <option value="cleaning">Cleaning</option>
                      <option value="maintenance">Maintenance</option>
                    </select>
                  </div>

                  {/* ── Room Photo: upload / replace / remove (via Cloudinary) ── */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: 11, color: SUBTEXT, marginBottom: 5, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Room Photo</label>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <div style={{
                        width: 160, height: 100, borderRadius: 10, flexShrink: 0,
                        border: `1px solid ${BORDER}`, overflow: 'hidden',
                        background: formImagePreviewSrc ? `url(${formImagePreviewSrc}) center/cover no-repeat` : (dark ? '#282827' : '#f8faf8'),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {!formImagePreviewSrc && <i className="ti ti-photo" style={{ fontSize: 26, color: MUTED }} />}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <input type="file" accept="image/*" onChange={handleImageSelect} style={{ fontSize: 11, color: SUBTEXT, fontFamily: 'inherit' }} />
                        {formImagePreviewSrc && (
                          <button type="button" onClick={handleRemoveImageClick}
                            style={{ padding: '6px 12px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, color: '#f87171', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', width: 'fit-content' }}>
                            ✕ Remove Photo
                          </button>
                        )}
                        {uploading && <div style={{ fontSize: 11, color: MUTED }}>Uploading image…</div>}
                        {uploadError && <div style={{ fontSize: 11, color: '#f87171' }}>{uploadError}</div>}
                        {!formImagePreviewSrc && !uploading && (
                          <div style={{ fontSize: 10, color: MUTED, maxWidth: 260 }}>
                            No photo uploaded yet — the resort's default photo for this room name will be used if one exists.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
                    <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handleSubmit} disabled={uploading}
                      style={{ padding: '9px 22px', background: LIME, border: 'none', borderRadius: 8, color: DARK, fontSize: 12, fontWeight: 700, cursor: uploading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: uploading ? 0.7 : 1 }}>
                      {uploading ? 'Uploading…' : (editRoom ? 'Update Room' : 'Save Room')}
                    </motion.button>
                    <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                      onClick={() => { setShowForm(false); setEditRoom(null); setForm(emptyForm); resetImageState(); }}
                      style={{ padding: '9px 22px', background: HOVER, border: `1px solid ${BORDER}`, borderRadius: 8, color: SUBTEXT, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Cancel
                    </motion.button>
                  </div>
                </div>

                {/* Type reference */}
                <div style={{ marginTop: 14, background: dark ? '#282827' : '#f9fafb', borderRadius: 10, padding: '12px 14px', border: `1px solid ${BORDER}` }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: MUTED, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Room Type → Walk-in Category Reference
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                    {ROOM_TYPES.map(t => (
                      <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ background: dark ? 'rgba(200,240,110,0.15)' : '#1a2e1a', color: LIME, borderRadius: 4, padding: '1px 7px', fontSize: 9, fontWeight: 700 }}>{t}</span>
                        <span style={{ fontSize: 9, color: MUTED }}>{TYPE_CATEGORY_MAP[t]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Excel Import ── */}
        <AnimatePresence initial={false}>
          {showImport && (
            <motion.div variants={panelVariants} initial="hidden" animate="visible" exit="exit" style={{ overflow: 'hidden' }}>
              <div style={{ background: CARD, borderRadius: 18, padding: '20px 24px', border: `1px solid ${BORDER}`, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}><i className="ti ti-file-import" aria-hidden="true" style={{ marginRight: 6, verticalAlign: '-2px' }} />Import Rooms from Excel</div>
                  <button onClick={() => setShowImport(false)}
                    style={{ background: HOVER, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '5px 12px', fontSize: 11, color: SUBTEXT, cursor: 'pointer', fontFamily: 'inherit' }}>
                    ✕ Close
                  </button>
                </div>
                <RoomExcelImport onImportComplete={() => { fetchRooms(); setShowImport(false); }} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {getRoomsNotReadyForArrivals(rooms, arrivalsToday, manilaDateKey()).map(({ room, arrivals, first }) => (
          <div key={`not-ready-${room.id}`} role="alert" style={{ marginBottom: 10, padding: '12px 14px', borderRadius: 12, background: dark ? '#3b1d1d' : '#fef2f2', border: `1px solid ${dark ? '#7f1d1d' : '#fecaca'}`, color: dark ? '#fca5a5' : '#991b1b', fontSize: 13, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <i className="ti ti-bucket-droplet" style={{ fontSize: 18 }} />
            <div style={{ flex: '1 1 240px' }}>
              <strong>Room {room.roomNumber} is still {String(room.status).toLowerCase()}</strong>, and a guest is staying there today:
              {' '}{first.guestName || 'Guest'} checks in at {formatClockLabel(first.checkInTime)}{arrivals.length > 1 ? ` (+${arrivals.length - 1} more)` : ''}.
              <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>Clean it first. When it's ready, mark it as available.</div>
            </div>
            <button type="button" onClick={() => markCleaned(room)}
              style={{ padding: '8px 14px', background: '#166534', color: '#fff', border: 0, borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Mark as available
            </button>
          </div>
        ))}
        {statusError && (
          <div role="alert" style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 10, background: dark ? '#7f1d1d' : '#fee2e2', color: dark ? '#fca5a5' : '#991b1b', fontSize: 12 }}>
            {statusError}
          </div>
        )}
        {/* ── Toolbar: status tabs, search, type, sort, actions ── */}
        <motion.div variants={headerVariants} initial="hidden" animate="visible"
          style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 10 }}>
          <div role="tablist" aria-label="Room status" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {statusTabs.map(tab => {
              const active = statusFilter === tab.value;
              return (
                <button key={tab.label} type="button" role="tab" aria-selected={active} onClick={() => setStatusFilter(tab.value)}
                  style={{
                    padding: '7px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', height: 36,
                    border: `1px solid ${active ? LIME : BORDER}`, background: active ? LIME : INPUT_BG, color: active ? DARK : SUBTEXT,
                  }}>
                  {tab.label} <span style={{ opacity: 0.7 }}>({tab.count})</span>
                </button>
              );
            })}
          </div>

          <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
            <i className="ti ti-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: MUTED }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search room name, type..."
              style={{ ...inputStyle, paddingLeft: 32, borderRadius: 10, height: 36 }} />
          </div>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            style={{ ...inputStyle, width: 'auto', borderRadius: 10, height: 36, paddingRight: 28 }}>
            <option value="">All Types</option>
            {ROOM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} aria-label="Sort rooms"
            style={{ ...inputStyle, width: 'auto', borderRadius: 10, height: 36, paddingRight: 28 }}>
            <option value="name">Sort: Name</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </select>

          {!isReceptionist && (
            <>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => { setShowImport(p => !p); setShowForm(false); setEditRoom(null); }}
                style={{
                  padding: '7px 14px', border: `1px solid ${showImport ? LIME : BORDER}`, borderRadius: 10,
                  background: showImport ? 'rgba(200,240,110,0.12)' : INPUT_BG, color: showImport ? LIME : SUBTEXT,
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, height: 36,
                }}>
                <i className="ti ti-file-spreadsheet" style={{ fontSize: 14 }} />Import Excel
              </motion.button>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => { setShowForm(true); setShowImport(false); setEditRoom(null); setForm(emptyForm); resetImageState(); }}
                style={{ padding: '7px 16px', background: LIME, border: 'none', borderRadius: 10, color: DARK, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', height: 36 }}>
                + Add New Room
              </motion.button>
            </>
          )}
        </motion.div>

        {/* ── Room grid ── */}
        {sorted.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: 'center', color: MUTED, padding: '48px 0', fontSize: 13 }}>
            <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }} style={{ marginBottom: 8 }}>
              <i className="ti ti-bed-off" style={{ fontSize: 34, color: MUTED }} />
            </motion.div>
            No rooms found.
          </motion.div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14, alignItems: 'start' }}>
            {sorted.map(renderCard)}
          </div>
        )}

        {/* ── Delete confirmation modal ── */}
        <AnimatePresence>
          {(() => { const openRoom = rooms.find(r => r.id === openId); return openRoom ? renderDetails(openRoom) : null; })()}
          {!isReceptionist && confirmDeleteId && (
            <motion.div variants={backdropVariants} initial="hidden" animate="visible" exit="exit"
              onClick={() => setConfirmDeleteId(null)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
              <motion.div variants={modalVariants} initial="hidden" animate="visible" exit="exit" onClick={e => e.stopPropagation()}
                style={{ background: CARD, borderRadius: 16, border: `1px solid ${BORDER}`, padding: 22, width: 320, boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(248,113,113,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <i className="ti ti-trash" style={{ fontSize: 17, color: '#f87171' }} />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Delete room?</div>
                </div>
                <div style={{ fontSize: 12, color: SUBTEXT, lineHeight: 1.6, marginBottom: 18 }}>
                  {deleteTargetRoom
                    ? <>This will permanently remove <strong style={{ color: TEXT }}>{deleteTargetRoom.roomNumber}</strong> from your room list. This can't be undone.</>
                    : 'This will permanently remove this room. This can\'t be undone.'}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setConfirmDeleteId(null)}
                    style={{ flex: 1, padding: 9, background: HOVER, border: `1px solid ${BORDER}`, borderRadius: 9, color: SUBTEXT, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                    Cancel
                  </motion.button>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={confirmDelete}
                    style={{ flex: 1, padding: 9, background: '#f87171', border: 'none', borderRadius: 9, color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>
                    Delete
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageLayout>
  );
}