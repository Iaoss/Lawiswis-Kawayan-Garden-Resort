import React, { useState, useEffect } from 'react';
import { db } from '../../firebase/firebase';
import { collection, getDocs } from 'firebase/firestore';
import PageLayout from '../components/PageLayout';
import { useSettings } from '../components/SettingsContext';
import { BeamAvatar, guestAvatarSeed } from '../../components/ui/beam-avatar.tsx';

const normalizeStatus = status => String(status || 'pending').toLowerCase().trim().replace(/[\s_]+/g, '-');
const dateKey = value => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = typeof value.toDate === 'function'
    ? value.toDate()
    : typeof value.seconds === 'number' ? new Date(value.seconds * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export default function CustomerManagement() {
  const { settings, formatDate } = useSettings();
  const dark = settings?.darkMode;

  // ── Theme tokens (mirrors PageLayout's light/dark palette) ──
  const ACCENT      = settings?.accentColor || '#9cb56f';
  const BG      = dark ? '#020b09' : '#f4f6f4';
  const CARD    = dark ? '#1c1c1c' : '#ffffff';
  const CARD2   = dark ? '#282827' : '#f9fafb';
  const BORDER  = dark ? '#2a2a28' : '#e5e7eb';
  const TEXT    = dark ? '#f0f0f0' : '#1f2937';
  const SUBTEXT = dark ? '#c7c7c0' : '#4b5563';
  const MUTED   = dark ? '#9ca3af' : '#9ca3af';
  const MUTED2  = dark ? '#7a7a72' : '#9ca3af';
  const GREEN   = dark ? '#86efac' : '#16a34a';
  const SELECTED_BG = dark ? '#1e3a5f' : '#eff6ff';
  const HOVER_BG    = dark ? '#242422' : '#eff6ff';
  const STATUS_BG   = dark ? '#1e3a5f' : '#dbeafe';
  const STATUS_TEXT = dark ? '#93c5fd' : '#1d4ed8';

  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [stayFilter, setStayFilter] = useState('all');
  const [checkInStart, setCheckInStart] = useState('');
  const [checkInEnd, setCheckInEnd] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const fetch = async () => {
      const snap = await getDocs(collection(db, 'reservations'));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Group by guest name + phone
      const map = {};
      data.forEach(r => {
        const key = r.phone || r.guestName;
        if (!map[key]) {
          map[key] = {
            guestName: r.guestName,
            email: r.email,
            phone: r.phone,
            address: r.address,
            stays: [],
          };
        }
        map[key].stays.push(r);
      });
      setCustomers(Object.values(map));
    };
    fetch();
  }, []);

  const filtered = customers.filter(c => {
    const normalizedSearch = search.trim().toLowerCase();
    const matchesSearch = String(c.guestName || '').toLowerCase().includes(normalizedSearch) ||
      String(c.phone || '').includes(search.trim()) ||
      String(c.email || '').toLowerCase().includes(normalizedSearch);
    const matchesStayCount = stayFilter === 'all' ||
      (stayFilter === 'repeat' ? c.stays.length > 1 : c.stays.length === 1);
    const matchesStayCriteria = c.stays.some(stay => {
      const checkIn = dateKey(stay.checkIn);
      const matchesStatus = statusFilter === 'all' || normalizeStatus(stay.status) === statusFilter;
      const matchesCheckIn = (!checkInStart && !checkInEnd) ||
        (checkIn && (!checkInStart || checkIn >= checkInStart) &&
        (!checkInEnd || checkIn <= checkInEnd));
      return matchesStatus && matchesCheckIn;
    });
    return matchesSearch && matchesStayCount && matchesStayCriteria;
  });

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setStayFilter('all');
    setCheckInStart('');
    setCheckInEnd('');
  };

  /* ── shared styles ── */
  const card = { background: CARD, borderRadius: '12px', border: `1px solid ${BORDER}`, boxShadow: dark ? '0 4px 16px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.06)' };

  return (
    <PageLayout>
      <div style={{ fontFamily: "'Poppins', sans-serif", background: BG, minHeight: '100vh', padding: '20px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: '700', color: TEXT, marginBottom: '22px' }}>Customer Management</h2>

        <div style={{ ...card, padding: '14px', marginBottom: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', alignItems: 'end' }}>
          <div>
            <label htmlFor="customer-search" style={{ display: 'block', fontSize: '12px', color: SUBTEXT, marginBottom: '4px' }}>Search</label>
            <input id="customer-search" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Name, phone, or email..."
              style={{ border: `1px solid ${BORDER}`, borderRadius: '8px', padding: '9px 12px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", width: '100%', background: CARD2, color: TEXT, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label htmlFor="customer-status-filter" style={{ display: 'block', fontSize: '12px', color: SUBTEXT, marginBottom: '4px' }}>Reservation Status</label>
            <select id="customer-status-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              style={{ border: `1px solid ${BORDER}`, borderRadius: '8px', padding: '9px 12px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", width: '100%', background: CARD2, color: TEXT }}>
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="checked-in">Checked In</option>
              <option value="checked-out">Checked Out</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label htmlFor="customer-stay-filter" style={{ display: 'block', fontSize: '12px', color: SUBTEXT, marginBottom: '4px' }}>Stay Frequency</label>
            <select id="customer-stay-filter" value={stayFilter} onChange={e => setStayFilter(e.target.value)}
              style={{ border: `1px solid ${BORDER}`, borderRadius: '8px', padding: '9px 12px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", width: '100%', background: CARD2, color: TEXT }}>
              <option value="all">All Customers</option>
              <option value="new">One Stay</option>
              <option value="repeat">Repeat Guests</option>
            </select>
          </div>
          <div>
            <label htmlFor="customer-checkin-start" style={{ display: 'block', fontSize: '12px', color: SUBTEXT, marginBottom: '4px' }}>Stay Check-in From</label>
            <input id="customer-checkin-start" type="date" value={checkInStart} max={checkInEnd || undefined} onChange={e => setCheckInStart(e.target.value)}
              style={{ border: `1px solid ${BORDER}`, borderRadius: '8px', padding: '9px 12px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", width: '100%', background: CARD2, color: TEXT, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label htmlFor="customer-checkin-end" style={{ display: 'block', fontSize: '12px', color: SUBTEXT, marginBottom: '4px' }}>Stay Check-in To</label>
            <input id="customer-checkin-end" type="date" value={checkInEnd} min={checkInStart || undefined} onChange={e => setCheckInEnd(e.target.value)}
              style={{ border: `1px solid ${BORDER}`, borderRadius: '8px', padding: '9px 12px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", width: '100%', background: CARD2, color: TEXT, boxSizing: 'border-box' }} />
          </div>
          <button type="button" onClick={resetFilters}
            style={{ border: `1px solid ${BORDER}`, borderRadius: '8px', padding: '9px 12px', background: CARD2, color: SUBTEXT, fontSize: '13px', fontFamily: "'Poppins', sans-serif", cursor: 'pointer' }}>
            Reset Filters
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
          {/* Customer List */}
          <div style={{ ...card, gridColumn: 'span 1', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: CARD2, borderBottom: `1px solid ${BORDER}` }}>
              <h3 style={{ fontWeight: '600', color: SUBTEXT, fontSize: '13px', margin: 0 }}>Guests ({filtered.length})</h3>
            </div>
            {filtered.length === 0 ? (
              <p style={{ textAlign: 'center', color: MUTED, padding: '32px 0', fontSize: '13px' }}>No customers found.</p>
            ) : (
              filtered.map((c, i) => (
                <div key={i} onClick={() => setSelected(c)}
                  style={{
                    padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, cursor: 'pointer',
                    background: selected?.phone === c.phone ? SELECTED_BG : 'transparent',
                    borderLeft: selected?.phone === c.phone ? `4px solid ${ACCENT}` : '4px solid transparent',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => { if (selected?.phone !== c.phone) e.currentTarget.style.background = HOVER_BG; }}
                  onMouseLeave={e => { if (selected?.phone !== c.phone) e.currentTarget.style.background = 'transparent'; }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <BeamAvatar seed={guestAvatarSeed(c)} size={34} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontWeight: '600', fontSize: '13px', color: TEXT, margin: 0 }}>{c.guestName}</p>
                      <p style={{ fontSize: '11px', color: MUTED, margin: '2px 0 0' }}>{c.phone}</p>
                      <p style={{ fontSize: '11px', color: MUTED2, margin: '2px 0 0' }}>{c.stays.length} stay(s)</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Customer Details */}
          <div style={{ gridColumn: 'span 2' }}>
            {!selected ? (
              <div style={{ ...card, padding: '32px', textAlign: 'center', color: MUTED }}>
                Select a guest to view details
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ ...card, padding: '22px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                    <BeamAvatar seed={guestAvatarSeed(selected)} size={48} title={`${selected.guestName || 'Guest'}'s avatar`} />
                    <h3 style={{ fontWeight: '600', color: TEXT, margin: 0, fontSize: '14px' }}>Guest Profile</h3>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', fontSize: '13px' }}>
                    <div>
                      <p style={{ color: MUTED, margin: 0 }}>Full Name</p>
                      <p style={{ fontWeight: '600', color: TEXT, margin: '2px 0 0' }}>{selected.guestName}</p>
                    </div>
                    <div>
                      <p style={{ color: MUTED, margin: 0 }}>Phone</p>
                      <p style={{ fontWeight: '600', color: TEXT, margin: '2px 0 0' }}>{selected.phone || '—'}</p>
                    </div>
                    <div>
                      <p style={{ color: MUTED, margin: 0 }}>Email</p>
                      <p style={{ fontWeight: '600', color: TEXT, margin: '2px 0 0' }}>{selected.email || '—'}</p>
                    </div>
                    <div>
                      <p style={{ color: MUTED, margin: 0 }}>Address</p>
                      <p style={{ fontWeight: '600', color: TEXT, margin: '2px 0 0' }}>{selected.address || '—'}</p>
                    </div>
                    <div>
                      <p style={{ color: MUTED, margin: 0 }}>Total Stays</p>
                      <p style={{ fontWeight: '600', color: TEXT, margin: '2px 0 0' }}>{selected.stays.length}</p>
                    </div>
                    <div>
                      <p style={{ color: MUTED, margin: 0 }}>Total Spent</p>
                      <p style={{ fontWeight: '600', color: GREEN, margin: '2px 0 0' }}>
                        ₱{selected.stays.reduce((s, r) => s + Number(r.totalAmount || 0), 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Stay History */}
                <div style={{ ...card, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', background: CARD2, borderBottom: `1px solid ${BORDER}` }}>
                    <h3 style={{ fontWeight: '600', color: SUBTEXT, fontSize: '13px', margin: 0 }}>Stay History</h3>
                  </div>
                  <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                    <thead style={{ background: CARD2 }}>
                      <tr>
                        {['Room', 'Check-in', 'Check-out', 'Amount', 'Status'].map(h => (
                          <th key={h} style={{ padding: '10px 16px', textAlign: 'left', color: SUBTEXT, fontWeight: '600', fontSize: '12px' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selected.stays.map((r, i) => (
                        <tr key={i} style={{ borderTop: `1px solid ${BORDER}`, transition: 'background 0.12s' }}
                          onMouseEnter={e => e.currentTarget.style.background = HOVER_BG}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <td style={{ padding: '10px 16px', color: TEXT }}>Room {r.roomNumber}</td>
                          <td style={{ padding: '10px 16px', color: TEXT }}>{formatDate(r.checkIn)}</td>
                          <td style={{ padding: '10px 16px', color: TEXT }}>{formatDate(r.checkOut)}</td>
                          <td style={{ padding: '10px 16px', color: TEXT }}>₱{Number(r.totalAmount).toLocaleString()}</td>
                          <td style={{ padding: '10px 16px', textTransform: 'capitalize' }}>
                            <span style={{ background: STATUS_BG, color: STATUS_TEXT, padding: '3px 10px', borderRadius: '20px', fontSize: '11px' }}>
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}