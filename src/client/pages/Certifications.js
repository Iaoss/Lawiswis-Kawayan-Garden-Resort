import React from 'react';
import { BRASS, FOREST, INK, LINE, PAPER, SERIF, SANS } from '../components/clientTheme';

const sections = [
  {
    title: 'Certifications & accreditations',
    text: 'This section is reserved for the resort’s current official operating certificates and tourism accreditations. Please contact the resort for the latest verified documents.',
  },
  {
    title: 'Awards & recognitions',
    text: 'We value the trust of our guests and community. For verified award details and dates, please contact our team.',
  },
];

export default function Certifications() {
  return (
    <div style={{ background: PAPER, minHeight: '100vh' }}>
      <section style={{ background: FOREST, color: '#fff', padding: '82px 24px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ color: '#e7dfc4', font: `600 11px ${SANS}`, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: '14px' }}>Our story</div>
          <h1 style={{ color: '#fff', font: `500 clamp(40px, 6vw, 66px)/1.05 ${SERIF}`, margin: 0 }}>Certifications &amp; Awards</h1>
        </div>
      </section>
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '64px 24px 90px', display: 'grid', gap: '18px' }}>
        <p style={{ color: '#5c5a4c', font: `14px/1.8 ${SANS}`, margin: '0 0 12px' }}>
          We aim to provide a welcoming and well-cared-for resort experience. Official credentials and recognitions should be confirmed directly with the resort.
        </p>
        {sections.map(section => (
          <section key={section.title} style={{ display: 'grid', gridTemplateColumns: '48px minmax(0,1fr)', gap: '18px', background: '#fff', border: `1px solid ${LINE}`, padding: '26px' }}>
            <span aria-hidden="true" style={{ color: BRASS, font: `500 24px ${SERIF}` }}>✦</span>
            <div>
              <h2 style={{ color: INK, font: `500 25px ${SERIF}`, margin: '0 0 9px' }}>{section.title}</h2>
              <p style={{ color: '#6b6a5c', font: `13px/1.8 ${SANS}`, margin: 0 }}>{section.text}</p>
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
