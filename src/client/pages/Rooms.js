import React, { useEffect, useState } from 'react';
import { db } from '../../firebase/firebase';
import { collection, getDocs } from 'firebase/firestore';

const GREEN = '#2d5a27';
const LIGHT_GREEN = '#4a7c3f';
const GOLD = '#c8a84b';
const LIGHT = '#f0f4e8';
const DARK = '#1a2e1a';

const BambooLogo = ({ size = 36 }) => (
  <svg width={size * 0.82} height={size} viewBox="0 0 36 44" fill="none">
    <rect x="4" y="0" width="5" height="44" rx="2.5" fill="currentColor"/>
    <rect x="4" y="8" width="8" height="3" rx="1.5" fill="currentColor" opacity="0.7"/>
    <rect x="4" y="20" width="10" height="3" rx="1.5" fill="currentColor" opacity="0.7"/>
    <rect x="4" y="32" width="7" height="3" rx="1.5" fill="currentColor" opacity="0.7"/>
    <rect x="14" y="4" width="5" height="40" rx="2.5" fill="currentColor" opacity="0.85"/>
    <rect x="14" y="12" width="9" height="3" rx="1.5" fill="currentColor" opacity="0.6"/>
    <rect x="14" y="24" width="11" height="3" rx="1.5" fill="currentColor" opacity="0.6"/>
    <rect x="25" y="2" width="4" height="38" rx="2" fill="currentColor" opacity="0.65"/>
    <rect x="25" y="14" width="8" height="2.5" rx="1.25" fill="currentColor" opacity="0.5"/>
    <rect x="25" y="26" width="9" height="2.5" rx="1.25" fill="currentColor" opacity="0.5"/>
  </svg>
);

const roomPhotos = [
  'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80',
  'https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=800&q=80',
  'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800&q=80',
  'https://images.unsplash.com/photo-1566665797739-1674de7a421a?w=800&q=80',
  'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=800&q=80',
  'https://images.unsplash.com/photo-1560347876-aeef00ee58a1?w=800&q=80',
];

const statusBadge = (status) => {
  const map = {
    vacant:      { bg: '#d4f550', color: '#1a3a00', label: 'Available' },
    available:   { bg: '#d4f550', color: '#1a3a00', label: 'Available' },
    occupied:    { bg: '#fee2e2', color: '#dc2626', label: 'Occupied' },
    cleaning:    { bg: '#fef9c3', color: '#a16207', label: 'Cleaning' },
    maintenance: { bg: '#f3f4f6', color: '#6b7280', label: 'Maintenance' },
  };
  return map[status] || { bg: '#f3f4f6', color: '#6b7280', label: status };
};

