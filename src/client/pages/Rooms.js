import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { BRASS, CREAM, FOREST, INK, LINE, MOSS, PAPER, SERIF, SANS, FALLBACK_ROOM_IMAGES, getRoomImage } from '../components/clientTheme';

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
    getDocs(collection(db, 'rooms')).then(snapshot => {
      setRooms(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const types = ['all', ...new Set(rooms.map(room => room.type).filter(Boolean))];
  const filtered = rooms.filter(room => {
    const text = `${room.roomNumber || ''} ${room.type || ''} ${room.amenities || ''}`.toLowerCase();
    return (filter === 'all' || room.type === filter) && (!search || text.includes(search.toLowerCase()));
  });
  const availableCount = rooms.filter(isAvailable).length;

  return (
    <div style={{ background: PAPER, minHeight: '100vh' }}>
      <section style={{ background: CREAM, padding: '76px 24px 84px', borderBottom: `1px solid ${LINE}` }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ color: MOSS, font: `600 11px ${SANS}`, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: '14px' }}>Accommodations</div>
          <h1 style={{ color: INK, font: `500 clamp(40px, 6vw, 72px)/1.02 ${SERIF}`, margin: '0 0 18px', maxWidth: '650px' }}>A room for the way you want to stay.</h1>
          <p style={{ color: '#6b6a5c', font: `14px/1.8 ${SANS}`, maxWidth: '500px', margin: 0 }}>{checkIn && checkOut ? `Showing rooms for ${checkIn} to ${checkOut}.` : 'Sleep beneath the bamboo canopy, with room to gather, rest, and breathe.'}</p>
        </div>
      </section>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '48px 24px 100px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: '20px', flexWrap: 'wrap', marginBottom: '30px' }}>
          <div><div style={{ color: BRASS, font: `600 11px ${SANS}`, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '8px' }}>Find your fit</div><h2 style={{ color: INK, font: `500 32px ${SERIF}`, margin: 0 }}>Stay a little closer to nature</h2></div>
          <div style={{ color: '#777363', font: `12px ${SANS}` }}><strong style={{ color: FOREST }}>{availableCount}</strong> available now · {rooms.length} rooms total</div>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '28px' }}>
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by room name or amenity" style={{ flex: '1 1 260px', minWidth: '220px', border: `1px solid ${LINE}`, background: '#fff', padding: '12px 14px', borderRadius: '3px', color: INK, font: `12px ${SANS}`, outline: 'none' }} />
          {types.map(type => <button key={type} onClick={() => setFilter(type)} style={{ background: filter === type ? FOREST : 'transparent', color: filter === type ? '#fff' : FOREST, border: `1px solid ${filter === type ? FOREST : LINE}`, padding: '11px 14px', borderRadius: '3px', font: `600 11px ${SANS}`, cursor: 'pointer', textTransform: 'capitalize' }}>{type === 'all' ? 'All rooms' : type}</button>)}
        </div>
        {loading ? <div style={{ padding: '70px 0', textAlign: 'center', color: MOSS, font: `14px ${SANS}` }}>Gathering the available rooms...</div> : filtered.length === 0 ? <div style={{ padding: '70px 0', textAlign: 'center', color: '#777363', font: `14px ${SANS}` }}>No rooms match those filters.</div> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '22px' }}>
          {filtered.map((room, index) => {
            const photo = getRoomImage(room.roomNumber) || FALLBACK_ROOM_IMAGES[index % FALLBACK_ROOM_IMAGES.length];
            const roomAvailable = isAvailable(room);
            const amenities = String(room.amenities || 'Air conditioning, Wi-Fi, Hot shower').split(',').slice(0, 3);
            return <article key={room.id} style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: '4px', overflow: 'hidden', transition: 'transform .25s, box-shadow .25s' }} onMouseEnter={event => { event.currentTarget.style.transform = 'translateY(-5px)'; event.currentTarget.style.boxShadow = '0 18px 40px rgba(35,42,27,.13)'; }} onMouseLeave={event => { event.currentTarget.style.transform = 'translateY(0)'; event.currentTarget.style.boxShadow = 'none'; }}>
              <div style={{ height: '210px', position: 'relative', overflow: 'hidden' }}><img src={photo} alt={`Room ${room.roomNumber}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /><div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 45%, rgba(20,25,15,.66))' }} /><span style={{ position: 'absolute', left: '16px', bottom: '14px', color: '#fff', font: `500 22px ${SERIF}` }}>Room {room.roomNumber}</span><span style={{ position: 'absolute', right: '14px', top: '14px', background: roomAvailable ? CREAM : 'rgba(35,42,27,.78)', color: roomAvailable ? FOREST : '#fff', padding: '5px 9px', borderRadius: '3px', font: `600 10px ${SANS}`, textTransform: 'uppercase' }}>{roomAvailable ? 'Available' : room.status}</span></div>
              <div style={{ padding: '20px' }}><div style={{ color: MOSS, font: `600 10px ${SANS}`, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '8px' }}>{room.type || 'Garden room'}</div><p style={{ color: '#6b6a5c', font: `12px/1.7 ${SANS}`, minHeight: '41px', margin: '0 0 14px' }}>{room.description || 'A comfortable stay surrounded by the quiet rhythm of the garden.'}</p><div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '18px' }}>{amenities.map(amenity => <span key={amenity} style={{ background: CREAM, color: FOREST, padding: '5px 8px', font: `10px ${SANS}` }}>{amenity.trim()}</span>)}</div><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${LINE}`, paddingTop: '16px' }}><span style={{ color: INK, font: `600 20px ${SERIF}` }}>₱{Number(room.price || 0).toLocaleString()}<small style={{ color: '#8d8877', font: `10px ${SANS}` }}> / night</small></span><button disabled={!roomAvailable} onClick={() => { window.location.href = `/book/${room.id}${checkIn ? `?checkIn=${checkIn}&checkOut=${checkOut}` : ''}`; }} style={{ background: roomAvailable ? FOREST : '#e5e1d4', color: roomAvailable ? '#fff' : '#989382', border: 0, borderRadius: '3px', padding: '11px 14px', font: `600 11px ${SANS}`, cursor: roomAvailable ? 'pointer' : 'not-allowed' }}>{roomAvailable ? 'Book room →' : 'Unavailable'}</button></div></div>
            </article>;
          })}
        </div>}
      </div>
    </div>
  );
}