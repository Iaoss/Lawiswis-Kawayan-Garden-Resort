import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion';
import { db } from '../../firebase/firebase';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import PageLayout from '../components/PageLayout';
import { useSettings } from '../components/SettingsContext';

// ── Cloudinary config (same account as Room Management) ─────
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

const LIME = '#9cb56f';
const DARK = '#0a1a0a';

const NEWS_CATEGORIES = ['News', 'Promo', 'Update', 'Announcement', 'Event'];

const CATEGORY_COLORS = {
  News: '#60a5fa',
  Promo: '#fbbf24',
  Update: '#a78bfa',
  Announcement: '#f472b6',
  Event: '#34d399',
};

const badgeColors = {
  published: { bg: 'rgba(200,240,110,0.12)', color: '#9cb56f' },
  draft:     { bg: 'rgba(148,163,184,0.12)', color: '#94a3b8' },
};

const badgeLabel = (s) => ({ published: 'Published', draft: 'Draft' }[s] || s);

const CheckIcon = () => (
  <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'rgba(200,240,110,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
    <i className="ti ti-check" style={{ fontSize: 9, color: LIME }} />
  </div>
);

const StatusDot = ({ color }) => (
  <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
);

function AnimatedNumber({ value }) {
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.6, ease: 'easeOut', onUpdate: (v) => setDisplay(Math.round(v)) });
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
  visible: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.03, duration: 0.3, ease: 'easeOut' } }),
};

const articleCardVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: (i) => ({ opacity: 1, y: 0, transition: { delay: Math.min(i, 10) * 0.035, duration: 0.32, ease: 'easeOut' } }),
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.15 } },
};

const backdropVariants = { hidden: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0 } };

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

const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = { title: '', category: '', excerpt: '', content: '', externalLink: '', status: 'draft', publishedAt: today(), imageUrl: '' };

