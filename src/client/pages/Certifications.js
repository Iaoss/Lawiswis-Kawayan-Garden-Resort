import React from 'react';
import { Link } from 'react-router-dom';
import { BRASS, INK, LINE, PAPER, RESORT_IMAGES, SERIF, SANS } from '../components/clientTheme';

// The resort's accreditations, as listed on lawiswiskawayanresort.com.
const UPLOADS = 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/';
const ACCREDITATIONS = [
  {
    title: 'Department of Tourism Accredited Resort',
    text: 'Accredited by the Department of Tourism (DOT) of the Philippines.',
    logo: `${UPLOADS}Department_of_Tourism_DOT-400x400.png`,
    alt: 'Department of Tourism (DOT) Philippines seal',
    width: 120,
  },
  {
    title: 'PhilGEPS Accredited Establishment',
    text: 'Registered with the Philippine Government Electronic Procurement System, so government offices can book the resort for official events.',
    logo: `${UPLOADS}combined_LOGO-400x221.png`,
    alt: 'PhilGEPS and Procurement Service logos',
    width: 190,
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
              Lawiswis Kawayan Garden Resort is a Department of Tourism accredited resort and a PhilGEPS accredited establishment. Contact the resort for copies of current certificates.
            </p>
            <Link to="/contact-us" style={{ display: 'inline-block', marginTop: '18px', color: INK, font: `600 11px ${SANS}`, letterSpacing: '.08em', textDecorationColor: BRASS, textUnderlineOffset: '4px' }}>CONTACT THE RESORT →</Link>
          </div>
        </div>
        <h2 style={{ color: INK, font: `500 clamp(26px, 3.5vw, 34px)/1.2 ${SERIF}`, margin: '48px 0 18px', textAlign: 'center' }}>Certifications &amp; accreditations</h2>
        <div className="accreditation-grid">
          {ACCREDITATIONS.map(item => (
            <section key={item.title} style={{ background: '#fff', border: `1px solid ${LINE}`, padding: '30px 24px', textAlign: 'center', display: 'grid', justifyItems: 'center', gap: '14px' }}>
              <div style={{ height: '120px', display: 'flex', alignItems: 'center' }}>
                <img src={item.logo} alt={item.alt} loading="lazy" width={item.width} style={{ maxHeight: '120px', width: 'auto', maxWidth: '100%', objectFit: 'contain' }} />
              </div>
              <h3 style={{ color: INK, font: `600 15px/1.35 ${SANS}`, letterSpacing: '.06em', textTransform: 'uppercase', margin: 0 }}>{item.title}</h3>
              <p style={{ color: '#6b6a5c', font: `13px/1.7 ${SANS}`, margin: 0, maxWidth: '340px' }}>{item.text}</p>
            </section>
          ))}
        </div>
      </section>
      <style>{`.certifications-intro{display:grid;grid-template-columns:1.05fr .95fr;gap:36px;align-items:stretch}.accreditation-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}@media(max-width:700px){.certifications-intro,.accreditation-grid{grid-template-columns:1fr}}`}</style>
    </div>
  );
}
