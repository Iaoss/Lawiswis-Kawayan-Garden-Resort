import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BRASS, CREAM, FOREST, INK, LINE, PAPER, SERIF, SANS } from '../components/clientTheme';

const pages = {
  faqs: {
    title: 'Frequently Asked Questions',
    intro: 'Helpful answers for planning your stay at Lawiswis Kawayan Garden Resort.',
    items: [
      ['When is check-in and check-out?', 'Check-in and check-out schedules depend on the selected booking. Please refer to your reservation details or contact the resort to confirm arrangements.'],
      ['How do I secure a room booking?', 'Complete the booking form and pay in full or pay the 25% deposit through secure PayMongo checkout. Keep your booking reference for your records.'],
      ['What room types are available?', 'The resort offers regular rooms, couple rooms, family rooms, suites, and a Main Villa. Browse the Rooms page for current availability.'],
      ['Can I arrange a group event?', 'Yes. Contact the resort team in advance to discuss the function spaces, group activities, and arrangements for your visit.'],
    ],
  },
  'safety-guidelines': {
    title: 'Safety Guidelines',
    intro: 'A few simple reminders help everyone enjoy a safe and comfortable visit.',
    items: [
      ['Pools and water features', 'Follow posted facility signs and staff instructions. Children must be supervised by their accompanying adults around pools and water features.'],
      ['Resort grounds', 'Use designated paths and activity areas, and take care on grass or other surfaces that may be wet or uneven.'],
      ['Activities and equipment', 'Ask resort staff for instructions before using activity equipment, grilling stations, or team-building materials.'],
      ['Need help?', 'For on-site assistance, contact the resort team or front desk. In an emergency, notify staff immediately.'],
    ],
  },
  'health-and-wellness': {
    title: 'Health and Wellness',
    intro: 'We want every guest to feel comfortable during their time at the resort.',
    items: [
      ['Before arrival', 'Please let the resort team know ahead of time about accessibility needs or other arrangements that may help make your stay comfortable.'],
      ['During your visit', 'Please follow posted pool and facility guidance, and let resort staff know if you need assistance.'],
      ['Contact the team', 'For health, wellness, or accessibility questions, please use the Contact Us page before your visit.'],
    ],
  },
  'cancellation-policy': {
    title: 'Cancellation Policy',
    intro: 'Cancellation fees depend on how far in advance a reservation is cancelled.',
    items: [
      ['More than 7 days before arrival', 'A cancellation fee of 20% applies.'],
      ['4 to 7 days before arrival', 'A cancellation fee of 50% applies.'],
      ['3 days or less before arrival', 'A cancellation fee of 100% applies.'],
      ['Need help?', 'Contact the resort to request a cancellation or clarify how this policy applies to your booking.'],
    ],
  },
  'privacy-policy': {
    title: 'Privacy Policy',
    intro: 'We use guest information to manage reservations and provide resort services.',
    items: [
      ['Information we use', 'Information submitted through booking and contact forms may include your name, contact details, address, stay dates, guest count, and requests.'],
      ['How it is used', 'Information is used to manage reservations, communicate with guests, provide support, and meet operational or legal requirements.'],
      ['Payments', 'Card and e-wallet credentials are entered and processed through PayMongo checkout. The resort does not store full card numbers or security codes.'],
    ],
  },
};

export default function CustomerCarePage({ pageKey }) {
  const page = pages[pageKey];
  const location = useLocation();
  const items = page.items;

  return (
    <div style={{ background: PAPER, minHeight: '100vh' }}>
      <section style={{ background: FOREST, color: '#fff', padding: '78px 24px 84px' }}>
        <div style={{ maxWidth: '1100px', width: '100%', margin: '0 auto' }}>
          <div style={{ color: '#e7dfc4', font: `600 11px ${SANS}`, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: '14px' }}>Customer care</div>
          <h1 style={{ font: `500 clamp(40px, 6vw, 66px)/1.05 ${SERIF}`, margin: '0 0 16px' }}>{page.title}</h1>
          <p style={{ color: 'rgba(255,255,255,.78)', font: `14px/1.8 ${SANS}`, maxWidth: '650px', margin: 0 }}>{page.intro}</p>
        </div>
      </section>
      <main style={{ maxWidth: '900px', width: '100%', boxSizing: 'border-box', margin: '0 auto', padding: '56px 24px 86px' }}>
        <div style={{ display: 'grid', gap: '12px' }}>
          {items.map(([title, content]) => (
            <section key={title} style={{ background: '#fff', border: `1px solid ${LINE}`, padding: '24px 26px' }}>
              <h2 style={{ color: INK, font: `500 23px ${SERIF}`, margin: '0 0 9px' }}>{title}</h2>
              <p style={{ color: '#6b6a5c', font: `13px/1.8 ${SANS}`, margin: 0 }}>{content}</p>
            </section>
          ))}
        </div>
        <div style={{ marginTop: '24px', background: CREAM, borderLeft: `3px solid ${BRASS}`, padding: '18px 22px', color: '#5c5a4c', font: `13px/1.8 ${SANS}` }}>
          Need more assistance? <Link to={`/contact-us${location.search}`} style={{ color: FOREST, fontWeight: 600 }}>Contact our team</Link>.
        </div>
      </main>
    </div>
  );
}