export default function NewsManagement() {
  const { settings } = useSettings();
  const dark = settings?.darkMode;

  const BG       = dark ? '#020b09' : '#f9fafb';
  const CARD     = dark ? '#1c1c1c' : '#ffffff';
  const BORDER   = dark ? '#282827' : '#e5e7eb';
  const TEXT     = dark ? '#e8e8d8' : '#111827';
  const MUTED    = dark ? '#5a5a4a' : '#9ca3af';
  const SUBTEXT  = dark ? '#8a8a7a' : '#6b7280';
  const INPUT_BG = dark ? '#282827' : '#ffffff';
  const HOVER    = dark ? '#282827' : '#f3f4f6';

  const [articles, setArticles]     = useState([]);
  const [showForm, setShowForm]     = useState(false);
  const [editArticle, setEditArticle] = useState(null);
  const [activeArticle, setActiveArticle] = useState(null);
  const [search, setSearch]         = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [loadError, setLoadError] = useState('');

  // ── Image upload state ──────────────────────────────────────
  const [imageFile, setImageFile]       = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [removeImage, setRemoveImage]   = useState(false);
  const [uploading, setUploading]       = useState(false);
  const [uploadError, setUploadError]   = useState('');

  const fetchArticles = useCallback(async () => {
    try {
      const snapshot = await getDocs(collection(db, 'news'));
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
      setArticles(data);
      setLoadError('');
      if (data.length && !activeArticle) setActiveArticle(data[0]);
    } catch (err) {
      console.error('Failed to load news:', err);
      setLoadError('News access is not enabled in Firebase. Add read/write permissions for the news collection in Firestore Rules.');
    }
  }, [activeArticle]);

  useEffect(() => { fetchArticles(); }, [fetchArticles]);

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
    if (!form.title || !form.category) return;

    let imageUrl = form.imageUrl || '';

    try {
      if (imageFile) {
        setUploading(true);
        setUploadError('');
        imageUrl = await uploadToCloudinary(imageFile);
        setUploading(false);
      } else if (removeImage) {
        imageUrl = '';
      }

      const payload = { ...form, imageUrl };
      if (editArticle) await updateDoc(doc(db, 'news', editArticle.id), payload);
      else await addDoc(collection(db, 'news'), payload);

      setForm(emptyForm);
      resetImageState();
      setShowForm(false); setEditArticle(null); fetchArticles();
    } catch (err) {
      setUploading(false);
      console.error('Failed to save article:', err);
      setUploadError(err?.code === 'permission-denied'
        ? 'Firebase denied this change. Check the news collection rules and your admin sign-in.'
        : 'Could not save the article. Please check your connection and try again.');
    }
  };

  const handleEdit = (article) => {
    setEditArticle(article); setForm({ ...emptyForm, ...article }); setShowForm(true);
    resetImageState();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const requestDelete = (id) => setConfirmDeleteId(id);

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    try {
      await deleteDoc(doc(db, 'news', confirmDeleteId));
      setActiveArticle(null);
      setConfirmDeleteId(null);
      fetchArticles();
    } catch (err) {
      console.error('Failed to delete article:', err);
      setLoadError('Firebase denied this deletion. Check the news collection rules and your admin sign-in.');
      setConfirmDeleteId(null);
    }
  };

  const statCards = [
    { label: 'Total',     value: articles.length,                                        color: TEXT, icon: 'ti-news',          filterKind: 'all',      filterValue: '' },
    { label: 'Published', value: articles.filter(a => a.status === 'published').length,   color: LIME, icon: 'ti-circle-check', filterKind: 'status',   filterValue: 'published' },
    { label: 'Draft',     value: articles.filter(a => a.status === 'draft').length,       color: '#94a3b8', icon: 'ti-file-pencil', filterKind: 'status', filterValue: 'draft' },
    ...NEWS_CATEGORIES.map(c => ({
      label: c,
      value: articles.filter(a => a.category === c).length,
      color: CATEGORY_COLORS[c] || '#9ca3af',
      icon: 'ti-tag',
      filterKind: 'category',
      filterValue: c,
    })),
  ];

  const handleStatClick = (card) => {
    if (card.filterKind === 'all') { setFilterCategory(''); setStatusFilter(''); return; }
    if (card.filterKind === 'status') {
      setStatusFilter(prev => (prev === card.filterValue ? '' : card.filterValue));
      setFilterCategory('');
    } else if (card.filterKind === 'category') {
      setFilterCategory(prev => (prev === card.filterValue ? '' : card.filterValue));
      setStatusFilter('');
    }
  };

  const isCardActive = (card) => {
    if (card.filterKind === 'all') return !filterCategory && !statusFilter;
    if (card.filterKind === 'status') return statusFilter === card.filterValue;
    if (card.filterKind === 'category') return filterCategory === card.filterValue;
    return false;
  };

  const clearAllFilters = () => { setFilterCategory(''); setStatusFilter(''); };

  const activeFilterLabel = statusFilter
    ? `Status: ${badgeLabel(statusFilter)}`
    : filterCategory
      ? `Category: ${filterCategory}`
      : '';

  const filtered = articles.filter(a => {
    const matchesSearch = (
      a.title?.toLowerCase().includes(search.toLowerCase()) ||
      a.category?.toLowerCase().includes(search.toLowerCase()) ||
      a.excerpt?.toLowerCase().includes(search.toLowerCase())
    );
    const matchesCategory = filterCategory ? a.category === filterCategory : true;
    const matchesStatus = statusFilter ? a.status === statusFilter : true;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const inputStyle = {
    width: '100%', padding: '9px 12px',
    border: `1px solid ${BORDER}`, borderRadius: 8,
    fontSize: 12, fontFamily: 'inherit', outline: 'none',
    background: INPUT_BG, color: TEXT, boxSizing: 'border-box',
  };

  const deleteTargetArticle = articles.find(a => a.id === confirmDeleteId);
  const formImagePreviewSrc = imagePreview || (removeImage ? '' : form.imageUrl);

  return (
    <PageLayout>
      <div style={{ fontFamily: "'Poppins', sans-serif", background: BG, minHeight: '100vh', padding: 20 }}>

        {/* ── Page header ── */}
        <motion.div variants={headerVariants} initial="hidden" animate="visible" style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: TEXT }}>News Management</div>
          <div style={{ fontSize: 12, color: SUBTEXT, marginTop: 2 }}>
            {articles.length} article{articles.length === 1 ? '' : 's'} total · manage news, promos and announcements
          </div>
        </motion.div>

        {loadError && (
          <div style={{ background: dark ? 'rgba(248,113,113,0.12)' : '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 14px', marginBottom: 16, color: '#b91c1c', fontSize: 12 }}>
            {loadError}
          </div>
        )}

        {/* ── Add/Edit Form ── */}
        <AnimatePresence initial={false}>
          {showForm && (
            <motion.div variants={panelVariants} initial="hidden" animate="visible" exit="exit" style={{ overflow: 'hidden' }}>
              <div style={{ background: CARD, borderRadius: 18, padding: '20px 22px', border: `1px solid ${BORDER}`, marginBottom: 16, boxShadow: dark ? '0 8px 32px rgba(0,0,0,0.4)' : '0 2px 12px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 16 }}>
                  {editArticle ? '✏️ Edit Article' : '➕ Add New Article'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: 11, color: SUBTEXT, marginBottom: 5, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Title</label>
                    <input style={inputStyle} value={form.title} placeholder="e.g. The Power of Connection: Building Stronger Teams"
                      onChange={e => setForm({ ...form, title: e.target.value })} />
                  </div>

                  <div>
                    <label style={{ fontSize: 11, color: SUBTEXT, marginBottom: 5, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Category</label>
                    <select style={inputStyle} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                      <option value="">Select category</option>
                      {NEWS_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: SUBTEXT, marginBottom: 5, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</label>
                    <select style={inputStyle} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, color: SUBTEXT, marginBottom: 5, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Published Date</label>
                    <input style={inputStyle} type="date" value={form.publishedAt} onChange={e => setForm({ ...form, publishedAt: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: SUBTEXT, marginBottom: 5, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>External Link (optional)</label>
                    <input style={inputStyle} value={form.externalLink} placeholder="https://…"
                      onChange={e => setForm({ ...form, externalLink: e.target.value })} />
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: 11, color: SUBTEXT, marginBottom: 5, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Excerpt</label>
                    <input style={inputStyle} value={form.excerpt} placeholder="Short one-line teaser shown on cards"
                      onChange={e => setForm({ ...form, excerpt: e.target.value })} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: 11, color: SUBTEXT, marginBottom: 5, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Content (optional, full body)</label>
                    <textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} value={form.content} placeholder="Full article text…"
                      onChange={e => setForm({ ...form, content: e.target.value })} />
                  </div>

                  {/* ── Article Photo ── */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: 11, color: SUBTEXT, marginBottom: 5, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Article Photo
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
                            No photo uploaded yet — the card will show a placeholder on the site until one is added.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
                    <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handleSubmit} disabled={uploading}
                      style={{ padding: '9px 22px', background: LIME, border: 'none', borderRadius: 8, color: DARK, fontSize: 12, fontWeight: 700, cursor: uploading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: uploading ? 0.7 : 1 }}>
                      {uploading ? 'Uploading…' : (editArticle ? 'Update Article' : 'Save Article')}
                    </motion.button>
                    <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                      onClick={() => { setShowForm(false); setEditArticle(null); setForm(emptyForm); resetImageState(); }}
                      style={{ padding: '9px 22px', background: HOVER, border: `1px solid ${BORDER}`, borderRadius: 8, color: SUBTEXT, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Cancel
                    </motion.button>
                  </div>
                </div>
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
              placeholder="Search title, category..."
              style={{ ...inputStyle, paddingLeft: 32, borderRadius: 10, height: 36 }} />
          </div>
          <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setStatusFilter(''); }}
            style={{ ...inputStyle, width: 'auto', borderRadius: 10, height: 36, paddingRight: 28 }}>
            <option value="">All Categories</option>
            {NEWS_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <AnimatePresence>
            {activeFilterLabel && (
              <motion.div
                variants={chipVariants} initial="hidden" animate="visible" exit="exit"
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
                <button onClick={clearAllFilters} aria-label="Clear filter"
                  style={{
                    background: 'rgba(0,0,0,0.08)', border: 'none', borderRadius: '50%',
                    width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', color: LIME, fontSize: 10, lineHeight: 1, padding: 0,
                  }}>
                  ✕
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => { setShowForm(true); setEditArticle(null); setForm(emptyForm); resetImageState(); }}
            style={{ padding: '7px 16px', background: LIME, border: 'none', borderRadius: 10, color: DARK, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', height: 36 }}>
            + Add Article
          </motion.button>
        </motion.div>

        {/* ── Stats Row (clickable filters) ── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {statCards.map((s, i) => {
            const active = isCardActive(s);
            return (
              <motion.div key={s.label}
                custom={i} variants={statCardVariants} initial="hidden" animate="visible"
                whileHover={{ y: -3, borderColor: dark ? '#3a3a2a' : '#d1d5db', boxShadow: dark ? '0 6px 16px rgba(0,0,0,0.3)' : '0 6px 16px rgba(0,0,0,0.06)' }}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleStatClick(s)}
                title={s.filterKind === 'all' ? 'Show all articles' : `Filter: ${s.label}`}
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

          {/* Article List */}
          <div>
            {filtered.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: 'center', color: MUTED, padding: '48px 0', fontSize: 13 }}>
                <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }} style={{ marginBottom: 8 }}>
                  <i className="ti ti-news-off" style={{ fontSize: 34, color: MUTED }} />
                </motion.div>
                No articles found.
              </motion.div>
            ) : (
              <AnimatePresence initial={false}>
                {filtered.map((article, i) => {
                  const badge = badgeColors[article.status] || badgeColors.draft;
                  const isActive = activeArticle?.id === article.id;
                  return (
                    <motion.div key={article.id}
                      layout custom={i} variants={articleCardVariants} initial="hidden" animate="visible" exit="exit"
                      whileHover={{ y: -3, boxShadow: dark ? '0 8px 24px rgba(0,0,0,0.35)' : '0 8px 20px rgba(0,0,0,0.08)' }}
                      onClick={() => setActiveArticle(article)}
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
                        background: article.imageUrl ? `url(${article.imageUrl}) center/cover no-repeat` : (dark ? '#282827' : '#f8faf8'),
                        border: `1px solid ${BORDER}`,
                        flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {!article.imageUrl && <i className="ti ti-photo" style={{ fontSize: 28, color: dark ? LIME : '#4a7c59' }} />}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{article.title}</span>
                          <span style={{ background: badge.bg, color: badge.color, padding: '2px 8px 2px 6px', borderRadius: 20, fontSize: 10, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <StatusDot color={badge.color} />
                            {badgeLabel(article.status)}
                          </span>
                        </div>
                        <div style={{ fontSize: 10, color: CATEGORY_COLORS[article.category] || MUTED, fontWeight: 600, marginBottom: 4 }}>
                          🏷 {article.category || '—'}
                        </div>
                        <div style={{ fontSize: 11, color: MUTED, marginBottom: 4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>
                          {article.excerpt || ''}
                        </div>
                        <div style={{ fontSize: 10, color: MUTED }}>{article.publishedAt || '—'}</div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>

          {/* ── Detail Panel ── */}
          <AnimatePresence mode="wait">
            {activeArticle && (
              <motion.div
                key={activeArticle.id}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                style={{
                  background: CARD, borderRadius: 16, border: `1px solid ${BORDER}`,
                  padding: 18, display: 'flex', flexDirection: 'column', gap: 12,
                  position: 'sticky', top: 20,
                  boxShadow: dark ? '0 8px 32px rgba(0,0,0,0.4)' : '0 4px 20px rgba(0,0,0,0.05)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Article Detail</span>
                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handleEdit(activeArticle)}
                    style={{ padding: '5px 14px', background: LIME, border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: DARK }}>
                    Edit
                  </motion.button>
                </div>

                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 6, lineHeight: 1.3 }}>{activeArticle.title}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{
                      background: (badgeColors[activeArticle.status] || badgeColors.draft).bg,
                      color: (badgeColors[activeArticle.status] || badgeColors.draft).color,
                      padding: '2px 8px 2px 6px', borderRadius: 20, fontSize: 10, fontWeight: 600,
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                    }}>
                      <StatusDot color={(badgeColors[activeArticle.status] || badgeColors.draft).color} />
                      {badgeLabel(activeArticle.status)}
                    </span>
                    <span style={{ fontSize: 11, color: CATEGORY_COLORS[activeArticle.category] || MUTED, fontWeight: 600 }}>
                      🏷 {activeArticle.category}
                    </span>
                  </div>
                </div>

                <div style={{
                  width: '100%', height: 130, borderRadius: 12,
                  background: activeArticle.imageUrl ? `url(${activeArticle.imageUrl}) center/cover no-repeat` : (dark ? '#282827' : '#f8faf8'),
                  border: `1px solid ${BORDER}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {!activeArticle.imageUrl && <i className="ti ti-photo" style={{ fontSize: 44, color: dark ? LIME : '#4a7c59' }} />}
                </div>

                <p style={{ fontSize: 11, color: SUBTEXT, lineHeight: 1.7, margin: 0 }}>
                  {activeArticle.excerpt}
                </p>

                {activeArticle.content && (
                  <>
                    <div style={{ height: 1, background: BORDER }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, marginBottom: 6 }}>Full Content</div>
                      <p style={{ fontSize: 11, color: SUBTEXT, lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>{activeArticle.content}</p>
                    </div>
                  </>
                )}

                <div style={{ height: 1, background: BORDER }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: SUBTEXT }}>
                  <CheckIcon /> Published {activeArticle.publishedAt || '—'}
                </div>
                {activeArticle.externalLink && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: SUBTEXT, overflow: 'hidden' }}>
                    <CheckIcon /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeArticle.externalLink}</span>
                  </div>
                )}

                <motion.button whileHover={{ scale: 1.02, background: 'rgba(248,113,113,0.15)' }} whileTap={{ scale: 0.98 }}
                  onClick={() => requestDelete(activeArticle.id)}
                  style={{
                    width: '100%', padding: 9,
                    border: '1px solid rgba(248,113,113,0.3)',
                    borderRadius: 10, background: 'rgba(248,113,113,0.08)',
                    fontSize: 11, color: '#f87171', cursor: 'pointer', fontFamily: 'inherit',
                    fontWeight: 600,
                  }}
                >
                  🗑 Delete Article
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Delete confirmation modal ── */}
        <AnimatePresence>
          {confirmDeleteId && (
            <motion.div
              variants={backdropVariants} initial="hidden" animate="visible" exit="exit"
              onClick={() => setConfirmDeleteId(null)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
            >
              <motion.div
                variants={modalVariants} initial="hidden" animate="visible" exit="exit"
                onClick={e => e.stopPropagation()}
                style={{ background: CARD, borderRadius: 16, border: `1px solid ${BORDER}`, padding: 22, width: 320, boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(248,113,113,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <i className="ti ti-trash" style={{ fontSize: 17, color: '#f87171' }} />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Delete article?</div>
                </div>
                <div style={{ fontSize: 12, color: SUBTEXT, lineHeight: 1.6, marginBottom: 18 }}>
                  {deleteTargetArticle
                    ? <>This will permanently remove <strong style={{ color: TEXT }}>{deleteTargetArticle.title}</strong> from your news list. This can't be undone.</>
                    : 'This will permanently remove this article. This can\'t be undone.'}
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