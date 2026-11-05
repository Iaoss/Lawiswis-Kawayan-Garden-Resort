import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { BRASS, CREAM, FOREST, INK, LINE, MOSS, PAPER, SERIF, SANS } from '../components/clientTheme';
import OccupancyBadge from '../components/OccupancyBadge';
import { useResortAvailability } from '../components/ResortAvailabilityContext';
import { IMAGE_WIDTHS, optimizeImage } from '../../lib/imageUrl';

import { GROUPS, OTHER_GROUP, UP, decorateRoom } from '../lib/roomCatalog';

const HERO_IMAGE = optimizeImage(`${UP}2020/01/hero192x-scaled.jpg`, IMAGE_WIDTHS.hero);

const peso = value => `₱${Number(value || 0).toLocaleString('en-PH')}`;

export default function Rooms() {
  const location = useLocation();
  const navigate = useNavigate();
  const { available: resortAvailable, error: availabilityStatusError, loading: resortStatusLoading } = useResortAvailability();
  const canBook = resortAvailable && !resortStatusLoading && !availabilityStatusError;
  const [rooms, setRooms] = useState([]);
  const [filter, setFilter] = useState(() => new URLSearchParams(window.location.search).get('category') || 'all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [photoIndex, setPhotoIndex] = useState(0);

  useEffect(() => {
    setFilter(new URLSearchParams(location.search).get('category') || 'all');
  }, [location.search]);

  useEffect(() => {
    getDocs(collection(db, 'rooms'))
      .then(snapshot => {
        setRooms(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Close the detail dialog with Escape.
  useEffect(() => {
    if (!selectedRoom) return undefined;
    const onKey = event => { if (event.key === 'Escape') setSelectedRoom(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedRoom]);

  /* Every room is listed with its own price and description. Dates are  */
  /* chosen in the booking steps after pressing Book now.                */
  const allRooms = useMemo(() => rooms.map(decorateRoom), [rooms]);

  const groupTitles = useMemo(() => {
    const present = new Set(allRooms.map(room => room.groupTitle));
    const ordered = GROUPS.map(group => group.title).filter(title => present.has(title));
    const extras = [...present].filter(title => !ordered.includes(title));
    return [...ordered, ...extras];
  }, [allRooms]);

  const visible = allRooms.filter(room => {
    const text = `${room.title} ${room.groupTitle} ${room.description} ${room.amenities.join(' ')}`.toLowerCase();
    const matchesText = !search || text.includes(search.toLowerCase());
    const roomType = String(room.type || room.groupTitle || '');
    const matchesGroup = filter === 'all'
      || room.groupTitle === filter
      || (filter === 'Regular Rooms' && /^(standard|regular rooms?)$/i.test(roomType))
      || (filter === 'Suite Rooms' && /(suite|villa)/i.test(roomType));
    return matchesText && matchesGroup;
  });

  const sections = groupTitles
    .map(title => ({
      title,
      info: GROUPS.find(group => group.title === title) || OTHER_GROUP,
      items: visible.filter(room => room.groupTitle === title),
    }))
    .filter(section => section.items.length);

  const openRoom = room => { setPhotoIndex(0); setSelectedRoom(room); };
  // Book now starts the booking steps with this room picked: next the guest
  // chooses the stay type and dates, and the room is checked for those dates.
  const bookRoom = room => {
    if (!canBook) return;
    navigate(`/book?room=${encodeURIComponent(room.id)}&type=personal`);
  };

  const bookLabel = () => (canBook ? 'Book now' : resortStatusLoading ? 'Checking…' : availabilityStatusError ? 'Booking unavailable' : 'Reservations closed');
  const bookButtonStyle = () => {
    const disabled = !canBook;
    return {
      background: disabled ? '#e5e1d4' : FOREST,
      color: disabled ? '#989382' : '#fff',
      border: 0,
      borderRadius: '999px',
      padding: '11px 16px',
      font: `600 11px ${SANS}`,
      cursor: disabled ? 'not-allowed' : 'pointer',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
    };
  };

  return (
    <div style={{ background: PAPER, minHeight: '100vh', color: INK }}>
      <style>{`
        .rooms-page-shell * { box-sizing: border-box; }
        .rooms-hero-grid { display: grid; grid-template-columns: 1.4fr 0.8fr; gap: 28px; align-items: end; }
        .rooms-tag { letter-spacing: 0.2em; text-transform: uppercase; font-size: 11px; font-weight: 600; }
        .rooms-filter-chip { border: 1px solid ${LINE}; background: transparent; color: ${FOREST}; padding: 11px 14px; border-radius: 999px; font: 600 11px ${SANS}; cursor: pointer; transition: all 0.2s ease; }
        .rooms-filter-chip.active { background: ${FOREST}; color: #fff; border-color: ${FOREST}; }
        .rooms-card { background: #fff; border: 1px solid ${LINE}; border-radius: 18px; overflow: hidden; display: flex; flex-direction: column; transition: transform 0.25s ease, box-shadow 0.25s ease; }
        .rooms-card:hover { transform: translateY(-4px); box-shadow: 0 18px 40px rgba(35,42,27,.13); }
        .rooms-card-photo { padding: 0; border: 0; background: none; display: block; width: 100%; cursor: pointer; }
        .rooms-link { border: 0; background: transparent; color: ${FOREST}; text-decoration: underline; cursor: pointer; font: 600 11px ${SANS}; padding: 0; }
        .rooms-modal-backdrop { position: fixed; inset: 0; background: rgba(20,25,15,.6); z-index: 1000; display: flex; align-items: flex-start; justify-content: center; padding: 32px 16px; overflow-y: auto; }
        .rooms-modal { background: #fff; border-radius: 18px; width: 100%; max-width: 900px; overflow: hidden; position: relative; }
        .rooms-modal-body { display: grid; grid-template-columns: 1.1fr 1fr; gap: 28px; padding: 28px; }
        .rooms-thumb { border: 2px solid transparent; padding: 0; background: none; cursor: pointer; border-radius: 6px; overflow: hidden; width: 64px; height: 44px; flex: none; }
        .rooms-thumb.active { border-color: ${FOREST}; }
        button:focus-visible, input:focus-visible { outline: 2px solid ${BRASS}; outline-offset: 2px; }
        @media (max-width: 900px) {
          .rooms-hero-grid { grid-template-columns: 1fr; }
          .rooms-modal-body { grid-template-columns: 1fr; padding: 20px; }
        }
      `}</style>

      {/* Hero */}
      <section
        style={{
          position: 'relative',
          background: `linear-gradient(90deg, rgba(20,25,15,0.76) 0%, rgba(20,25,15,0.48) 40%, rgba(20,25,15,0.62) 100%), url('${HERO_IMAGE}') center/cover no-repeat`,
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
                Sleep beneath the bamboo canopy, with room to gather, rest, and breathe. Press Book now on any room to pick your dates.
              </p>
              <OccupancyBadge style={{ fontFamily: SANS }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end' }}>
              <div style={{ width: '100%', maxWidth: '340px', background: 'rgba(247,242,235,0.96)', borderRadius: '18px', padding: '24px 22px', border: '1px solid rgba(35,42,27,0.08)', boxShadow: '0 20px 50px rgba(20,25,15,0.16)' }}>
                <div className="rooms-tag" style={{ color: MOSS, marginBottom: '12px' }}>At a glance</div>
                <div style={{ fontFamily: SERIF, fontSize: '30px', lineHeight: 1.1, color: FOREST }}>
                  {allRooms.length || '—'}
                </div>
                <div style={{ font: `600 11px ${SANS}`, letterSpacing: '0.12em', color: '#6d675f', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Rooms in the resort
                </div>
                <div style={{ color: '#777363', font: `12px/1.6 ${SANS}` }}>
                  You choose your dates after pressing Book now.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '48px 24px 100px' }}>
        {/* Rooms */}
        <div style={{ marginBottom: '20px' }}>
          <div className="rooms-tag" style={{ color: BRASS, marginBottom: '8px' }}>Our rooms</div>
          <h2 style={{ color: INK, margin: 0, font: `500 32px ${SERIF}` }}>
            Rooms &amp; rates
          </h2>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search by room name or amenity"
            aria-label="Search rooms"
            style={{ flex: '1 1 260px', minWidth: '220px', border: `1px solid ${LINE}`, borderRadius: '999px', background: '#fff', padding: '14px 18px', color: INK, font: `12px ${SANS}`, outline: 'none' }}
          />
        </div>
        <div className="rooms-filter-row" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '40px' }}>
          {['all', ...groupTitles].map(title => (
            <button key={title} type="button" onClick={() => setFilter(title)} className={`rooms-filter-chip ${filter === title ? 'active' : ''}`}>
              {title === 'all' ? 'All rooms' : title}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: '70px 0', textAlign: 'center', color: MOSS, font: `14px ${SANS}` }}>Gathering our rooms...</div>
        ) : sections.length === 0 ? (
          <div style={{ padding: '70px 0', textAlign: 'center', color: '#777363', font: `14px ${SANS}` }}>
            {rooms.length === 0 ? 'No rooms could be loaded right now. Please refresh the page.' : 'No rooms match those filters.'}
          </div>
        ) : (
          sections.map(section => (
            <section key={section.title} style={{ marginBottom: '56px' }}>
              <div style={{ marginBottom: '20px', maxWidth: '720px' }}>
                <h3 style={{ margin: '0 0 6px', color: FOREST, font: `500 26px ${SERIF}` }}>{section.title}</h3>
                {section.info.intro && <p style={{ margin: 0, color: '#6b6a5c', font: `13px/1.7 ${SANS}` }}>{section.info.intro}</p>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
                {section.items.map((room, roomIndex) => {
                  return (
                    <article key={room.id} className="rooms-card lk-enter" style={{ '--lk-delay': `${Math.min(roomIndex, 8) * 60}ms` }}>
                      <button type="button" className="rooms-card-photo" onClick={() => openRoom(room)} aria-label={`View ${room.title}`}>
                        <div style={{ height: '220px', position: 'relative', overflow: 'hidden' }}>
                          <img src={room.cover} alt={room.title} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 45%, rgba(20,25,15,.66))' }} />
                          <span style={{ position: 'absolute', left: '16px', bottom: '16px', color: '#fff', font: `500 24px ${SERIF}` }}>{room.title}</span>
                        </div>
                      </button>

                      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <div style={{ color: MOSS, font: `600 10px ${SANS}`, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '8px' }}>
                          {room.groupTitle}{room.capacity ? ` · ${room.capacity}` : ''}
                        </div>
                        <p style={{ color: '#6b6a5c', font: `12px/1.7 ${SANS}`, margin: '0 0 16px', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {room.description}
                        </p>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '18px' }}>
                          {room.amenities.slice(0, 3).map(amenity => (
                            <span key={amenity} style={{ background: CREAM, color: FOREST, padding: '5px 8px', font: `10px ${SANS}`, borderRadius: '3px' }}>{amenity}</span>
                          ))}
                        </div>

                        <div style={{ marginTop: 'auto' }}>
                          <button type="button" className="rooms-link" onClick={() => openRoom(room)} style={{ marginBottom: '14px' }}>View room details</button>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${LINE}`, paddingTop: '16px' }}>
                            <span style={{ color: INK, font: `600 20px ${SERIF}` }}>
                              {peso(room.price)}
                              <small style={{ color: '#8d8877', font: `10px ${SANS}` }}> / night</small>
                            </span>
                            <button type="button" disabled={!canBook} onClick={() => bookRoom(room)} style={bookButtonStyle()}>
                              {bookLabel()}
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      {/* Room detail dialog */}
      {selectedRoom && (
        <div className="rooms-modal-backdrop" onClick={() => setSelectedRoom(null)}>
          <div className="rooms-modal" role="dialog" aria-modal="true" aria-label={selectedRoom.title} onClick={event => event.stopPropagation()}>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setSelectedRoom(null)}
              style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 2, width: '36px', height: '36px', borderRadius: '50%', border: 0, background: 'rgba(255,255,255,.92)', color: FOREST, font: `20px ${SANS}`, cursor: 'pointer' }}
            >×</button>

            <div style={{ height: 'clamp(220px, 40vw, 380px)', background: '#000' }}>
              <img src={selectedRoom.gallery[photoIndex] || selectedRoom.cover} alt={`${selectedRoom.title} photo ${photoIndex + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
            {selectedRoom.gallery.length > 1 && (
              <div style={{ display: 'flex', gap: '8px', padding: '12px 28px 0', overflowX: 'auto' }}>
                {selectedRoom.gallery.map((src, index) => (
                  <button key={src} type="button" aria-label={`Show photo ${index + 1}`} className={`rooms-thumb ${index === photoIndex ? 'active' : ''}`} onClick={() => setPhotoIndex(index)}>
                    <img src={src} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </button>
                ))}
              </div>
            )}

            <div className="rooms-modal-body">
              <div>
                <div style={{ color: MOSS, font: `600 10px ${SANS}`, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '8px' }}>{selectedRoom.groupTitle}</div>
                <h3 style={{ margin: '0 0 12px', color: INK, font: `500 34px ${SERIF}` }}>{selectedRoom.title}</h3>
                <p style={{ margin: '0 0 20px', color: '#6b6a5c', font: `14px/1.8 ${SANS}` }}>{selectedRoom.description}</p>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {selectedRoom.amenities.map(amenity => (
                    <span key={amenity} style={{ background: CREAM, color: FOREST, padding: '6px 10px', font: `11px ${SANS}`, borderRadius: '3px' }}>{amenity}</span>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ color: INK, font: `600 30px ${SERIF}`, marginBottom: '4px' }}>
                  {peso(selectedRoom.price)}
                  <small style={{ color: '#8d8877', font: `12px ${SANS}` }}> / night</small>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', margin: '16px 0 22px', font: `13px ${SANS}` }}>
                  <tbody>
                    {[
                      ['Category', selectedRoom.groupTitle],
                      selectedRoom.capacity && ['Guests', selectedRoom.capacity],
                      selectedRoom.bedType && ['Bed type', selectedRoom.bedType],
                      selectedRoom.view && ['View', selectedRoom.view],
                    ].filter(Boolean).map(([label, value]) => (
                      <tr key={label} style={{ borderTop: `1px solid ${LINE}` }}>
                        <th scope="row" style={{ textAlign: 'left', padding: '10px 0', color: '#777363', fontWeight: 600, width: '40%' }}>{label}</th>
                        <td style={{ padding: '10px 0', color: INK }}>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <button type="button" disabled={!canBook} onClick={() => bookRoom(selectedRoom)} style={{ ...bookButtonStyle(), width: '100%', padding: '14px 16px' }}>
                  {bookLabel()}
                </button>
                <p style={{ margin: '12px 0 0', color: '#777363', font: `12px/1.6 ${SANS}` }}>
                  Next you'll choose your stay type and dates, and we'll check this room is free.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}