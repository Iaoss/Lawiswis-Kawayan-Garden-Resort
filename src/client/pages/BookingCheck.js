import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

// Opened from the "Did you make this reservation?" email. The guest presses
// a button to answer, so a mail scanner opening the link can't answer for them.

const DARK = '#1a3a1a';
const ACCENT = '#4a7c59';

export default function BookingCheck() {
  const [params] = useSearchParams();
  const id = params.get('id') || '';
  const token = params.get('token') || '';
  const suggested = params.get('answer') === 'no' ? 'no' : 'yes';
  const [state, setState] = useState({ busy: false, error: '', done: null });

  const send = async answer => {
    setState({ busy: true, error: '', done: null });
    try {
      const response = await fetch('/api/booking-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, token, answer }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Your answer could not be saved.');
      setState({ busy: false, error: '', done: result });
    } catch (error) {
      setState({ busy: false, error: error.message, done: null });
    }
  };

  const done = state.done;
  const ref = done?.bookingRef || id.slice(0, 8).toUpperCase();
  const button = (answer, label, primary) => (
    <button type="button" disabled={state.busy} onClick={() => send(answer)}
      style={{ border: primary ? 0 : `1px solid ${ACCENT}`, borderRadius: 8, padding: '12px 18px', background: primary ? DARK : '#fff', color: primary ? '#fff' : DARK, fontWeight: 700, fontSize: 14, cursor: state.busy ? 'wait' : 'pointer' }}>
      {label}
    </button>
  );

  return (
    <main style={{ minHeight: '70vh', background: '#f7f8f5', padding: '52px 18px', color: '#22261b', fontFamily: "'Inter', sans-serif" }}>
      <section style={{ maxWidth: 520, margin: '0 auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 24 }}>
        <p style={{ color: ACCENT, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', margin: '0 0 8px' }}>BOOKING #{ref}</p>
        {!id || !token ? (
          <p style={{ margin: 0, fontSize: 14 }}>This link is incomplete. Please open it again from the email, or contact the resort at 0917 811 2332.</p>
        ) : done ? (
          done.saved ? (
            <>
              <h1 style={{ color: DARK, fontFamily: "'Fraunces', Georgia, serif", fontSize: 28, margin: '0 0 10px' }}>
                {done.answer === 'yes' ? 'Thank you!' : 'Thanks for letting us know'}
              </h1>
              <p style={{ fontSize: 14, lineHeight: 1.7, margin: 0 }}>
                {done.answer === 'yes'
                  ? 'We will email you a secure payment link shortly. Your booking is confirmed as soon as the payment goes through.'
                  : 'We will not hold this booking. No payment was taken. If this was a mistake, call us at 0917 811 2332.'}
              </p>
            </>
          ) : (
            <p style={{ fontSize: 14, lineHeight: 1.7, margin: 0 }}>
              {done.state === 'cancelled'
                ? 'This booking has already been cancelled.'
                : 'This booking no longer needs an answer. It has already been paid or confirmed.'}
            </p>
          )
        ) : (
          <>
            <h1 style={{ color: DARK, fontFamily: "'Fraunces', Georgia, serif", fontSize: 28, margin: '0 0 10px' }}>Did you make this reservation?</h1>
            <p style={{ fontSize: 14, lineHeight: 1.7, margin: '0 0 18px' }}>
              Please confirm so we know whether to hold the room for you.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {suggested === 'yes'
                ? <>{button('yes', 'Yes, this is my booking', true)}{button('no', 'No, I did not book this', false)}</>
                : <>{button('no', 'No, I did not book this', true)}{button('yes', 'Yes, this is my booking', false)}</>}
            </div>
            {state.error && <p role="alert" style={{ color: '#b91c1c', fontSize: 13, margin: '14px 0 0' }}>{state.error}</p>}
          </>
        )}
        <div style={{ marginTop: 22 }}><Link to="/" style={{ color: DARK, fontWeight: 700, fontSize: 13 }}>Go to the resort website</Link></div>
      </section>
    </main>
  );
}
