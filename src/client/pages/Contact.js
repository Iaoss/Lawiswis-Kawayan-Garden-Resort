import React, { useState } from 'react';
import { db } from '../../firebase/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

const ACCENT = '#4a7c59';
const DARK = '#1a3a1a';
const LIGHT = '#f0f7f0';

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', subject: '', message: '' });
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'contacts'), {
        ...form,
        createdAt: serverTimestamp(),
        read: false,
      });
      setSuccess(true);
      setForm({ name: '', email: '', phone: '', subject: '', message: '' });
    } catch (err) {
      alert('Something went wrong. Please try again.');
    }
    setSubmitting(false);
  };

  return (
    <div style={{ fontFamily: "'Poppins', sans-serif", background: '#fff', minHeight: '100vh' }}>
      {/* Navbar */}
      <nav className="responsive-nav" style={{ background: DARK, padding: '0 20px', justifyContent: 'space-between', height: '64px', position: 'sticky', top: 0, zIndex: 100 }}>
<div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={() => window.location.href = '/home'}>
  {/* Bamboo icon */}
  <svg width="36" height="44" viewBox="0 0 36 44" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="0" width="5" height="44" rx="2.5" fill="rgba(255,255,255,0.9)"/>
    <rect x="4" y="8" width="8" height="3" rx="1.5" fill="rgba(255,255,255,0.7)"/>
    <rect x="4" y="20" width="10" height="3" rx="1.5" fill="rgba(255,255,255,0.7)"/>
    <rect x="4" y="32" width="7" height="3" rx="1.5" fill="rgba(255,255,255,0.7)"/>
    <rect x="14" y="4" width="5" height="40" rx="2.5" fill="rgba(255,255,255,0.75)"/>
    <rect x="14" y="12" width="9" height="3" rx="1.5" fill="rgba(255,255,255,0.6)"/>
    <rect x="14" y="24" width="11" height="3" rx="1.5" fill="rgba(255,255,255,0.6)"/>
    <rect x="14" y="36" width="8" height="3" rx="1.5" fill="rgba(255,255,255,0.6)"/>
    <rect x="25" y="2" width="4" height="38" rx="2" fill="rgba(255,255,255,0.6)"/>
    <rect x="25" y="14" width="8" height="2.5" rx="1.25" fill="rgba(255,255,255,0.5)"/>
    <rect x="25" y="26" width="9" height="2.5" rx="1.25" fill="rgba(255,255,255,0.5)"/>
  </svg>
  <div>
    <div style={{ color: '#fff', fontWeight: '700', fontSize: '18px', lineHeight: 1.1, fontFamily: 'Georgia, serif', letterSpacing: '0.5px' }}>Lawiswis Kawayan</div>
    <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', fontFamily: 'Georgia, serif' }}>Garden Resort</div>
  </div>
</div>
        <div style={{ display: 'flex', gap: '28px' }}>
          {['Home', 'Rooms', 'About', 'Contact'].map(n => (
            <button key={n} onClick={() => window.location.href = `/${n.toLowerCase()}`}
              style={{ background: 'none', border: 'none', color: n === 'Contact' ? '#d4f550' : '#ccc', fontSize: '13px', fontWeight: n === 'Contact' ? '600' : '400', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
              {n}
            </button>
          ))}
        </div>
        <button onClick={() => window.location.href = '/rooms'}
          style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: '25px', padding: '9px 22px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
          Book Now
        </button>
      </nav>

      {/* Hero */}
      <div style={{ background: `linear-gradient(135deg, ${DARK} 0%, #2d5a2d 100%)`, padding: '70px 20px 80px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-80px', right: '-80px', width: '400px', height: '400px', borderRadius: '50%', background: 'rgba(212,245,80,0.05)' }} />
        <div className="section-container" style={{ position: 'relative', zIndex: 1, maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ fontSize: '11px', color: '#d4f550', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '10px' }}>Get In Touch</div>
          <h1 style={{ fontSize: '42px', fontWeight: '800', color: '#fff', marginBottom: '12px' }}>Contact Us</h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', maxWidth: '500px' }}>
            Have questions about your booking or want to know more about HuaPro Resort? We'd love to hear from you.
          </p>
        </div>
      </div>

      <div className="section-container" style={{ margin: '-40px auto 80px', position: 'relative', zIndex: 10 }}>
        <div className="two-column-fluid" style={{ gap: '28px' }}>
          {/* Contact Info */}
          <div>
            {/* Info cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
              {[
{ icon: '📍', title: 'Our Location', detail: '402 Brgy. Buguion, Calumpit, Bulacan, PH', sub: 'Visit us anytime' },
{ icon: '📞', title: 'Phone Number', detail: '0917 811 2332', sub: 'Mon-Sun, 7AM - 10PM' },
{ icon: '✉️', title: 'Email Address', detail: 'info@lawiswiskawayanresort.com', sub: 'We reply within 24 hours' },
{ icon: '📧', title: 'Marketing Inquiries', detail: 'marketing.lawiswiskawayanresort@gmail.com', sub: 'For events & partnerships' },
              ].map(c => (
                <div key={c.title} style={{ background: '#fff', borderRadius: '14px', padding: '18px 20px', border: '1px solid #e5e7eb', display: 'flex', gap: '14px', alignItems: 'flex-start', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
                  <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>
                    {c.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>{c.title}</div>
                    <div style={{ fontWeight: '600', fontSize: '13px', color: '#111' }}>{c.detail}</div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{c.sub}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Map placeholder */}
            <div style={{ background: `linear-gradient(135deg, ${DARK}, #2d5a2d)`, borderRadius: '14px', height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
              <div style={{ textAlign: 'center', color: '#fff', position: 'relative', zIndex: 1 }}>
                <div style={{ fontSize: '36px', marginBottom: '8px' }}>📍</div>
                <div style={{ fontWeight: '600', fontSize: '14px' }}>HuaPro Resort</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '4px' }}>Angeles City, Pampanga</div>
              </div>
              <div style={{ position: 'absolute', inset: 0, opacity: 0.1, background: 'repeating-linear-gradient(0deg, transparent, transparent 20px, #fff 20px, #fff 21px), repeating-linear-gradient(90deg, transparent, transparent 20px, #fff 20px, #fff 21px)' }} />
            </div>

            {/* Social */}
            <div style={{ marginTop: '20px', background: '#fff', borderRadius: '14px', padding: '18px 20px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontWeight: '600', fontSize: '13px', color: '#111', marginBottom: '14px' }}>Follow Us</div>
              <div style={{ display: 'flex', gap: '10px' }}>
                {[
                  { icon: '📘', label: 'Facebook' },
                  { icon: '📸', label: 'Instagram' },
                  { icon: '🐦', label: 'Twitter' },
                ].map(s => (
                  <button key={s.label}
                    style={{ flex: 1, background: LIGHT, border: 'none', borderRadius: '10px', padding: '10px', fontSize: '20px', cursor: 'pointer', textAlign: 'center' }}>
                    {s.icon}
                    <div style={{ fontSize: '10px', color: ACCENT, fontWeight: '500', marginTop: '4px', fontFamily: "'Poppins', sans-serif" }}>{s.label}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div style={{ background: '#fff', borderRadius: '20px', padding: '36px', border: '1px solid #e5e7eb', boxShadow: '0 8px 40px rgba(0,0,0,0.08)' }}>
            {success ? (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ width: '70px', height: '70px', background: '#d4f550', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '30px' }}>✓</div>
                <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#111', marginBottom: '10px' }}>Message Sent!</h3>
                <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '24px' }}>Thank you for reaching out. Our team will get back to you within 24 hours.</p>
                <button onClick={() => setSuccess(false)}
                  style={{ background: DARK, color: '#d4f550', border: 'none', borderRadius: '10px', padding: '12px 28px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                  Send Another Message
                </button>
              </div>
            ) : (
              <>
                <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#111', marginBottom: '6px' }}>Send Us a Message</h2>
                <p style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '28px' }}>Fill out the form below and we'll get back to you shortly.</p>
                <form onSubmit={handleSubmit}>
                  <div className="responsive-grid-2" style={{ gap: '14px', marginBottom: '14px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Full Name *</label>
                      <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                        placeholder="Juan dela Cruz"
                        style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Phone</label>
                      <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                        placeholder="09XX XXX XXXX"
                        style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email Address *</label>
                    <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                      placeholder="juan@email.com"
                      style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subject</label>
                    <select value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })}
                      style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", outline: 'none', boxSizing: 'border-box', background: '#fff' }}>
                      <option value="">Select a subject</option>
                      <option>Room Inquiry</option>
                      <option>Booking Modification</option>
                      <option>Cancellation Request</option>
                      <option>Special Request</option>
                      <option>Event / Group Booking</option>
                      <option>General Inquiry</option>
                    </select>
                  </div>
                  <div style={{ marginBottom: '24px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Message *</label>
                    <textarea required value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
                      placeholder="Tell us how we can help you..."
                      rows={5}
                      style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
                  </div>
                  <button type="submit" disabled={submitting}
                    style={{ width: '100%', background: DARK, color: '#d4f550', border: 'none', borderRadius: '12px', padding: '15px', fontSize: '14px', fontWeight: '700', cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: "'Poppins', sans-serif", opacity: submitting ? 0.7 : 1 }}>
                    {submitting ? 'Sending...' : 'Send Message →'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div style={{ background: LIGHT, padding: '60px 0' }}>
        <div className="section-container" style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <div style={{ fontSize: '11px', color: ACCENT, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>FAQ</div>
            <h2 style={{ fontSize: '26px', fontWeight: '700', color: '#111' }}>Frequently Asked Questions</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { q: 'What are the check-in and check-out times?', a: 'Check-in is at 2:00 PM and check-out is at 12:00 NN. Early check-in and late check-out may be arranged upon request.' },
              { q: 'Is there free parking at the resort?', a: 'Yes, HuaPro Resort offers free on-site parking for all guests throughout their stay.' },
              { q: 'What payment methods do you accept?', a: 'We accept cash, GCash, credit/debit cards, and bank transfers. Online bookings can be paid via PayMongo.' },
              { q: 'Can I cancel or modify my reservation?', a: 'Yes, cancellations and modifications are subject to our cancellation policy. Fees vary based on how many days before check-in you cancel.' },
              { q: 'Do you offer airport or terminal transfers?', a: 'Yes, we can arrange transfers from Clark International Airport or Dau Terminal. Please contact us in advance.' },
            ].map((f, i) => (
              <details key={i} style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                <summary style={{ padding: '16px 20px', fontWeight: '600', fontSize: '13px', color: '#111', cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {f.q}
                  <span style={{ color: ACCENT, fontSize: '18px' }}>+</span>
                </summary>
                <div style={{ padding: '0 20px 16px', fontSize: '13px', color: '#6b7280', lineHeight: '1.8' }}>{f.a}</div>
              </details>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer style={{ background: '#111', color: '#9ca3af', padding: '30px 20px', textAlign: 'center', fontSize: '12px' }}>
        © 2026 HuaPro Resort. All rights reserved.
      </footer>
    </div>
  );
}