export default function Rooms() {
  const [rooms, setRooms] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [maxPrice, setMaxPrice] = useState(20000);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  const params = new URLSearchParams(window.location.search);
  const checkIn  = params.get('checkIn')  || '';
  const checkOut = params.get('checkOut') || '';

  useEffect(() => {
    const fetchRooms = async () => {
      const snap = await getDocs(collection(db, 'rooms'));
      setRooms(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    };
    fetchRooms();
  }, []);

  const types = ['all', ...new Set(rooms.map(r => r.type).filter(Boolean))];

  const filtered = rooms.filter(r => {
    const matchType   = filter === 'all' || r.type === filter;
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    const matchSearch = !search
      || r.roomNumber?.includes(search)
      || r.type?.toLowerCase().includes(search.toLowerCase())
      || r.amenities?.toLowerCase().includes(search.toLowerCase());
    const matchPrice  = Number(r.price) <= maxPrice;
    return matchType && matchStatus && matchSearch && matchPrice;
  });

  const availableCount = rooms.filter(r => r.status === 'vacant' || r.status === 'available' || r.status === 'available').length;

  return (
    <div style={{ fontFamily: "'Poppins', sans-serif", background: '#f8f9fa', minHeight: '100vh' }}>

      {/* TOP BAR */}
      <div className="responsive-nav" style={{ background: GREEN, padding: '7px 20px', justifyContent: 'space-between', color: 'rgba(255,255,255,0.85)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '11px' }}>
          <span>📍 Calumpit, Bulacan, Philippines</span>
          <span>📞 +63 XXX XXX XXXX</span>
          <span>✉️ info@lawiswiskawayan.com</span>
        </div>
        <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'rgba(255,255,255,0.85)' }}>
          <span style={{ cursor: 'pointer' }}>Facebook</span>
          <span style={{ cursor: 'pointer' }}>Instagram</span>
        </div>
      </div>

      {/* NAVBAR */}
      <nav className="responsive-nav" style={{ background: '#fff', padding: '0 20px', alignItems: 'center', justifyContent: 'space-between', height: '70px', boxShadow: '0 2px 20px rgba(0,0,0,0.08)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={() => window.location.href = '/home'}>
          <div style={{ color: GREEN }}><BambooLogo size={40} /></div>
          <div>
            <div style={{ color: GREEN, fontWeight: '700', fontSize: '18px', lineHeight: 1.1, fontFamily: 'Georgia, serif' }}>Lawiswis Kawayan</div>
            <div style={{ color: GOLD, fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', fontFamily: 'Georgia, serif' }}>Garden Resort</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '28px' }}>
          {['Home', 'Rooms', 'About', 'Contact'].map(n => (
            <button key={n} onClick={() => window.location.href = `/${n.toLowerCase()}`}
              style={{ background: 'none', border: 'none', color: n === 'Rooms' ? GREEN : '#555', fontSize: '13px', fontWeight: n === 'Rooms' ? '700' : '500', cursor: 'pointer', fontFamily: "'Poppins', sans-serif", borderBottom: n === 'Rooms' ? `2px solid ${GREEN}` : '2px solid transparent', paddingBottom: '4px' }}>
              {n}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => window.dispatchEvent(new Event('openGuestChat'))}
            style={{ background: 'transparent', border: `2px solid ${GREEN}`, color: GREEN, borderRadius: '25px', padding: '8px 20px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
            💬 Chat
          </button>
          <button onClick={() => window.location.href = '/home'}
            style={{ background: GREEN, color: '#fff', border: 'none', borderRadius: '25px', padding: '10px 24px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
            ← Back to Home
          </button>
        </div>
      </nav>

      {/* PAGE HEADER BANNER */}
      <div style={{ position: 'relative', background: `linear-gradient(135deg, ${DARK} 0%, #2d5a27 60%, #4a7c3f 100%)`, padding: '56px 20px 60px', overflow: 'hidden' }}>
        {/* decorative circles */}
        <div style={{ position: 'absolute', top: '-60px', right: '-60px', width: '280px', height: '280px', borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ position: 'absolute', bottom: '-40px', left: '40%', width: '180px', height: '180px', borderRadius: '50%', background: 'rgba(255,255,255,0.03)' }} />

        <div className="section-container" style={{ position: 'relative', zIndex: 1, maxWidth: '700px', margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(200,168,75,0.18)', border: `1px solid ${GOLD}`, borderRadius: '20px', padding: '5px 14px', marginBottom: '16px' }}>
            <span style={{ color: GOLD, fontSize: '10px', fontWeight: '700', letterSpacing: '0.12em', textTransform: 'uppercase' }}>🛏 Accommodations</span>
          </div>
          <h1 style={{ color: '#fff', fontSize: '40px', fontWeight: '800', lineHeight: 1.15, marginBottom: '12px', fontFamily: 'Georgia, serif' }}>
            Find Your Perfect<br /><span style={{ color: GOLD }}>Garden Room</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '14px', lineHeight: 1.8, marginBottom: '0' }}>
            {checkIn && checkOut
              ? `Showing availability from ${checkIn} to ${checkOut}`
              : 'Browse our selection of comfortable rooms surrounded by bamboo gardens.'}
          </p>
        </div>

        {/* Stats row inside banner */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px', justifyContent: 'center', marginTop: '32px', position: 'relative', zIndex: 1 }}>
          {[
            { value: rooms.length || '50+', label: 'Total Rooms' },
            { value: availableCount || '—', label: 'Available Now' },
            { value: '4.9★', label: 'Guest Rating' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '12px', padding: '14px 22px', border: '1px solid rgba(255,255,255,0.15)' }}>
              <div style={{ color: '#fff', fontWeight: '800', fontSize: '22px', fontFamily: 'Georgia, serif' }}>{s.value}</div>
              <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '11px', marginTop: '2px' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

{/* MAIN CONTENT */}
<div className="page-wrapper">
  <div className="two-column-layout">

    {/* ── SIDEBAR FILTERS ── */}
    <div style={{
      height: '100%',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      paddingRight: '4px', // room for scrollbar so it doesn't overlap content
    }}>

            {/* Search */}
            <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', padding: '20px' }}>
              <div style={{ fontWeight: '700', fontSize: '13px', color: '#111', marginBottom: '12px' }}>🔍 Search</div>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Room no., type, amenity..."
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '10px 14px', fontSize: '12px', fontFamily: "'Poppins', sans-serif", outline: 'none', color: '#111', boxSizing: 'border-box' }}
              />
            </div>

            {/* Room Type */}
            <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', padding: '20px' }}>
              <div style={{ fontWeight: '700', fontSize: '13px', color: '#111', marginBottom: '14px' }}>🛏 Room Type</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {types.map(t => (
                  <button key={t} onClick={() => setFilter(t)}
                    style={{ padding: '10px 14px', borderRadius: '10px', border: filter === t ? 'none' : '1px solid #e5e7eb', background: filter === t ? GREEN : '#fff', color: filter === t ? '#fff' : '#555', fontSize: '12px', fontWeight: filter === t ? '600' : '500', cursor: 'pointer', fontFamily: "'Poppins', sans-serif", textAlign: 'left', textTransform: 'capitalize', transition: 'all 0.15s' }}>
                    {t === 'all' ? '🏨 All Types' : `🛏 ${t}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Status Filter */}
            <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', padding: '20px' }}>
              <div style={{ fontWeight: '700', fontSize: '13px', color: '#111', marginBottom: '14px' }}>📋 Availability</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  { key: 'all', label: 'All Rooms', emoji: '🏨' },
                  { key: 'vacant', label: 'Available', emoji: '✅' },
                  { key: 'occupied', label: 'Occupied', emoji: '🔴' },
                  { key: 'cleaning', label: 'Cleaning', emoji: '🧹' },
                  { key: 'maintenance', label: 'Maintenance', emoji: '🔧' },
                ].map(s => (
                  <button key={s.key} onClick={() => setStatusFilter(s.key)}
                    style={{ padding: '10px 14px', borderRadius: '10px', border: statusFilter === s.key ? 'none' : '1px solid #e5e7eb', background: statusFilter === s.key ? GREEN : '#fff', color: statusFilter === s.key ? '#fff' : '#555', fontSize: '12px', fontWeight: statusFilter === s.key ? '600' : '500', cursor: 'pointer', fontFamily: "'Poppins', sans-serif", textAlign: 'left', transition: 'all 0.15s' }}>
                    {s.emoji} {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Price Range */}
            <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', padding: '20px' }}>
              <div style={{ fontWeight: '700', fontSize: '13px', color: '#111', marginBottom: '6px' }}>💰 Max Price / Night</div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: GREEN, marginBottom: '12px', fontFamily: 'Georgia, serif' }}>
                ₱{maxPrice.toLocaleString()}
              </div>
              <input type="range" min="500" max="20000" step="500" value={maxPrice} onChange={e => setMaxPrice(Number(e.target.value))}
                style={{ width: '100%', accentColor: GREEN }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#9ca3af', marginTop: '6px' }}>
                <span>₱500</span><span>₱20,000</span>
              </div>
            </div>

            {/* Reset */}
            <button onClick={() => { setFilter('all'); setStatusFilter('all'); setSearch(''); setMaxPrice(20000); }}
              style={{ background: LIGHT, color: GREEN, border: `1px solid ${GREEN}`, borderRadius: '12px', padding: '12px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
              Reset All Filters
            </button>
          </div>

          {/* ── ROOMS GRID ── */}
          <div style={{ height: '100%', overflowY: 'auto', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Results bar */}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '0', background: '#fff', borderRadius: '12px', padding: '14px 18px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '13px', color: '#6b7280' }}>
                Showing <strong style={{ color: '#111' }}>{filtered.length}</strong> of <strong style={{ color: '#111' }}>{rooms.length}</strong> rooms
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px', color: '#6b7280' }}>
                <span style={{ width: '10px', height: '10px', background: '#d4f550', borderRadius: '50%', display: 'inline-block' }} />
                {availableCount} available
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '80px', background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '36px', marginBottom: '12px' }}>🌿</div>
                <div style={{ color: '#9ca3af', fontSize: '13px' }}>Loading rooms...</div>
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '80px', background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '40px', marginBottom: '14px' }}>🔍</div>
                <div style={{ fontWeight: '700', color: '#111', marginBottom: '6px', fontSize: '16px' }}>No rooms found</div>
                <div style={{ color: '#9ca3af', fontSize: '12px' }}>Try adjusting your filters</div>
              </div>
            ) : (
              <div className="responsive-grid-2" style={{ gap: '22px' }}>
                {filtered.map((room, i) => {
                  const badge = statusBadge(room.status);
                  const photo = roomPhotos[i % roomPhotos.length];
                  const amenitiesList = (room.amenities || 'AC, TV, WiFi, Hot Shower').split(',');
                  return (
                    <div key={room.id}
                      style={{ background: '#fff', borderRadius: '20px', border: '1px solid #e5e7eb', overflow: 'hidden', transition: 'all 0.22s', cursor: 'pointer', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = '0 16px 40px rgba(0,0,0,0.12)'; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.05)'; }}>

                      {/* Room Photo */}
                      <div style={{ position: 'relative', height: '190px', overflow: 'hidden' }}>
                        <img src={photo} alt={`Room ${room.roomNumber}`}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.4s' }}
                          onMouseEnter={e => e.target.style.transform = 'scale(1.05)'}
                          onMouseLeave={e => e.target.style.transform = 'scale(1)'}
                        />
                        {/* overlay gradient */}
                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.35) 0%, transparent 60%)' }} />

                        {/* Status badge */}
                        <div style={{ position: 'absolute', top: '12px', left: '12px', background: badge.bg, color: badge.color, borderRadius: '8px', padding: '4px 12px', fontSize: '10px', fontWeight: '700', letterSpacing: '0.05em' }}>
                          {badge.label}
                        </div>

                        {/* Room type badge */}
                        <div style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(0,0,0,0.55)', color: '#fff', borderRadius: '8px', padding: '4px 10px', fontSize: '10px', fontWeight: '500' }}>
                          {room.type}
                        </div>

                        {/* Price overlay at bottom */}
                        <div style={{ position: 'absolute', bottom: '12px', right: '14px' }}>
                          <span style={{ fontSize: '20px', fontWeight: '800', color: '#fff', fontFamily: 'Georgia, serif', textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}>
                            ₱{Number(room.price).toLocaleString()}
                          </span>
                          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.8)', marginLeft: '2px' }}>/night</span>
                        </div>
                      </div>

                      {/* Card Body */}
                      <div style={{ padding: '18px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                          <div>
                            <div style={{ fontWeight: '700', fontSize: '16px', color: '#111' }}>Room {room.roomNumber}</div>
                            <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px', textTransform: 'capitalize' }}>{room.type} Room</div>
                          </div>
                          {/* Stars */}
                          <div style={{ color: GOLD, fontSize: '13px' }}>★★★★★</div>
                        </div>

                        {room.description && (
                          <p style={{ fontSize: '12px', color: '#6b7280', lineHeight: '1.7', marginBottom: '12px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {room.description}
                          </p>
                        )}

                        {/* Amenity tags */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
                          {amenitiesList.slice(0, 4).map(a => (
                            <span key={a} style={{ background: LIGHT, color: GREEN, borderRadius: '6px', padding: '3px 10px', fontSize: '10px', fontWeight: '600' }}>
                              {a.trim()}
                            </span>
                          ))}
                          {amenitiesList.length > 4 && (
                            <span style={{ background: '#f3f4f6', color: '#9ca3af', borderRadius: '6px', padding: '3px 10px', fontSize: '10px', fontWeight: '600' }}>
                              +{amenitiesList.length - 4} more
                            </span>
                          )}
                        </div>

                        {/* Divider */}
                        <div style={{ borderTop: '1px solid #f3f4f6', marginBottom: '14px' }} />

                        {/* Book button */}
                        <button
  disabled={room.status !== 'vacant' && room.status !== 'available'}
  onClick={() => window.location.href = `/book/${room.id}${checkIn ? `?checkIn=${checkIn}&checkOut=${checkOut}` : ''}`}
  style={{
    width: '100%',
    background: (room.status === 'vacant' || room.status === 'available') ? GREEN : '#f3f4f6',
    color: (room.status === 'vacant' || room.status === 'available') ? '#fff' : '#9ca3af',
    border: 'none', borderRadius: '12px', padding: '12px',
    fontSize: '13px', fontWeight: '700',
    cursor: (room.status === 'vacant' || room.status === 'available') ? 'pointer' : 'not-allowed',
    fontFamily: "'Poppins', sans-serif",
    transition: 'background 0.15s',
  }}
  onMouseEnter={e => { if (room.status === 'vacant' || room.status === 'available') e.target.style.background = LIGHT_GREEN; }}
  onMouseLeave={e => { if (room.status === 'vacant' || room.status === 'available') e.target.style.background = GREEN; }}
>
  {(room.status === 'vacant' || room.status === 'available') ? 'Book Now →' : badge.label}
</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CTA BANNER */}
      <div style={{ background: `linear-gradient(135deg, ${GREEN}, ${LIGHT_GREEN})`, padding: '60px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '11px', color: GOLD, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '12px' }}>Need Help Choosing?</div>
        <h2 style={{ fontSize: '30px', fontWeight: '700', color: '#fff', marginBottom: '10px', fontFamily: 'Georgia, serif' }}>Talk to Our Concierge</h2>
        <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '13px', marginBottom: '24px' }}>Our team is happy to help you find the perfect room for your stay.</p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button onClick={() => window.dispatchEvent(new Event('openGuestChat'))}
            style={{ background: '#fff', color: GREEN, border: 'none', borderRadius: '30px', padding: '13px 32px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
            💬 Chat With Us
          </button>
          <button onClick={() => window.location.href = '/contact'}
            style={{ background: 'transparent', color: '#fff', border: '2px solid rgba(255,255,255,0.5)', borderRadius: '30px', padding: '13px 32px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
            Contact Us
          </button>
        </div>
      </div>

      {/* FOOTER */}
      <footer style={{ background: '#0d1a0d', color: '#9ca3af', padding: '30px 20px', textAlign: 'center', fontSize: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>© 2026 Lawiswis Kawayan Garden Resort. All rights reserved.</span>
          <span>Made with 🎋 in Bulacan</span>
        </div>
      </footer>
    </div>
  );
}