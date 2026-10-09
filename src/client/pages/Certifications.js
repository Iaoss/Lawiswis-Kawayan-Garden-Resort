import React from 'react';
import { Link } from 'react-router-dom';
import { BRASS, INK, LINE, PAPER, RESORT_IMAGES, SERIF, SANS } from '../components/clientTheme';

const sections = [
  {
    title: 'Certifications & accreditations',
    text: 'For current operating certificates and tourism accreditation details, please contact the resort directly.',
  },
  {
    title: 'Awards & recognitions',
    text: 'The official resort page does not list specific awards or recognitions. Please contact our team for verified information.',
  },
];

export default function Certifications() {
  return (
    <div style={{ background: PAPER, minHeight: '100vh' }}>
      <section style={{ minHeight: '320px', position: 'relative', display: 'flex', alignItems: 'center', padding: '70px 24px', overflow: 'hidden' }}>
        <img src={RESORT_IMAGES.pool} alt="" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(20,25,15,.78), rgba(20,25,15,.22))' }} />
        <div style={{ position: 'relative', maxWidth: '1100px', width: '100%', margin: '0 auto' }}>
          <div style={{ color: '#e7dfc4', font: `600 11px ${SANS}`, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: '14px' }}>Our story</div>
          <h1 style={{ color: '#fff', font: `500 clamp(40px, 6vw, 66px)/1.05 ${SERIF}`, margin: 0 }}>Certifications &amp; Awards</h1>
        </div>
      </section>
      <section style={{ maxWidth: '1000px', width: '100%', boxSizing: 'border-box', margin: '0 auto', padding: '64px 24px 90px' }}>
        <div className="certifications-intro">
          <img src={RESORT_IMAGES.garden} alt="Garden grounds at Lawiswis Kawayan Garden Resort" loading="lazy" style={{ display: 'block', width: '100%', height: '100%', minHeight: '280px', objectFit: 'cover' }} />
          <div style={{ alignSelf: 'center' }}>
            <div style={{ color: BRASS, font: `600 11px ${SANS}`, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: '12px' }}>Lawiswis Kawayan Garden Resort</div>
            <h2 style={{ color: INK, font: `500 clamp(28px, 4vw, 38px)/1.2 ${SERIF}`, margin: '0 0 14px' }}>A welcoming place to gather and unwind.</h2>
            <p style={{ color: '#6b6a5c', font: `13px/1.8 ${SANS}`, margin: 0 }}>
              The official certifications and awards page shares the resort’s invitation to guests, but does not publish specific credentials. Contact the resort for current, verified details.
            </p>
            <Link to="/contact-us" style={{ display: 'inline-block', marginTop: '18px', color: INK, font: `600 11px ${SANS}`, letterSpacing: '.08em', textDecorationColor: BRASS, textUnderlineOffset: '4px' }}>CONTACT THE RESORT →</Link>
          </div>
        </div>
        <div style={{ display: 'grid', gap: '18px', marginTop: '32px' }}>
          {sections.map(section => (
            <section key={section.title} style={{ display: 'grid', gridTemplateColumns: '48px minmax(0,1fr)', gap: '18px', background: '#fff', border: `1px solid ${LINE}`, padding: '26px' }}>
              <span aria-hidden="true" style={{ color: BRASS, font: `500 24px ${SERIF}` }}>✦</span>
              <div>
                <h2 style={{ color: INK, font: `500 25px ${SERIF}`, margin: '0 0 9px' }}>{section.title}</h2>
                <p style={{ color: '#6b6a5c', font: `13px/1.8 ${SANS}`, margin: 0 }}>{section.text}</p>
              </div>
            </section>
          ))}
        </div>
      </section>
      <style>{`.certifications-intro{display:grid;grid-template-columns:1.05fr .95fr;gap:36px;align-items:stretch}@media(max-width:700px){.certifications-intro{grid-template-columns:1fr}}`}</style>
    </div>
  );
}
