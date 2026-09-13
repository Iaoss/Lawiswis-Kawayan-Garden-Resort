import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../../firebase/firebase';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import PageLayout from '../components/PageLayout';
import RoomExcelImport from '../components/RoomExcelImport';
import { useSettings } from '../components/SettingsContext';
import { ROOM_TYPES, ROOM_TYPE_CATEGORY_MAP, normalizeRoomType } from '../utils/roomCatalog';

const LIME  = '#c8f06e';
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

const badgeColors = {
  vacant:      { bg: 'rgba(200,240,110,0.12)', color: '#c8f06e' },
  available:   { bg: 'rgba(200,240,110,0.12)', color: '#c8f06e' },
  occupied:    { bg: 'rgba(248,113,113,0.12)', color: '#f87171' },
  cleaning:    { bg: 'rgba(251,191,36,0.12)',  color: '#fbbf24' },
  maintenance: { bg: 'rgba(148,163,184,0.12)', color: '#94a3b8' },
};

const badgeLabel = (s) => ({ vacant: 'Available', occupied: 'Occupied', cleaning: 'Cleaning', maintenance: 'Maintenance', available: 'Available' })[s] || s;

const CheckIcon = () => (
  <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'rgba(200,240,110,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
    <i className="ti ti-check" style={{ fontSize: 9, color: LIME }} />
  </div>
);

// ── Motion variants ──────────────────────────────────────────
const panelVariants = {
  hidden:  { opacity: 0, height: 0 },
  visible: { opacity: 1, height: 'auto', transition: { duration: 0.25, ease: 'easeOut' } },
  exit:    { opacity: 0, height: 0, transition: { duration: 0.2, ease: 'easeIn' } },
};

const statCardVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.03, duration: 0.3, ease: 'easeOut' },
  }),
};

const roomCardVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: (i) => ({
    opacity: 1, y: 0,
    transition: { delay: Math.min(i, 10) * 0.035, duration: 0.32, ease: 'easeOut' },
  }),
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.15 } },
};

