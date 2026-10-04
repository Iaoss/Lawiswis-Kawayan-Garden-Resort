import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { BRASS, CREAM, FOREST, FOREST_DEEP, INK, LINE, PAPER, SERIF, SANS } from '../components/clientTheme';

const countWords = value => value.trim() ? value.trim().split(/\s+/).length : 0;
const limitWords = value => {
  const matches = [...value.matchAll(/\S+/g)];
  return matches.length <= 50 ? value : value.slice(0, matches[49].index + matches[49][0].length);
};

export default function Contact() {
  const location = useLocation();
  const [form, setForm] = useState({ name: '', email: '', phone: '', subject: '', message: '' });
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id) return undefined;
    const frame = window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    return () => window.cancelAnimationFrame(frame);
  }, [location.hash]);
  const update = event => {
    const { name, value } = event.target;
    setForm(previous => ({ ...previous, [name]: name === 'message' ? limitWords(value) : value }));
  };
  const submit = async event => {
    event.preventDefault();
    setSending(true);
    try { await addDoc(collection(db, 'contacts'), { ...form, createdAt: serverTimestamp(), read: false }); setSent(true); setForm({ name: '', email: '', phone: '', subject: '', message: '' }); } catch { window.alert('Something went wrong. Please try again.'); }
    setSending(false);
  };
  const field = (name, label, type = 'text') => <label style={{ display: 'grid', gap: '7px', color: INK, font: `600 10px ${SANS}`, letterSpacing: '.08em', textTransform: 'uppercase' }}>{label}<input required={name === 'name' || name === 'email'} name={name} type={type} value={form[name]} onChange={update} style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${LINE}`, padding: '12px 13px', background: PAPER, color: INK, font: `13px ${SANS}`, outline: 'none' }} /></label>;
  return <div style={{ background: PAPER, minHeight: '100vh' }}>
    <section style={{ background: FOREST_DEEP, padding: '78px 24px 92px', color: '#fff' }}><div style={{ maxWidth: '1100px', margin: '0 auto' }}><div style={{ color: '#e7dfc4', font: `600 11px ${SANS}`, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: '14px' }}>Come say hello</div><h1 style={{ font: `500 clamp(42px, 6vw, 70px)/1 ${SERIF}`, margin: '0 0 18px' }}>Let’s plan your time here.</h1><p style={{ color: 'rgba(255,255,255,.7)', font: `14px/1.8 ${SANS}`, maxWidth: '480px', margin: 0 }}>Questions about a room, an event, or a slower weekend? Our team would love to help.</p></div></section>
    <div id="contact-grid" style={{ maxWidth: '1100px', margin: '0 auto', padding: '70px 24px 100px', display: 'grid', gridTemplateColumns: '.8fr 1.2fr', gap: '70px' }}><div><h2 style={{ color: INK, font: `500 32px ${SERIF}`, margin: '0 0 22px' }}>Find us in the garden.</h2><div style={{ display: 'grid', gap: '22px', color: '#6b6a5c', font: `13px/1.7 ${SANS}` }}><div><strong style={{ display: 'block', color: FOREST, font: `600 10px ${SANS}`, letterSpacing: '.12em', textTransform: 'uppercase' }}>Address</strong>402 Brgy. Buguion, Calumpit, Bulacan, Philippines</div><div><strong style={{ display: 'block', color: FOREST, font: `600 10px ${SANS}`, letterSpacing: '.12em', textTransform: 'uppercase' }}>Call</strong>0917 811 2332<br />Daily, 7:00 AM – 10:00 PM</div><div><strong style={{ display: 'block', color: FOREST, font: `600 10px ${SANS}`, letterSpacing: '.12em', textTransform: 'uppercase' }}>Email</strong>info@lawiswiskawayanresort.com</div></div><div style={{ marginTop: '38px', background: CREAM, padding: '24px', borderLeft: `3px solid ${BRASS}`, color: '#6b6a5c', font: `13px/1.8 ${SANS}` }}>Check-in is at 2:00 PM and check-out is at 12:00 NN. For events and group stays, contact us ahead of time so we can prepare the garden for you.</div></div>
      <div style={{ background: '#fff', border: `1px solid ${LINE}`, padding: '32px' }}>{sent ? <div style={{ padding: '50px 10px', textAlign: 'center' }}><div style={{ color: BRASS, font: `500 44px ${SERIF}` }}>Thank you.</div><p style={{ color: '#6b6a5c', font: `13px/1.8 ${SANS}` }}>Your message is with our team. We’ll be in touch within 24 hours.</p><button onClick={() => setSent(false)} style={{ background: FOREST, color: '#fff', border: 0, borderRadius: '3px', padding: '12px 18px', font: `600 11px ${SANS}`, cursor: 'pointer' }}>SEND ANOTHER MESSAGE</button></div> : <><div style={{ color: BRASS, font: `600 11px ${SANS}`, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: '9px' }}>Write to us</div><h2 style={{ color: INK, font: `500 32px ${SERIF}`, margin: '0 0 26px' }}>How can we help?</h2><form onSubmit={submit} style={{ display: 'grid', gap: '18px' }}><div className="contact-fields">{field('name', 'Full name')} {field('phone', 'Phone')}</div>{field('email', 'Email address', 'email')}<label style={{ display: 'grid', gap: '7px', color: INK, font: `600 10px ${SANS}`, letterSpacing: '.08em', textTransform: 'uppercase' }}>Subject<select name="subject" value={form.subject} onChange={update} style={{ border: `1px solid ${LINE}`, padding: '12px 13px', background: PAPER, color: INK, font: `13px ${SANS}` }}><option value="">Select a subject</option><option>Room Inquiry</option><option>Event / Group Booking</option><option>Booking Modification</option><option>General Inquiry</option></select></label><label style={{ display: 'grid', gap: '7px', color: INK, font: `600 10px ${SANS}`, letterSpacing: '.08em', textTransform: 'uppercase' }}>Message<textarea required name="message" value={form.message} onChange={update} rows="5" aria-describedby="contact-message-count" style={{ border: `1px solid ${LINE}`, padding: '12px 13px', background: PAPER, color: INK, font: `13px/1.6 ${SANS}`, resize: 'vertical' }} />
<span id="contact-message-count" aria-live="polite" style={{ color: '#777363', font: `11px ${SANS}`, textTransform: 'none', letterSpacing: 0 }}>{countWords(form.message)} words · {50 - countWords(form.message)} remaining</span>
</label><button disabled={sending} style={{ background: FOREST, color: '#fff', border: 0, borderRadius: '3px', padding: '14px', font: `600 11px ${SANS}`, letterSpacing: '.08em', cursor: 'pointer' }}>{sending ? 'SENDING...' : 'SEND MESSAGE →'}</button></form></>}</div>
    </div>
    <section aria-label="Guest information" style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 24px 90px', display: 'grid', gap: '18px' }}>
      <section id="faqs" style={{ scrollMarginTop: '100px', background: '#fff', border: `1px solid ${LINE}`, padding: '26px' }}>
        <div style={{ color: BRASS, font: `600 10px ${SANS}`, letterSpacing: '.14em', textTransform: 'uppercase' }}>Guest information</div>
        <h2 style={{ color: INK, font: `500 30px ${SERIF}`, margin: '8px 0 16px' }}>Frequently asked questions</h2>
        {[
          ['When is check-in and check-out?', 'Check-in is at 2:00 PM and check-out is at 12:00 NN. Early check-in or late check-out may be arranged subject to availability.'],
          ['How do I secure a room booking?', 'Complete the booking form and pay in full or pay the 25% deposit through the secure PayMongo checkout. Keep your booking reference for your records.'],
          ['What room types are available?', 'The resort offers Regular Rooms, Couple Rooms, Family Rooms, Suites, Presidential Suites, and the Main Villa.'],
        ].map(([question, answer]) => <details key={question} style={{ borderTop: `1px solid ${LINE}`, padding: '14px 0', color: INK, font: `13px/1.7 ${SANS}` }}><summary style={{ cursor: 'pointer', fontWeight: 600 }}>{question}</summary><p style={{ margin: '8px 0 0', color: '#6b6a5c' }}>{answer}</p></details>)}
      </section>
      <section id="safety-guidelines" style={{ scrollMarginTop: '100px', background: '#fff', border: `1px solid ${LINE}`, padding: '26px' }}>
        <h2 style={{ color: INK, font: `500 26px ${SERIF}`, margin: '0 0 10px' }}>Safety guidelines</h2>
        <p style={{ margin: 0, color: '#6b6a5c', font: `13px/1.8 ${SANS}` }}>Follow posted facility signs and staff instructions throughout the resort. Children should be supervised by their accompanying adults, especially around pools and water features. Contact the front desk for site-specific guidance during your stay.</p>
      </section>
      <section id="health-and-wellness" style={{ scrollMarginTop: '100px', background: '#fff', border: `1px solid ${LINE}`, padding: '26px' }}>
        <h2 style={{ color: INK, font: `500 26px ${SERIF}`, margin: '0 0 10px' }}>Health and wellness</h2>
        <p style={{ margin: 0, color: '#6b6a5c', font: `13px/1.8 ${SANS}` }}>Please let the resort team know ahead of arrival about accessibility needs or other arrangements that would help make your stay comfortable. For urgent assistance while on-site, contact the front desk.</p>
      </section>
      <section id="cancellation-policy" style={{ scrollMarginTop: '100px', background: '#fff', border: `1px solid ${LINE}`, padding: '26px' }}>
        <h2 style={{ color: INK, font: `500 26px ${SERIF}`, margin: '0 0 10px' }}>Cancellation policy</h2>
        <p style={{ margin: 0, color: '#6b6a5c', font: `13px/1.8 ${SANS}` }}>Cancellation fees depend on notice before check-in: 20% more than 7 days before arrival, 50% from 4 to 7 days before arrival, and 100% 3 days or less before arrival. Contact the resort to request a cancellation or clarify how the policy applies to your booking.</p>
      </section>
      <section id="privacy-policy" style={{ scrollMarginTop: '100px', background: '#fff', border: `1px solid ${LINE}`, padding: '26px' }}>
        <h2 style={{ color: INK, font: `500 26px ${SERIF}`, margin: '0 0 10px' }}>Privacy policy</h2>
        <p style={{ margin: 0, color: '#6b6a5c', font: `13px/1.8 ${SANS}` }}>Information submitted through booking and contact forms is used to manage reservations, communicate with guests, provide support, and meet operational or legal requirements. Card and e-wallet credentials are entered with PayMongo; the resort does not store full card numbers or security codes.</p>
      </section>
    </section>
    <style>{`#contact-grid .contact-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; } @media (max-width: 700px) { #contact-grid { grid-template-columns: 1fr !important; gap: 36px !important; } #contact-grid .contact-fields { grid-template-columns: 1fr; } }`}</style>
  </div>;
}