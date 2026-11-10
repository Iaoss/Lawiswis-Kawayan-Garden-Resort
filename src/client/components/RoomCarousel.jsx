import React, { useCallback, useEffect, useRef, useState } from 'react';

// Swipeable carousel of every available room for the home page. Each card
// shows the room's own photo (from the room catalog), its type, starting
// price and a Book button. Arrows and dots move one card at a time; on
// phones guests can also swipe.

export default function RoomCarousel({ rooms, colors, canBook, bookLabel, onBook, onView }) {
  const trackRef = useRef(null);
  const [active, setActive] = useState(0);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const c = colors;

  const cardStep = () => {
    const track = trackRef.current;
    const card = track?.querySelector('[data-room-card]');
    return card ? card.getBoundingClientRect().width + 22 : 320;
  };

  const updatePosition = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const step = cardStep();
    setActive(Math.round(track.scrollLeft / step));
    setAtStart(track.scrollLeft <= 4);
    setAtEnd(track.scrollLeft + track.clientWidth >= track.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [updatePosition, rooms.length]);

  const scrollToIndex = index => {
    const track = trackRef.current;
    if (!track) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    track.scrollTo({ left: index * cardStep(), behavior: reduce ? 'auto' : 'smooth' });
  };
  const move = direction => scrollToIndex(Math.max(0, Math.min(rooms.length - 1, active + direction)));

  const arrow = (direction, disabled) => (
    <button type="button" aria-label={direction < 0 ? 'Previous rooms' : 'Next rooms'} disabled={disabled} onClick={() => move(direction)}
      className="room-carousel-arrow"
      style={{ width: 44, height: 44, borderRadius: '50%', border: `1.5px solid ${c.FOREST}`, background: disabled ? 'transparent' : c.FOREST, color: disabled ? c.FOREST : '#fff', opacity: disabled ? 0.35 : 1, cursor: disabled ? 'default' : 'pointer', fontSize: 18, display: 'grid', placeItems: 'center' }}>
      {direction < 0 ? '←' : '→'}
    </button>
  );

  return (
    <div role="region" aria-roledescription="carousel" aria-label="Available rooms">
      <style>{`
        .room-carousel-track { display: flex; gap: 22px; overflow-x: auto; scroll-snap-type: x mandatory; scroll-behavior: smooth; padding: 4px 2px 18px; scrollbar-width: none; }
        .room-carousel-track::-webkit-scrollbar { display: none; }
        .room-carousel-card { flex: 0 0 calc((100% - 44px) / 3); scroll-snap-align: start; }
        .room-carousel-card img { transition: transform .6s cubic-bezier(0.16,1,0.3,1); }
        .room-carousel-card:hover img { transform: scale(1.05); }
        @media (max-width: 960px) { .room-carousel-card { flex-basis: calc((100% - 22px) / 2); } }
        @media (max-width: 600px) { .room-carousel-card { flex-basis: 85%; } .room-carousel-arrow { display: none !important; } }
      `}</style>

      <div ref={trackRef} className="room-carousel-track" onScroll={updatePosition} tabIndex={0}
        onKeyDown={event => {
          if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
          if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
        }}>
        {rooms.map((room, index) => (
          <article key={room.id} data-room-card className="room-carousel-card" aria-roledescription="slide" aria-label={`${index + 1} of ${rooms.length}: ${room.title}`}
            style={{ background: c.PAPER, borderRadius: 6, overflow: 'hidden', border: `1px solid ${c.LINE}` }}>
            <button type="button" onClick={() => onView(room)} aria-label={`View ${room.title}`}
              style={{ display: 'block', width: '100%', padding: 0, border: 0, background: 'none', cursor: 'pointer', position: 'relative', height: 220, overflow: 'hidden' }}>
              <img src={room.cover} alt={room.title} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <span style={{ position: 'absolute', top: 14, left: 14, background: c.BRASS, borderRadius: 3, padding: '5px 12px', fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', color: '#fff', fontFamily: c.SANS }}>AVAILABLE</span>
            </button>
            <div style={{ padding: 22 }}>
              <div style={{ fontSize: 10, color: c.MOSS, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: c.SANS, marginBottom: 6 }}>{room.groupTitle}</div>
              <div style={{ fontWeight: 600, fontSize: 18, color: c.INK, marginBottom: 6, fontFamily: c.SERIF }}>{room.title}</div>
              <div style={{ fontSize: 12, color: '#8b8977', marginBottom: 16, fontFamily: c.SANS, minHeight: 18 }}>{room.amenities.slice(0, 3).join(' · ')}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div>
                  <span style={{ fontSize: 21, fontWeight: 600, color: c.FOREST, fontFamily: c.SERIF }}>₱{Number(room.price).toLocaleString()}</span>
                  <span style={{ fontSize: 11, color: '#9b9788', fontFamily: c.SANS }}> /night</span>
                </div>
                <button type="button" disabled={!canBook} onClick={() => onBook(room)}
                  style={{ background: c.FOREST, color: '#fff', border: 'none', borderRadius: 3, padding: '10px 20px', fontSize: 11.5, fontWeight: 600, letterSpacing: '0.03em', cursor: canBook ? 'pointer' : 'not-allowed', opacity: canBook ? 1 : 0.65, fontFamily: c.SANS }}>
                  {bookLabel}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginTop: 8 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }} aria-label="Choose a room">
          {rooms.length <= 12 && rooms.map((room, index) => (
            <button key={room.id} type="button" aria-label={`Go to ${room.title}`} aria-current={index === active ? 'true' : undefined}
              onClick={() => scrollToIndex(index)}
              style={{ width: index === active ? 22 : 8, height: 8, borderRadius: 999, border: 0, padding: 0, cursor: 'pointer', background: index === active ? c.FOREST : c.LINE, transition: 'width .3s ease, background .3s ease' }} />
          ))}
          <span style={{ marginLeft: 8, fontSize: 11, color: '#8b8977', fontFamily: c.SANS }}>{Math.min(active + 1, rooms.length)} / {rooms.length}</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {arrow(-1, atStart)}
          {arrow(1, atEnd)}
        </div>
      </div>
    </div>
  );
}
