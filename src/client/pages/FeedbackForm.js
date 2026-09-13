import React, { useState } from 'react';
import { db } from '../../firebase/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

const ACCENT = '#4a7c59';
const DARK = '#1a3a1a';
const LIGHT = '#f0f7f0';

export default function FeedbackForm() {
  const [form, setForm] = useState({ guestName: '', roomNumber: '', rating: 0, comment: '' });
  const [hover, setHover] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.rating === 0) return alert('Please select a star rating.');
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'feedback'), {
        ...form,
        read: false,
        createdAt: serverTimestamp(),
      });
      setSubmitted(true);
    } catch {
      alert('Something went wrong. Please try again.');
    }
    setSubmitting(false);
  };

  const ratingLabels = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];
  const ratingColors = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a'];

  if (submitted) return (
    <div style={{ minHeight: '100vh', background: LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Poppins', sans-serif", padding: '20px' }}>
      <div style={{ background: '#fff', borderRadius: '24px', padding: '40px 24px', textAlign: 'center', maxWidth: '420px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.08)' }}>
        <div style={{ width: '80px', height: '80px', background: '#d4f550', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '36px' }}>
          🌟
        </div>
        <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#111', marginBottom: '10px' }}>Thank You!</h2>
        <p style={{ fontSize: '13px', color: '#6b7280', lineHeight: '1.8', marginBottom: '28px' }}>
          Your feedback means the world to us. We use your input to continuously improve our services and make every stay at HuaPro unforgettable.
        </p>
        <div style={{ background: LIGHT, borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
          <div style={{ fontSize: '28px', marginBottom: '4px' }}>{'★'.repeat(form.rating)}{'☆'.repeat(5 - form.rating)}</div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: ratingColors[form.rating] }}>{ratingLabels[form.rating]}</div>
        </div>
        <button onClick={() => window.location.href = '/home'}
          style={{ width: '100%', background: DARK, color: '#d4f550', border: 'none', borderRadius: '12px', padding: '14px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
          Back to Home
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: LIGHT, fontFamily: "'Poppins', sans-serif" }}>
      {/* Header */}
      <div style={{ background: DARK, padding: '24px 20px', textAlign: 'center' }}>
        <div style={{ fontWeight: '800', fontSize: '20px', color: '#fff', marginBottom: '4px' }}>🌿 HuaPro Resort</div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>Guest Feedback Form</div>
      </div>

      <div className="section-container" style={{ maxWidth: '500px', margin: '40px auto', padding: '0 0 60px', width: '100%' }}>
        <div style={{ background: '#fff', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 10px 40px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb' }}>
          {/* Top banner */}
          <div style={{ background: `linear-gradient(135deg, ${DARK}, #2d5a2d)`, padding: '28px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>💬</div>
            <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#fff', marginBottom: '6px' }}>How was your stay?</h1>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.65)' }}>Your feedback helps us serve you better</p>
          </div>

          <form onSubmit={handleSubmit} style={{ padding: '28px' }}>
            {/* Star Rating */}
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '14px' }}>
                Overall Experience
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '10px' }}>
                {[1, 2, 3, 4, 5].map(star => (
                  <button key={star} type="button"
                    onMouseEnter={() => setHover(star)}
                    onMouseLeave={() => setHover(0)}
                    onClick={() => setForm({ ...form, rating: star })}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '42px', transition: 'transform 0.1s', transform: (hover || form.rating) >= star ? 'scale(1.15)' : 'scale(1)', filter: (hover || form.rating) >= star ? 'none' : 'grayscale(1) opacity(0.3)' }}>
                    ⭐
                  </button>
                ))}
              </div>
              {(hover || form.rating) > 0 && (
                <div style={{ fontSize: '14px', fontWeight: '600', color: ratingColors[hover || form.rating] }}>
                  {ratingLabels[hover || form.rating]}
                </div>
              )}
            </div>

            {/* Guest Info */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Name (optional)</label>
              <input value={form.guestName} onChange={e => setForm({ ...form, guestName: e.target.value })}
                placeholder="Juan dela Cruz"
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", outline: 'none', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Room Number (optional)</label>
              <input value={form.roomNumber} onChange={e => setForm({ ...form, roomNumber: e.target.value })}
                placeholder="e.g. 101"
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", outline: 'none', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Comments (optional)</label>
              <textarea value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })}
                placeholder="Tell us about your experience — what did you love? What can we improve?"
                rows={4}
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
            </div>

            {/* Quick tags */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Quick Tags</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {['Clean rooms', 'Friendly staff', 'Great food', 'Beautiful pool', 'Good value', 'Peaceful', 'Needs improvement'].map(tag => (
                  <button key={tag} type="button"
                    onClick={() => setForm({ ...form, comment: form.comment ? `${form.comment}, ${tag}` : tag })}
                    style={{ background: LIGHT, border: `1px solid ${ACCENT}`, borderRadius: '20px', padding: '6px 14px', fontSize: '11px', color: ACCENT, fontWeight: '500', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            <button type="submit" disabled={submitting || form.rating === 0}
              style={{ width: '100%', background: form.rating === 0 ? '#e5e7eb' : DARK, color: form.rating === 0 ? '#9ca3af' : '#d4f550', border: 'none', borderRadius: '12px', padding: '15px', fontSize: '14px', fontWeight: '700', cursor: form.rating === 0 ? 'not-allowed' : 'pointer', fontFamily: "'Poppins', sans-serif", transition: 'all 0.2s' }}>
              {submitting ? 'Submitting...' : '⭐ Submit Feedback'}
            </button>

            <p style={{ textAlign: 'center', fontSize: '11px', color: '#9ca3af', marginTop: '14px' }}>
              🔒 Your feedback is private and helps us improve
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}