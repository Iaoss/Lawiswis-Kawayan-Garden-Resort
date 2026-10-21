import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../../firebase/firebase';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import PageLayout from '../components/PageLayout';
import RoomExcelImport from '../components/RoomExcelImport';
import { useSettings } from '../components/SettingsContext';
import { ROOM_TYPES, ROOM_TYPE_CATEGORY_MAP, normalizeRoomType } from '../utils/roomCatalog';
import { resolveRoomImage } from '../../client/components/clientTheme';

// ── Cloudinary config ────────────────────────────────────────
const CLOUDINARY_CLOUD_NAME = 'x17b4eux';
const CLOUDINARY_UPLOAD_PRESET = 'w8sfwf9b';

const uploadToCloudinary = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: 'POST', body: formData }
  );
  if (!res.ok) throw new Error('Cloudinary upload failed');
  const data = await res.json();
  return data.secure_url;
};

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

// Spring-height expander (same easing as the SpringCard example)
function Expand({ open, children }) {
  const inner = useRef(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    setHeight(open && inner.current ? inner.current.offsetHeight : 0);
  });
  return (
    <div style={{ height, overflow: 'hidden', transition: 'height 0.5s cubic-bezier(0.34,1.56,0.64,1)' }}>
      <div ref={inner}>{children}</div>
    </div>
  );
}

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
  const [openId, setOpenId]         = useState(null);   // which card is expanded
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

  const fetchRooms = useCallback(async () => {
    const snapshot = await getDocs(collection(db, 'rooms'));
    setRooms(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
  }, []);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

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
    setEditRoom(room); setForm({ ...emptyForm, ...room }); setShowForm(true); setShowImport(false);
    resetImageState();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const requestDelete = (id) => {
    if (isReceptionist) return;
    setConfirmDeleteId(id);
  };

  const confirmDelete = async () => {
    if (isReceptionist || !confirmDeleteId) return;
    await deleteDoc(doc(db, 'rooms', confirmDeleteId));
    setOpenId(null);
    setConfirmDeleteId(null);
    fetchRooms();
  };

  const markCleaned = async (room) => {
    await updateDoc(doc(db, 'rooms', room.id), { status: 'available' });
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
    const amenities = room.amenities
      ? room.amenities.split(',').map(a => a.trim()).filter(Boolean)
      : (m.facilities || []);
    const rows = [
      ['Bed', m.bed],
      ['Guests', room.baseCapacity ? `${room.baseCapacity} guests` : m.guests],
      ['Size', m.size],
    ].filter(r => r[1]);

    return (
      <motion.div key={room.id} custom={i} variants={roomCardVariants} initial="hidden" animate="visible"
        onClick={() => setOpenId(open ? null : room.id)}
        style={{
          background: CARD, borderRadius: 16, padding: 10, cursor: 'pointer',
          border: open ? `2px solid ${LIME}` : `1px solid ${BORDER}`,
          boxShadow: open ? (dark ? '0 10px 30px rgba(0,0,0,0.45)' : '0 10px 28px rgba(0,0,0,0.10)') : 'none',
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
                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '8px 10px', fontSize: 12, color: TEXT, cursor: 'pointer', fontFamily: 'inherit', borderRadius: 6 }}>✏️ Edit</button>
                  <button type="button" onClick={() => { setMenuId(null); requestDelete(room.id); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '8px 10px', fontSize: 12, color: '#f87171', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 6 }}>🗑 Delete</button>
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
              ₱{Number(room.price).toLocaleString()}<span style={{ fontSize: 10, fontWeight: 400, color: MUTED }}>/night</span>
            </span>
            <span style={{ fontSize: 10, color: SUBTEXT, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {open ? 'Hide' : 'Details'}
              <i className="ti ti-chevron-down" style={{ fontSize: 12, transition: 'transform .4s', transform: open ? 'rotate(180deg)' : 'none' }} />
            </span>
          </div>
        </div>

        {/* Expanded details */}
        <Expand open={open}>
          <div style={{ padding: '14px 4px 4px', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 11, color: dark ? '#89D7B7' : '#428475', fontWeight: 500 }}>📂 {TYPE_CATEGORY_MAP[room.type] || '—'}</div>
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

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingBottom: 6 }}>
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
                    🗑 Delete
                  </button>
                </>
              )}
            </div>
          </div>
        </Expand>
      </motion.div>
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

        {/* ── Add/Edit Form ── */}
        <AnimatePresence initial={false}>
          {showForm && (
            <motion.div variants={panelVariants} initial="hidden" animate="visible" exit="exit" style={{ overflow: 'hidden' }}>
              <div style={{ background: CARD, borderRadius: 18, padding: '20px 22px', border: `1px solid ${BORDER}`, marginBottom: 16, boxShadow: dark ? '0 8px 32px rgba(0,0,0,0.4)' : '0 2px 12px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 16 }}>
                  {editRoom ? '✏️ Edit Room' : '➕ Add New Room'}
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
                  <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>📥 Import Rooms from Excel</div>
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