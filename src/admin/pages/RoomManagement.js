import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import { db } from '../../firebase/firebase';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import PageLayout from '../components/PageLayout';
import RoomExcelImport from '../components/RoomExcelImport';
import { useSettings } from '../components/SettingsContext';
import { ROOM_TYPES, ROOM_TYPE_CATEGORY_MAP, normalizeRoomType } from '../utils/roomCatalog';
import { resolveRoomImage } from '../../client/components/clientTheme';

// ── Cloudinary config ────────────────────────────────────────
// Fill these in from your Cloudinary dashboard (cloudinary.com → Dashboard for
// cloud name; Settings → Upload → Upload presets for the unsigned preset name).
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

const badgeColors = {
  vacant:      { bg: 'rgba(200,240,110,0.12)', color: '#9cb56f' },
  available:   { bg: 'rgba(200,240,110,0.12)', color: '#9cb56f' },
  occupied:    { bg: 'rgba(248,113,113,0.12)', color: '#f87171' },
  cleaning:    { bg: 'rgba(251,191,36,0.12)',  color: '#fbbf24' },
  maintenance: { bg: 'rgba(148,163,184,0.12)', color: '#94a3b8' },
};

const PULSING_STATUSES = new Set(['occupied', 'cleaning']);

const badgeLabel = (s) => ({ vacant: 'Available', occupied: 'Occupied', cleaning: 'Cleaning', maintenance: 'Maintenance', available: 'Available' })[s] || s;

const CheckIcon = () => (
  <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'rgba(200,240,110,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
    <i className="ti ti-check" style={{ fontSize: 9, color: LIME }} />
  </div>
);

const StatusDot = ({ color, pulse }) => (
  <motion.span
    animate={pulse ? { opacity: [1, 0.35, 1] } : {}}
    transition={pulse ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : {}}
    style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }}
  />
);

