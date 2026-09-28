import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { BRASS, CREAM, FOREST, INK, LINE, MOSS, PAPER, SERIF, SANS, FALLBACK_ROOM_IMAGES, resolveRoomImage } from '../components/clientTheme';import OccupancyBadge from '../components/OccupancyBadge';

const isAvailable = room => room.status === 'vacant' || room.status === 'available';

export default function Rooms() {
  const [rooms, setRooms] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const params = new URLSearchParams(window.location.search);
  const checkIn = params.get('checkIn') || '';
  const checkOut = params.get('checkOut') || '';

  useEffect(() => {
    getDocs(collection(db, 'rooms'))
      .then((snapshot) => {
        setRooms(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const types = ['all', ...new Set(rooms.map((room) => room.type).filter(Boolean))];
  const filtered = rooms.filter((room) => {
    const text = `${room.roomNumber || ''} ${room.type || ''} ${room.amenities || ''}`.toLowerCase();
    return (filter === 'all' || room.type === filter) && (!search || text.includes(search.toLowerCase()));
  });
  const availableCount = rooms.filter(isAvailable).length;

  return (
    <div style={{ background: PAPER, minHeight: '100vh', color: INK }}>
      <style>{`
        .rooms-page-shell * { box-sizing: border-box; }
        .rooms-hero-grid { display: grid; grid-template-columns: 1.4fr 0.8fr; gap: 28px; align-items: end; }
        .rooms-tag { letter-spacing: 0.2em; text-transform: uppercase; font-size: 11px; font-weight: 600; }
        .rooms-filter-chip { border: 1px solid ${LINE}; background: transparent; color: ${FOREST}; padding: 11px 14px; border-radius: 999px; font: 600 11px ${SANS}; cursor: pointer; text-transform: capitalize; transition: all 0.2s ease; }
        .rooms-filter-chip.active { background: ${FOREST}; color: #fff; border-color: ${FOREST}; }
        .rooms-card { background: #fff; border: 1px solid ${LINE}; border-radius: 18px; overflow: hidden; transition: transform 0.25s ease, box-shadow 0.25s ease; }
        .rooms-card:hover { transform: translateY(-4px); box-shadow: 0 18px 40px rgba(35,42,27,.13); }
        @media (max-width: 900px) {
          .rooms-hero-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <section
        style={{
          position: 'relative',
          background: `linear-gradient(90deg, rgba(20,25,15,0.76) 0%, rgba(20,25,15,0.48) 40%, rgba(20,25,15,0.62) 100%), url('https://lawiswiskawayanresort.com/wp-content/uploads/2020/01/hero192x-scaled.jpg') center/cover no-repeat`,
          padding: '120px 24px 64px',
          borderBottom: `1px solid ${LINE}`,
        }}
      >
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div className="rooms-hero-grid">
            <div style={{ color: '#fff' }}>
              <div className="rooms-tag" style={{ color: '#e9ddb0', marginBottom: '16px' }}>Accommodations</div>
              <h1 style={{ margin: '0 0 18px', color: '#fff', font: `500 clamp(40px, 6vw, 72px)/0.96 ${SERIF}`, maxWidth: '680px' }}>
                A room for the way you want to stay.
              </h1>
              <p style={{ margin: '0 0 22px', maxWidth: '560px', color: 'rgba(255,255,255,0.82)', font: `14px/1.8 ${SANS}` }}>
                {checkIn && checkOut
                  ? `Showing rooms for ${checkIn} to ${checkOut}.` 
                  : 'Sleep beneath the bamboo canopy, with room to gather, rest, and breathe.'}
              </p>
              <OccupancyBadge startDate={checkIn || undefined} endDate={checkOut || undefined} style={{ fontFamily: SANS, background: 'rgba(255,255,255,0.9)' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end' }}>
              <div style={{ width: '100%', maxWidth: '340px', background: 'rgba(247,242,235,0.96)', borderRadius: '18px', padding: '24px 22px', border: `1px solid rgba(35,42,27,0.08)`, boxShadow: '0 20px 50px rgba(20,25,15,0.16)' }}>
                <div className="rooms-tag" style={{ color: MOSS, marginBottom: '12px' }}>At a glance</div>
                <div style={{ fontFamily: SERIF, fontSize: '46px', lineHeight: 1, color: FOREST }}>32</div>
                <div style={{ font: `600 11px ${SANS}`, letterSpacing: '0.12em', color: '#6d675f', textTransform: 'uppercase', marginBottom: '18px' }}>Rooms & suites</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
                  <div>
                    <div style={{ fontFamily: SERIF, fontSize: '30px', color: FOREST }}>{availableCount}</div>
                    <div style={{ font: `600 10px ${SANS}`, letterSpacing: '0.12em', color: '#777363', textTransform: 'uppercase' }}>Available</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: SERIF, fontSize: '30px', color: FOREST }}>{rooms.length}</div>
                    <div style={{ font: `600 10px ${SANS}`, letterSpacing: '0.12em', color: '#777363', textTransform: 'uppercase' }}>Total</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '48px 24px 100px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: '20px', flexWrap: 'wrap', marginBottom: '32px' }}>
          <div>
            <div className="rooms-tag" style={{ color: BRASS, marginBottom: '8px' }}>Find your fit</div>
            <h2 style={{ color: INK, margin: 0, font: `500 32px ${SERIF}` }}>Stay a little closer to nature</h2>
          </div>
          <div style={{ color: '#777363', font: `12px ${SANS}` }}>
            <strong style={{ color: FOREST }}>{availableCount}</strong> available now · {rooms.length} rooms total
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '30px' }}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by room name or amenity"
            style={{
              flex: '1 1 260px',
              minWidth: '220px',
              border: `1px solid ${LINE}`,
              borderRadius: '999px',
              background: '#fff',
              padding: '14px 18px',
              color: INK,
              font: `12px ${SANS}`,
              outline: 'none',
            }}
          />
          {types.map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`rooms-filter-chip ${filter === type ? 'active' : ''}`}
            >
              {type === 'all' ? 'All rooms' : type}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: '70px 0', textAlign: 'center', color: MOSS, font: `14px ${SANS}` }}>
            Gathering the available rooms...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '70px 0', textAlign: 'center', color: '#777363', font: `14px ${SANS}` }}>
            No rooms match those filters.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
            {filtered.map((room, index) => {
              const photo = resolveRoomImage(room) || FALLBACK_ROOM_IMAGES[index % FALLBACK_ROOM_IMAGES.length];
              const roomAvailable = isAvailable(room);
              const amenities = String(room.amenities || 'Air conditioning, Wi-Fi, Hot shower')
                .split(',')
                .slice(0, 3);

              return (
                <article key={room.id} className="rooms-card">
                  <div style={{ height: '220px', position: 'relative', overflow: 'hidden' }}>
                    <img src={photo} alt={`Room ${room.roomNumber}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 45%, rgba(20,25,15,.66))' }} />
                    <span style={{ position: 'absolute', left: '16px', bottom: '16px', color: '#fff', font: `500 24px ${SERIF}` }}>
                      Room {room.roomNumber}
                    </span>
                    <span
                      style={{
                        position: 'absolute',
                        right: '14px',
                        top: '14px',
                        background: roomAvailable ? CREAM : 'rgba(35,42,27,.78)',
                        color: roomAvailable ? FOREST : '#fff',
                        padding: '6px 10px',
                        borderRadius: '999px',
                        font: `600 10px ${SANS}`,
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                      }}
                    >
                      {roomAvailable ? 'Available' : room.status}
                    </span>
                  </div>

                  <div style={{ padding: '20px' }}>
                    <div style={{ color: MOSS, font: `600 10px ${SANS}`, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '8px' }}>
                      {room.type || 'Garden room'}
                    </div>
                    <p style={{ color: '#6b6a5c', font: `12px/1.7 ${SANS}`, minHeight: '41px', margin: '0 0 16px' }}>
                      {room.description || 'A comfortable stay surrounded by the quiet rhythm of the garden.'}
                    </p>

                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '18px' }}>
                      {amenities.map((amenity) => (
                        <span key={amenity} style={{ background: CREAM, color: FOREST, padding: '5px 8px', font: `10px ${SANS}`, borderRadius: '3px' }}>
                          {amenity.trim()}
                        </span>
                      ))}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${LINE}`, paddingTop: '16px' }}>
                      <span style={{ color: INK, font: `600 20px ${SERIF}` }}>
                        ₱{Number(room.price || 0).toLocaleString()}
                        <small style={{ color: '#8d8877', font: `10px ${SANS}` }}> / night</small>
                      </span>

                      <button
                        disabled={!roomAvailable}
                        onClick={() => {
                          const nextUrl = `/book/${room.id}${checkIn ? `?checkIn=${checkIn}&checkOut=${checkOut}` : ''}`;
                          window.location.href = nextUrl;
                        }}
                        style={{
                          background: roomAvailable ? FOREST : '#e5e1d4',
                          color: roomAvailable ? '#fff' : '#989382',
                          border: 0,
                          borderRadius: '999px',
                          padding: '11px 16px',
                          font: `600 11px ${SANS}`,
                          cursor: roomAvailable ? 'pointer' : 'not-allowed',
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {roomAvailable ? 'Book room' : 'Unavailable'}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}