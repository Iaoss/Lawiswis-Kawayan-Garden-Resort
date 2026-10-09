import React from 'react';
import { BRASS, CREAM, FOREST, INK, LINE, MOSS, PAPER, SERIF, SANS } from '../components/clientTheme';

const amenityGroups = [
  {
    title: 'Pools & relaxation',
    items: ['Adult Swimming Pool', 'Kiddie Pool', 'Bubble Pool', 'Spa', 'Jacuzzi Area'],
  },
  {
    title: 'Garden & gatherings',
    items: ['Outdoor Garden', 'Art Displays', 'Grass Covered Areas', 'Function Hall', 'Bonfire Area for S’mores'],
  },
  {
    title: 'Food & resort shops',
    items: ['Snack Bar', 'Kitchen-on-call', 'Gift/Souvenir Shop', 'Grilling/Samgyupsal Stations'],
  },
  {
    title: 'Activities & entertainment',
    items: ['Outdoor Movie Watching', 'KTV Room', 'Billiard Table', 'Street Basketball Court', 'Table Tennis', 'Trampoline', 'Team Building Materials'],
  },
];

export default function Amenities() {
  return (
    <div style={{ background: PAPER, minHeight: '100vh' }}>
      <section style={{ background: FOREST, color: '#fff', padding: '88px 24px' }}>
        <div style={{ maxWidth: '1100px', width: '100%', margin: '0 auto' }}>
          <div style={{ color: '#e7dfc4', font: `600 11px ${SANS}`, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: '14px' }}>Make room for a little of everything</div>
          <h1 style={{ font: `500 clamp(42px, 6vw, 68px)/1.05 ${SERIF}`, margin: '0 0 18px', maxWidth: '760px' }}>Our Amenities</h1>
          <p style={{ color: 'rgba(255,255,255,.78)', font: `14px/1.8 ${SANS}`, maxWidth: '620px', margin: 0 }}>
            From quiet garden corners to lively group activities, discover the spaces and experiences waiting around Lawiswis Kawayan.
          </p>
        </div>
      </section>
      <section style={{ maxWidth: '1100px', width: '100%', boxSizing: 'border-box', margin: '0 auto', padding: '64px 24px 88px' }}>
        <div style={{ color: MOSS, font: `600 11px ${SANS}`, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: '10px' }}>Explore the resort</div>
        <h2 style={{ color: INK, font: `500 clamp(30px, 4vw, 42px) ${SERIF}`, margin: '0 0 34px' }}>Spaces to unwind, gather, and play.</h2>
        <div className="amenities-grid">
          {amenityGroups.map(group => (
            <section key={group.title} style={{ border: `1px solid ${LINE}`, background: '#fff', padding: '28px' }}>
              <h3 style={{ color: FOREST, font: `500 24px ${SERIF}`, margin: '0 0 18px' }}>{group.title}</h3>
              <ul style={{ listStyle: 'none', display: 'grid', gap: '13px', margin: 0, padding: 0 }}>
                {group.items.map(item => (
                  <li key={item} style={{ display: 'flex', alignItems: 'baseline', gap: '10px', color: '#5c5a4c', font: `13px/1.6 ${SANS}` }}>
                    <span aria-hidden="true" style={{ color: BRASS, fontSize: '16px' }}>•</span>{item}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div style={{ marginTop: '28px', background: CREAM, borderLeft: `3px solid ${BRASS}`, padding: '20px 24px', color: '#5c5a4c', font: `13px/1.8 ${SANS}` }}>
          For availability, operating hours, or arrangements for group activities, please contact our team before your visit.
        </div>
      </section>
      <style>{`.amenities-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}@media(max-width:700px){.amenities-grid{grid-template-columns:1fr}}`}</style>
    </div>
  );
}