export default function RoomManagement() {
  const { settings } = useSettings();
  const dark = settings?.darkMode;

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
  const [activeRoom, setActiveRoom] = useState(null);
  const [search, setSearch]         = useState('');
  const [filterType, setFilterType] = useState('');
  const [form, setForm] = useState({ roomNumber: '', type: '', price: '', status: 'vacant', amenities: '', description: '' });

  const fetchRooms = async () => {
    const snapshot = await getDocs(collection(db, 'rooms'));
    const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    setRooms(data);
    if (data.length && !activeRoom) setActiveRoom(data[0]);
  };

  useEffect(() => { fetchRooms(); }, []);

  const handleSubmit = async () => {
    if (!form.roomNumber || !form.type || !form.price) return;
    if (editRoom) await updateDoc(doc(db, 'rooms', editRoom.id), form);
    else await addDoc(collection(db, 'rooms'), form);
    setForm({ roomNumber: '', type: '', price: '', status: 'vacant', amenities: '', description: '' });
    setShowForm(false); setEditRoom(null); fetchRooms();
  };

  const handleEdit = (room) => {
    setEditRoom(room); setForm(room); setShowForm(true); setShowImport(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this room?')) {
      await deleteDoc(doc(db, 'rooms', id));
      setActiveRoom(null); fetchRooms();
    }
  };

  const filtered = rooms.filter(r => {
    const normalizedType = normalizeRoomType(r.type);
    return (
      (r.roomNumber?.toLowerCase().includes(search.toLowerCase()) || r.type?.toLowerCase().includes(search.toLowerCase()) || normalizedType?.toLowerCase().includes(search.toLowerCase())) &&
      (filterType ? normalizedType === filterType || r.type === filterType : true)
    );
  });

  const meta = activeRoom ? (ROOM_META[activeRoom.type] || {}) : {};
  const amenitiesList = activeRoom?.amenities
    ? activeRoom.amenities.split(',').map(a => a.trim()).filter(Boolean)
    : (meta.facilities || []);

  const inputStyle = {
    width: '100%', padding: '9px 12px',
    border: `1px solid ${BORDER}`, borderRadius: 8,
    fontSize: 12, fontFamily: 'inherit', outline: 'none',
    background: INPUT_BG, color: TEXT, boxSizing: 'border-box',
  };

  const statCards = [
    { label: 'Total',       value: rooms.length,                                                         color: TEXT },
    { label: 'Available',   value: rooms.filter(r => ['vacant','available'].includes(r.status)).length,  color: LIME },
    { label: 'Occupied',    value: rooms.filter(r => r.status === 'occupied').length,                    color: '#f87171' },
    { label: 'Maintenance', value: rooms.filter(r => r.status === 'maintenance').length,                 color: '#94a3b8' },
    { label: 'Standard',    value: rooms.filter(r => r.type === 'Standard').length,                      color: '#60a5fa' },
    { label: 'Deluxe',      value: rooms.filter(r => r.type === 'Deluxe').length,                        color: '#a78bfa' },
    { label: 'Family Room', value: rooms.filter(r => r.type === 'FamilyRoom').length,                    color: '#fbbf24' },
    { label: 'Jr. Suite',   value: rooms.filter(r => r.type === 'JuniorSuite4').length,                  color: '#34d399' },
    { label: 'Family Suite',value: rooms.filter(r => r.type === 'FamilySuite').length,                   color: '#2dd4bf' },
    { label: 'Presidential',value: rooms.filter(r => r.type === 'PresidentialSuite').length,              color: '#f472b6' },
    { label: 'Main Villa',  value: rooms.filter(r => r.type === 'MainVilla').length,                     color: '#fb923c' },
  ];

  return (
    <PageLayout>
      <div style={{ fontFamily: "'Poppins', sans-serif", background: BG, minHeight: '100vh', padding: 20 }}>

        {/* ── Add/Edit Form ── */}
        <AnimatePresence initial={false}>
          {showForm && (
            <motion.div
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              style={{ overflow: 'hidden' }}
            >
              <div style={{ background: CARD, borderRadius: 18, padding: '20px 22px', border: `1px solid ${BORDER}`, marginBottom: 16, boxShadow: dark ? '0 8px 32px rgba(0,0,0,0.4)' : 'none' }}>
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
                    <select style={inputStyle} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                      <option value="">Select type</option>
                      {ROOM_TYPES.map(t => <option key={t} value={t}>{t} — {TYPE_CATEGORY_MAP[t]}</option>)}
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
                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
                    <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handleSubmit}
                      style={{ padding: '9px 22px', background: LIME, border: 'none', borderRadius: 8, color: DARK, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {editRoom ? 'Update Room' : 'Save Room'}
                    </motion.button>
                    <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => { setShowForm(false); setEditRoom(null); }}
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
            <motion.div
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              style={{ overflow: 'hidden' }}
            >
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

        {/* ── Top Bar ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
            <i className="ti ti-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: MUTED }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search room name, type..."
              style={{ ...inputStyle, paddingLeft: 32, borderRadius: 10, height: 36 }} />
          </div>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            style={{ ...inputStyle, width: 'auto', borderRadius: 10, height: 36, paddingRight: 28 }}>
            <option value="">All Types</option>
            {ROOM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => { setShowImport(p => !p); setShowForm(false); setEditRoom(null); }}
            style={{
              padding: '7px 14px', border: `1px solid ${showImport ? LIME : BORDER}`,
              borderRadius: 10, background: showImport ? 'rgba(200,240,110,0.12)' : INPUT_BG,
              color: showImport ? LIME : SUBTEXT,
              fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 5, height: 36,
            }}>
            <i className="ti ti-file-spreadsheet" style={{ fontSize: 14 }} />Import Excel
          </motion.button>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => { setShowForm(true); setShowImport(false); setEditRoom(null); setForm({ roomNumber: '', type: '', price: '', status: 'vacant', amenities: '', description: '' }); }}
            style={{ padding: '7px 16px', background: LIME, border: 'none', borderRadius: 10, color: DARK, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', height: 36 }}>
            + Add Room
          </motion.button>
        </div>

        {/* ── Stats Row ── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {statCards.map((s, i) => (
            <motion.div key={s.label}
              custom={i}
              variants={statCardVariants}
              initial="hidden"
              animate="visible"
              whileHover={{ y: -2, borderColor: dark ? '#3a3a2a' : '#d1d5db' }}
              style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px', flex: 1, minWidth: 70 }}
            >
              <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 9, color: MUTED, marginTop: 2 }}>{s.label}</div>
            </motion.div>
          ))}
        </div>

        {/* ── Main Grid ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }}>

          {/* Room List */}
          <div>
            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', color: MUTED, padding: '48px 0', fontSize: 13 }}>No rooms found.</div>
            ) : (
              <AnimatePresence initial={false}>
                {filtered.map((room, i) => {
                  const m = ROOM_META[room.type] || {};
                  const badge = badgeColors[room.status] || badgeColors.maintenance;
                  const isActive = activeRoom?.id === room.id;
                  return (
                    <motion.div key={room.id}
                      layout
                      custom={i}
                      variants={roomCardVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      whileHover={{ y: -3, boxShadow: dark ? '0 8px 24px rgba(0,0,0,0.35)' : '0 8px 20px rgba(0,0,0,0.08)' }}
                      onClick={() => setActiveRoom(room)}
                      style={{
                        display: 'flex', gap: 12, padding: 14,
                        background: isActive ? (dark ? '#1e2e1e' : '#f0fdf0') : CARD,
                        borderRadius: 14,
                        border: isActive ? `2px solid ${LIME}` : `1px solid ${BORDER}`,
                        marginBottom: 8, cursor: 'pointer',
                        boxShadow: isActive && dark ? `0 0 20px rgba(200,240,110,0.08)` : 'none',
                      }}
                    >
                      {/* Room icon */}
                      <div style={{
                        width: 90, height: 72, borderRadius: 10,
                        background: dark ? '#282827' : '#f8faf8',
                        border: `1px solid ${BORDER}`,
                        flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <i className="ti ti-bed" style={{ fontSize: 32, color: dark ? LIME : '#4a7c59' }} />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 15, fontWeight: 600, color: TEXT }}>{room.roomNumber}</span>
                          <span style={{ fontSize: 11, color: MUTED }}>·</span>
                          <span style={{ fontSize: 12, color: SUBTEXT }}>{room.type}</span>
                          <span style={{ background: badge.bg, color: badge.color, padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600 }}>
                            {badgeLabel(room.status)}
                          </span>
                          {room.source === 'excel_import' && (
                            <span style={{ background: 'rgba(96,165,250,0.12)', color: '#60a5fa', padding: '2px 6px', borderRadius: 6, fontSize: 9, fontWeight: 600 }}>XLS</span>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: dark ? '#89D7B7' : '#428475', fontWeight: 500, marginBottom: 4 }}>
                          📂 {TYPE_CATEGORY_MAP[room.type] || '—'}
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                          {[['ti-ruler', m.size], ['ti-bed', m.bed], ['ti-users', m.guests]].map(([icon, val]) => val && (
                            <span key={icon} style={{ fontSize: 11, color: SUBTEXT, display: 'flex', alignItems: 'center', gap: 3 }}>
                              <i className={`ti ${icon}`} style={{ fontSize: 12, color: MUTED }} />{val}
                            </span>
                          ))}
                        </div>
                        <div style={{ fontSize: 11, color: MUTED, marginBottom: 4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>
                          {room.description || m.defaultDesc || ''}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 10, color: MUTED }}>Room {room.roomNumber}</span>
                          <span style={{ fontSize: 16, fontWeight: 700, color: dark ? LIME : '#111' }}>
                            ₱{Number(room.price).toLocaleString()}
                            <span style={{ fontSize: 10, fontWeight: 400, color: MUTED }}>/night</span>
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>

          {/* ── Detail Panel ── */}
          <AnimatePresence mode="wait">
            {activeRoom && (
              <motion.div
                key={activeRoom.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                style={{
                  background: CARD, borderRadius: 16,
                  border: `1px solid ${BORDER}`,
                  padding: 18, display: 'flex', flexDirection: 'column', gap: 12,
                  position: 'sticky', top: 20,
                  boxShadow: dark ? '0 8px 32px rgba(0,0,0,0.4)' : 'none',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Room Detail</span>
                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handleEdit(activeRoom)}
                    style={{ padding: '5px 14px', background: LIME, border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: DARK }}>
                    Edit
                  </motion.button>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: TEXT }}>{activeRoom.roomNumber}</span>
                    <span style={{
                      background: (badgeColors[activeRoom.status] || badgeColors.maintenance).bg,
                      color: (badgeColors[activeRoom.status] || badgeColors.maintenance).color,
                      padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600,
                    }}>{badgeLabel(activeRoom.status)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: dark ? '#89D7B7' : '#428475', fontWeight: 500 }}>
                    {activeRoom.type} · {TYPE_CATEGORY_MAP[activeRoom.type] || ''}
                  </div>
                </div>

                {/* Room image placeholder */}
                <div style={{
                  width: '100%', height: 130, borderRadius: 12,
                  background: dark ? '#282827' : '#f8faf8',
                  border: `1px solid ${BORDER}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <i className="ti ti-bed" style={{ fontSize: 52, color: dark ? LIME : '#4a7c59' }} />
                </div>

                {/* Size / Bed / Guests */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {[['ti-ruler', meta.size], ['ti-bed', meta.bed], ['ti-users', meta.guests]].map(([icon, val]) => val && (
                    <span key={icon} style={{ fontSize: 11, color: SUBTEXT, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <i className={`ti ${icon}`} style={{ fontSize: 13, color: MUTED }} />{val}
                    </span>
                  ))}
                </div>

                <p style={{ fontSize: 11, color: SUBTEXT, lineHeight: 1.7, margin: 0 }}>
                  {activeRoom.description || meta.defaultDesc}
                </p>

                <div style={{ height: 1, background: BORDER }} />

                {meta.features?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, marginBottom: 8 }}>Features</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {meta.features.map(f => (
                        <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: SUBTEXT }}>
                          <CheckIcon />{f}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ height: 1, background: BORDER }} />

                {amenitiesList.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, marginBottom: 8 }}>Amenities</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {amenitiesList.map(a => (
                        <div key={a} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: SUBTEXT }}>
                          <CheckIcon />{a}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ height: 1, background: BORDER }} />

                <div>
                  <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>Price per night</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: dark ? LIME : '#111' }}>
                    ₱{Number(activeRoom.price).toLocaleString()}
                    <span style={{ fontSize: 11, fontWeight: 400, color: MUTED }}>/night</span>
                  </div>
                </div>

                <motion.button whileHover={{ scale: 1.02, background: 'rgba(248,113,113,0.15)' }} whileTap={{ scale: 0.98 }}
                  onClick={() => handleDelete(activeRoom.id)}
                  style={{
                    width: '100%', padding: 9,
                    border: '1px solid rgba(248,113,113,0.3)',
                    borderRadius: 10, background: 'rgba(248,113,113,0.08)',
                    fontSize: 11, color: '#f87171', cursor: 'pointer', fontFamily: 'inherit',
                    fontWeight: 600,
                  }}
                >
                  🗑 Delete Room
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </PageLayout>
  );
}