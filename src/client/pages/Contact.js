import React, { useState } from 'react';
import { BRASS, CREAM, FOREST, FOREST_DEEP, INK, LINE, PAPER, SERIF, SANS } from '../components/clientTheme';
import { NAME_ALLOWED_CHARACTERS, NAME_PATTERN } from '../../lib/nameValidation';

const INITIAL_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  subject: '',
  message: '',
};

const countWords = value => value.trim() ? value.trim().split(/\s+/).length : 0;
const limitWords = value => {
  const matches = [...value.matchAll(/\S+/g)];
  return matches.length <= 50 ? value : value.slice(0, matches[49].index + matches[49][0].length);
};

export default function Contact() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [nameErrors, setNameErrors] = useState({});
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const update = event => {
    const { name, value } = event.target;
    if (name === 'firstName' || name === 'lastName') {
      const clean = value.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ\s'-]/g, '').slice(0, 35);
      setForm(previous => ({ ...previous, [name]: clean }));
      setNameErrors(previous => ({
        ...previous,
        [name]: !NAME_ALLOWED_CHARACTERS.test(value)
          ? 'Numbers and special symbols are not allowed'
          : '',
      }));
      return;
    }
    setForm(previous => ({ ...previous, [name]: name === 'message' ? limitWords(value) : value }));
  };

  const validateNames = () => {
    const errors = {};
    ['firstName', 'lastName'].forEach(key => {
      if (!NAME_PATTERN.test(form[key].trim())) {
        errors[key] = `${key === 'firstName' ? 'First' : 'Last'} name must contain 2-35 letters, spaces, hyphens, or apostrophes.`;
      }
    });
    setNameErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submit = async event => {
    event.preventDefault();
    setSubmitError('');
    if (!validateNames()) return;

    setSending(true);
    try {
      const response = await fetch('/api/contact-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          message: form.message.trim(),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Your message could not be sent. Please try again.');
      setSent(true);
      setForm(INITIAL_FORM);
      setNameErrors({});
    } catch (error) {
      setSubmitError(error.message || 'Your message could not be sent. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const fieldStyle = {
    width: '100%',
    boxSizing: 'border-box',
    border: `1px solid ${LINE}`,
    padding: '12px 13px',
    background: PAPER,
    color: INK,
    font: `13px ${SANS}`,
    outline: 'none',
  };
  const labelStyle = {
    display: 'grid',
    gap: '7px',
    color: INK,
    font: `600 10px ${SANS}`,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
  };

  const nameField = (name, label, autoComplete) => (
    <label style={labelStyle}>
      {label}
      <input
        required
        name={name}
        type="text"
        autoComplete={autoComplete}
        minLength={2}
        maxLength={35}
        value={form[name]}
        onChange={update}
        onBlur={() => setNameErrors(previous => ({
          ...previous,
          [name]: NAME_PATTERN.test(form[name].trim())
            ? ''
            : `${label} must contain 2-35 letters, spaces, hyphens, or apostrophes.`,
        }))}
        aria-invalid={Boolean(nameErrors[name])}
        aria-describedby={`${name}-error`}
        style={fieldStyle}
      />
      <span id={`${name}-error`} role={nameErrors[name] ? 'alert' : undefined}
        style={{ color: nameErrors[name] ? '#b91c1c' : 'transparent', font: `11px ${SANS}`, textTransform: 'none', letterSpacing: 0 }}>
        {nameErrors[name] || ' '}
      </span>
    </label>
  );

  return (
    <div style={{ background: PAPER, minHeight: '100vh' }}>
      <section style={{ background: FOREST_DEEP, padding: '78px 24px 92px', color: '#fff' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ color: '#e7dfc4', font: `600 11px ${SANS}`, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: '14px' }}>Come say hello</div>
          <h1 style={{ font: `500 clamp(42px, 6vw, 70px)/1 ${SERIF}`, margin: '0 0 18px' }}>Let’s plan your time here.</h1>
          <p style={{ color: 'rgba(255,255,255,.7)', font: `14px/1.8 ${SANS}`, maxWidth: '480px', margin: 0 }}>Questions about a room, an event, or a slower weekend? Our team would love to help.</p>
        </div>
      </section>

      <div id="contact-grid" style={{ maxWidth: '1100px', margin: '0 auto', padding: '70px 24px 100px', display: 'grid', gridTemplateColumns: '.8fr 1.2fr', gap: '70px' }}>
        <div>
          <h2 style={{ color: INK, font: `500 32px ${SERIF}`, margin: '0 0 22px' }}>Find us in the garden.</h2>
          <div style={{ display: 'grid', gap: '22px', color: '#6b6a5c', font: `13px/1.7 ${SANS}` }}>
            <div><strong style={{ display: 'block', color: FOREST, font: `600 10px ${SANS}`, letterSpacing: '.12em', textTransform: 'uppercase' }}>Address</strong>402 Brgy. Buguion, Calumpit, Bulacan, Philippines</div>
            <div><strong style={{ display: 'block', color: FOREST, font: `600 10px ${SANS}`, letterSpacing: '.12em', textTransform: 'uppercase' }}>Call</strong>0917 811 2332<br />Daily, 7:00 AM – 10:00 PM</div>
            <div><strong style={{ display: 'block', color: FOREST, font: `600 10px ${SANS}`, letterSpacing: '.12em', textTransform: 'uppercase' }}>Email</strong>info@lawiswiskawayanresort.com</div>
          </div>
          <div style={{ marginTop: '38px', background: CREAM, padding: '24px', borderLeft: `3px solid ${BRASS}`, color: '#6b6a5c', font: `13px/1.8 ${SANS}` }}>Check-in is at 2:00 PM and check-out is at 12:00 NN. For events and group stays, contact us ahead of time so we can prepare the garden for you.</div>
        </div>

        <div style={{ background: '#fff', border: `1px solid ${LINE}`, padding: '32px' }}>
          {sent ? (
            <div role="status" aria-live="polite" style={{ padding: '50px 10px', textAlign: 'center', animation: 'contact-confirm .35s ease-out both' }}>
              <div style={{ color: BRASS, font: `500 44px ${SERIF}` }}>Thank you.</div>
              <p style={{ color: '#6b6a5c', font: `13px/1.8 ${SANS}` }}>Your message has been delivered to our team. We’ll be in touch within 24 hours.</p>
              <button type="button" onClick={() => setSent(false)} style={{ background: FOREST, color: '#fff', border: 0, borderRadius: '3px', padding: '12px 18px', font: `600 11px ${SANS}`, cursor: 'pointer' }}>SEND ANOTHER MESSAGE</button>
            </div>
          ) : (
            <>
              <div style={{ color: BRASS, font: `600 11px ${SANS}`, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: '9px' }}>Write to us</div>
              <h2 style={{ color: INK, font: `500 32px ${SERIF}`, margin: '0 0 26px' }}>How can we help?</h2>
              <form onSubmit={submit} style={{ display: 'grid', gap: '16px' }}>
                <div className="contact-fields">
                  {nameField('firstName', 'First Name', 'given-name')}
                  {nameField('lastName', 'Last Name', 'family-name')}
                </div>
                <div className="contact-fields">
                  <label style={labelStyle}>Phone<input name="phone" type="tel" maxLength={40} value={form.phone} onChange={update} style={fieldStyle} /></label>
                  <label style={labelStyle}>Email address<input required name="email" type="email" autoComplete="email" maxLength={254} value={form.email} onChange={update} style={fieldStyle} /></label>
                </div>
                <label style={labelStyle}>Subject
                  <select name="subject" value={form.subject} onChange={update} style={fieldStyle}>
                    <option value="">Select a subject</option><option>Room Inquiry</option><option>Event / Group Booking</option><option>Booking Modification</option><option>General Inquiry</option>
                  </select>
                </label>
                <label style={labelStyle}>Message
                  <textarea required name="message" value={form.message} onChange={update} rows="5" aria-describedby="contact-message-count" style={{ ...fieldStyle, font: `13px/1.6 ${SANS}`, resize: 'vertical' }} />
                  <span id="contact-message-count" aria-live="polite" style={{ color: '#777363', font: `11px ${SANS}`, textTransform: 'none', letterSpacing: 0 }}>{countWords(form.message)} words · {50 - countWords(form.message)} remaining</span>
                </label>
                {submitError && <p role="alert" style={{ color: '#b91c1c', background: '#fef2f2', padding: '12px', font: `12px/1.6 ${SANS}`, margin: 0 }}>{submitError}</p>}
                <button type="submit" disabled={sending} style={{ background: FOREST, color: '#fff', border: 0, borderRadius: '3px', padding: '14px', font: `600 11px ${SANS}`, letterSpacing: '.08em', cursor: sending ? 'wait' : 'pointer', opacity: sending ? 0.7 : 1 }}>{sending ? 'SENDING...' : 'SEND MESSAGE →'}</button>
              </form>
            </>
          )}
        </div>
      </div>
      <style>{`@keyframes contact-confirm{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}} #contact-grid .contact-fields{display:grid;grid-template-columns:1fr 1fr;gap:14px} @media(max-width:700px){#contact-grid{grid-template-columns:1fr!important;gap:36px!important}#contact-grid .contact-fields{grid-template-columns:1fr}} @media(prefers-reduced-motion:reduce){#contact-grid [role=status]{animation:none!important}}`}</style>
    </div>
  );
}