function AnimatedNumber({ value }) {
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const controls = animate(mv, value, {
      duration: 0.6,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <>{display}</>;
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

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const modalVariants = {
  hidden: { opacity: 0, scale: 0.94, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
  exit: { opacity: 0, scale: 0.96, y: 6, transition: { duration: 0.15 } },
};

const chipVariants = {
  hidden:  { opacity: 0, scale: 0.9, width: 0, marginLeft: 0 },
  visible: { opacity: 1, scale: 1, width: 'auto', marginLeft: 8, transition: { duration: 0.2, ease: 'easeOut' } },
  exit:    { opacity: 0, scale: 0.9, width: 0, marginLeft: 0, transition: { duration: 0.15, ease: 'easeIn' } },
};

const emptyForm = { roomNumber: '', type: '', price: '', status: 'vacant', amenities: '', description: '', imageUrl: '' };

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
  const [statusFilter, setStatusFilter] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // ── Image upload state ──────────────────────────────────────
  const [imageFile, setImageFile]       = useState(null);   // newly picked File, not yet uploaded
  const [imagePreview, setImagePreview] = useState('');     // local object URL for the picked file
  const [removeImage, setRemoveImage]   = useState(false);  // user asked to clear the current image
  const [uploading, setUploading]       = useState(false);
  const [uploadError, setUploadError]   = useState('');

  const fetchRooms = async () => {
    const snapshot = await getDocs(collection(db, 'rooms'));
    const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    setRooms(data);
    if (data.length && !activeRoom) setActiveRoom(data[0]);
  };

  useEffect(() => { fetchRooms(); }, []);

  useEffect(() => {
    return () => { if (imagePreview) URL.revokeObjectURL(imagePreview); };
  }, [imagePreview]);

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

    let imageUrl = form.imageUrl || '';

    try {
      if (imageFile) {
        setUploading(true);
        setUploadError('');
        imageUrl = await uploadToCloudinary(imageFile);
        setUploading(false);
      } else if (removeImage) {
        // Just clear the field — we don't delete from Cloudinary here since
        // unsigned uploads can't delete without server-side signing. The old
        // file just sits unused on Cloudinary's free tier, no cost impact.
        imageUrl = '';
      }

      const payload = { ...form, imageUrl };
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
    setEditRoom(room); setForm({ ...emptyForm, ...room }); setShowForm(true); setShowImport(false);
    resetImageState();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const requestDelete = (id) => setConfirmDeleteId(id);

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    await deleteDoc(doc(db, 'rooms', confirmDeleteId));
    setActiveRoom(null);
    setConfirmDeleteId(null);
    fetchRooms();
  };

  const statCards = [
    { label: 'Total',       value: rooms.length,                                                         color: TEXT,      icon: 'ti-building',        filterKind: 'all',      filterValue: '' },
    { label: 'Available',   value: rooms.filter(r => ['vacant','available'].includes(r.status)).length,  color: LIME,      icon: 'ti-circle-check',    filterKind: 'status',   filterValue: 'available' },
    { label: 'Occupied',    value: rooms.filter(r => r.status === 'occupied').length,                    color: '#f87171', icon: 'ti-door',            filterKind: 'status',   filterValue: 'occupied' },
    { label: 'Maintenance', value: rooms.filter(r => r.status === 'maintenance').length,                 color: '#94a3b8', icon: 'ti-tool',            filterKind: 'status',   filterValue: 'maintenance' },
    { label: 'Standard',    value: rooms.filter(r => r.type === 'Standard').length,                      color: '#60a5fa', icon: 'ti-bed',             filterKind: 'roomType', filterValue: 'Standard' },
    { label: 'Deluxe',      value: rooms.filter(r => r.type === 'Deluxe').length,                        color: '#a78bfa', icon: 'ti-star',            filterKind: 'roomType', filterValue: 'Deluxe' },
    { label: 'Family Room', value: rooms.filter(r => r.type === 'FamilyRoom').length,                    color: '#fbbf24', icon: 'ti-users',           filterKind: 'roomType', filterValue: 'FamilyRoom' },
    { label: 'Jr. Suite',   value: rooms.filter(r => r.type === 'JuniorSuite4').length,                  color: '#34d399', icon: 'ti-sofa',            filterKind: 'roomType', filterValue: 'JuniorSuite4' },
    { label: 'Family Suite',value: rooms.filter(r => r.type === 'FamilySuite').length,                   color: '#2dd4bf', icon: 'ti-home',            filterKind: 'roomType', filterValue: 'FamilySuite' },
    { label: 'Presidential',value: rooms.filter(r => r.type === 'PresidentialSuite').length,              color: '#f472b6', icon: 'ti-crown',           filterKind: 'roomType', filterValue: 'PresidentialSuite' },
    { label: 'Main Villa',  value: rooms.filter(r => r.type === 'MainVilla').length,                     color: '#fb923c', icon: 'ti-building-castle', filterKind: 'roomType', filterValue: 'MainVilla' },
  ];

  const handleStatClick = (card) => {
    if (card.filterKind === 'all') {
      setFilterType(''); setStatusFilter('');
      return;
    }
    if (card.filterKind === 'status') {
      setStatusFilter(prev => (prev === card.filterValue ? '' : card.filterValue));
      setFilterType('');
    } else if (card.filterKind === 'roomType') {
      setFilterType(prev => (prev === card.filterValue ? '' : card.filterValue));
      setStatusFilter('');
    }
  };

  const isCardActive = (card) => {
    if (card.filterKind === 'all') return !filterType && !statusFilter;
    if (card.filterKind === 'status') return statusFilter === card.filterValue;
    if (card.filterKind === 'roomType') return filterType === card.filterValue;
    return false;
  };

  const clearAllFilters = () => { setFilterType(''); setStatusFilter(''); };

  const activeFilterLabel = statusFilter
    ? `Status: ${badgeLabel(statusFilter === 'available' ? 'vacant' : statusFilter)}`
    : filterType
      ? `Type: ${filterType}`
      : '';

  const filtered = rooms.filter(r => {
    const normalizedType = normalizeRoomType(r.type);
    const matchesSearch = (
      r.roomNumber?.toLowerCase().includes(search.toLowerCase()) ||
      r.type?.toLowerCase().includes(search.toLowerCase()) ||
      normalizedType?.toLowerCase().includes(search.toLowerCase())
    );
    const matchesType = filterType ? (normalizedType === filterType || r.type === filterType) : true;
    const matchesStatus = statusFilter === 'available'
      ? ['vacant', 'available'].includes(r.status)
      : statusFilter
        ? r.status === statusFilter
        : true;
    return matchesSearch && matchesType && matchesStatus;
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

  const deleteTargetRoom = rooms.find(r => r.id === confirmDeleteId);

  const formImagePreviewSrc = imagePreview || (removeImage ? '' : form.imageUrl);

  return (
    <PageLayout>
      <div style={{ fontFamily: "'Poppins', sans-serif", background: BG, minHeight: '100vh', padding: 20 }}>

        {/* ── Page header ── */}
        <motion.div variants={headerVariants} initial="hidden" animate="visible" style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: TEXT }}>Room Management</div>
          <div style={{ fontSize: 12, color: SUBTEXT, marginTop: 2 }}>
            {rooms.length} room{rooms.length === 1 ? '' : 's'} total · manage inventory, pricing and availability
          </div>
        </motion.div>

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

                  {/* ── Room Photo: upload / replace / remove (via Cloudinary) ── */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: 11, color: SUBTEXT, marginBottom: 5, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Room Photo
                    </label>
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
                        <input type="file" accept="image/*" onChange={handleImageSelect}
                          style={{ fontSize: 11, color: SUBTEXT, fontFamily: 'inherit' }} />
                        {formImagePreviewSrc && (
                          <button type="button" onClick={handleRemoveImageClick}
                            style={{
                              padding: '6px 12px', background: 'rgba(248,113,113,0.08)',
                              border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8,
                              color: '#f87171', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                              fontFamily: 'inherit', width: 'fit-content',
                            }}>
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
        <motion.div
          variants={headerVariants} initial="hidden" animate="visible"
          style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap',
            background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 10,
          }}
        >
          <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
            <i className="ti ti-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: MUTED }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search room name, type..."
              style={{ ...inputStyle, paddingLeft: 32, borderRadius: 10, height: 36 }} />
          </div>
          <select value={filterType} onChange={e => { setFilterType(e.target.value); setStatusFilter(''); }}
            style={{ ...inputStyle, width: 'auto', borderRadius: 10, height: 36, paddingRight: 28 }}>
            <option value="">All Types</option>
            {ROOM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <AnimatePresence>
            {activeFilterLabel && (
              <motion.div
                variants={chipVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'rgba(200,240,110,0.12)', color: LIME,
                  border: `1px solid ${dark ? 'rgba(200,240,110,0.35)' : 'rgba(156,181,111,0.4)'}`,
                  borderRadius: 20, padding: '6px 8px 6px 12px',
                  fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', height: 36, boxSizing: 'border-box',
                }}
              >
                <i className="ti ti-filter" style={{ fontSize: 12 }} />
                {activeFilterLabel}
                <button
                  onClick={clearAllFilters}
                  aria-label="Clear filter"
                  style={{
                    background: 'rgba(0,0,0,0.08)', border: 'none', borderRadius: '50%',
                    width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', color: LIME, fontSize: 10, lineHeight: 1, padding: 0,
                  }}
                >
                  ✕
                </button>
              </motion.div>
            )}
          </AnimatePresence>

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
            onClick={() => { setShowForm(true); setShowImport(false); setEditRoom(null); setForm(emptyForm); resetImageState(); }}
            style={{ padding: '7px 16px', background: LIME, border: 'none', borderRadius: 10, color: DARK, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', height: 36 }}>
            + Add Room
          </motion.button>
        </motion.div>

        {/* ── Stats Row (clickable filters) ── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {statCards.map((s, i) => {
            const active = isCardActive(s);
            return (
              <motion.div key={s.label}
                custom={i}
                variants={statCardVariants}
                initial="hidden"
                animate="visible"
                whileHover={{ y: -3, borderColor: dark ? '#3a3a2a' : '#d1d5db', boxShadow: dark ? '0 6px 16px rgba(0,0,0,0.3)' : '0 6px 16px rgba(0,0,0,0.06)' }}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleStatClick(s)}
                title={s.filterKind === 'all' ? 'Show all rooms' : `Filter: ${s.label}`}
                style={{
                  background: active ? (dark ? '#1e2e1e' : '#f0fdf0') : CARD,
                  border: active ? `1px solid ${s.color}` : `1px solid ${BORDER}`,
                  borderRadius: 10, padding: '10px 14px', flex: 1, minWidth: 78,
                  borderLeft: `3px solid ${s.color}`,
                  cursor: 'pointer', userSelect: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className={`ti ${s.icon}`} style={{ fontSize: 12, color: s.color }} />
                  <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}><AnimatedNumber value={s.value} /></div>
                </div>
                <div style={{ fontSize: 9, color: MUTED, marginTop: 2 }}>{s.label}</div>
              </motion.div>
            );
          })}
        </div>

        {/* ── Main Grid ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }}>

          {/* Room List */}
          <div>
            {filtered.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: 'center', color: MUTED, padding: '48px 0', fontSize: 13 }}>
                <motion.div
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ marginBottom: 8 }}
                >
                  <i className="ti ti-bed-off" style={{ fontSize: 34, color: MUTED }} />
                </motion.div>
                No rooms found.
              </motion.div>
            ) : (
              <AnimatePresence initial={false}>
                {filtered.map((room, i) => {
                  const m = ROOM_META[room.type] || {};
                  const badge = badgeColors[room.status] || badgeColors.maintenance;
                  const isActive = activeRoom?.id === room.id;
                  const photoUrl = resolveRoomImage(room);
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
                      <div style={{
                        width: 90, height: 72, borderRadius: 10,
                        background: photoUrl
                          ? `url(${photoUrl}) center/cover no-repeat`
                          : (dark ? '#282827' : '#f8faf8'),
                        border: `1px solid ${BORDER}`,
                        flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {!photoUrl && (
                          <i className="ti ti-bed" style={{ fontSize: 32, color: dark ? LIME : '#4a7c59' }} />
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 15, fontWeight: 600, color: TEXT }}>{room.roomNumber}</span>
                          <span style={{ fontSize: 11, color: MUTED }}>·</span>
                          <span style={{ fontSize: 12, color: SUBTEXT }}>{room.type}</span>
                          <span style={{ background: badge.bg, color: badge.color, padding: '2px 8px 2px 6px', borderRadius: 20, fontSize: 10, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <StatusDot color={badge.color} pulse={PULSING_STATUSES.has(room.status)} />
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
                  boxShadow: dark ? '0 8px 32px rgba(0,0,0,0.4)' : '0 4px 20px rgba(0,0,0,0.05)',
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
                      padding: '2px 8px 2px 6px', borderRadius: 20, fontSize: 10, fontWeight: 600,
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                    }}>
                      <StatusDot
                        color={(badgeColors[activeRoom.status] || badgeColors.maintenance).color}
                        pulse={PULSING_STATUSES.has(activeRoom.status)}
                      />
                      {badgeLabel(activeRoom.status)}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: dark ? '#89D7B7' : '#428475', fontWeight: 500 }}>
                    {activeRoom.type} · {TYPE_CATEGORY_MAP[activeRoom.type] || ''}
                  </div>
                </div>

                <div style={{
                  width: '100%', height: 130, borderRadius: 12,
                  background: resolveRoomImage(activeRoom)
                    ? `url(${resolveRoomImage(activeRoom)}) center/cover no-repeat`
                    : (dark ? '#282827' : '#f8faf8'),
                  border: `1px solid ${BORDER}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {!resolveRoomImage(activeRoom) && (
                    <i className="ti ti-bed" style={{ fontSize: 52, color: dark ? LIME : '#4a7c59' }} />
                  )}
                </div>

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
                  onClick={() => requestDelete(activeRoom.id)}
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

        {/* ── Delete confirmation modal ── */}
        <AnimatePresence>
          {confirmDeleteId && (
            <motion.div
              variants={backdropVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={() => setConfirmDeleteId(null)}
              style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300,
              }}
            >
              <motion.div
                variants={modalVariants}
                initial="hidden" animate="visible" exit="exit"
                onClick={e => e.stopPropagation()}
                style={{
                  background: CARD, borderRadius: 16, border: `1px solid ${BORDER}`,
                  padding: 22, width: 320, boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
                }}
              >
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
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={() => setConfirmDeleteId(null)}
                    style={{ flex: 1, padding: 9, background: HOVER, border: `1px solid ${BORDER}`, borderRadius: 9, color: SUBTEXT, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                    Cancel
                  </motion.button>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={confirmDelete}
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