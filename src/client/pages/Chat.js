import React, { useState, useEffect, useRef } from 'react';
import { db } from '../../firebase/firebase';
import { collection, addDoc, query, orderBy, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { NAME_ALLOWED_CHARACTERS, NAME_PATTERN, joinGuestName, splitGuestName } from '../../lib/nameValidation';
import { ensureGuestAuth } from '../../lib/guestAuth';

const ACCENT = '#4a7c59';
const DARK = '#1a3a1a';
const countWords = value => value.trim() ? value.trim().split(/\s+/).length : 0;
const limitWords = value => {
  const matches = [...value.matchAll(/\S+/g)];
  return matches.length <= 50 ? value : value.slice(0, matches[49].index + matches[49][0].length);
};

function ChatIcon({ size = 22 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z" /></svg>;
}
function ResortIcon({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 9h.01M15 9h.01M9 12h.01M15 12h.01" /></svg>;
}
function SendIcon({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4 20-7Z" /><path d="M22 2 11 13" /></svg>;
}

export default function GuestChat() {
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const guestName = joinGuestName(firstName, lastName);
  const validName = name => NAME_PATTERN.test(name.trim())
    && (name.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) || []).length >= 2;
  const [nameError, setNameError] = useState('');
  const [chatError, setChatError] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [convId, setConvId] = useState(null);
  const [ownerUid, setOwnerUid] = useState(null);
  const [started, setStarted] = useState(false);
  const bottomRef = useRef(null);

  // Restore session
  useEffect(() => {
    let active = true;
    const restoreGuestSession = async () => {
    try {
      const user = await ensureGuestAuth();
      if (!active) return;
      setOwnerUid(user.uid);
      const profile = JSON.parse(localStorage.getItem('guest_profile') || 'null');
      if (profile && typeof profile === 'object') {
        const names = typeof profile.guestName === 'string' ? splitGuestName(profile.guestName) : {};
        setFirstName(profile.firstName || names.firstName || '');
        setLastName(profile.lastName || names.lastName || '');
        setGuestPhone(String(profile.phone || '').replace(/\D/g, '').slice(0, 11));
      }
      const saved = JSON.parse(localStorage.getItem('huapro_conv') || 'null');
      if (saved?.id) {
        const names = typeof saved.name === 'string' ? splitGuestName(saved.name) : {};
        setFirstName(saved.firstName || names.firstName || '');
        setLastName(saved.lastName || names.lastName || '');
        setGuestPhone(String(saved.phone || '').replace(/\D/g, '').slice(0, 11));
        if (saved.ownerUid === user.uid && saved.sessionStarted === true) {
          setConvId(saved.id);
          setStarted(true);
        }
      }
    } catch (error) {
      console.error('Unable to restore saved guest chat details:', error);
      if (active) setChatError('Chat authentication is unavailable. Please try again shortly.');
    }
    };
    restoreGuestSession();
    return () => { active = false; };
  }, []);

  // Listen for messages
  useEffect(() => {
    if (!convId) return;
    const q = query(collection(db, 'conversations', convId, 'messages'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, snap => {
      const loadedMessages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(loadedMessages.length ? loadedMessages : [{
        id: 'welcome',
        sender: 'system',
        text: `Hello ${guestName}. Welcome to Lawiswis Kawayan Garden Resort. How can we help you today?`,
      }]);
    }, error => {
      console.error('Unable to load guest chat messages:', error);
      setChatError('We could not load this conversation. Please check your connection and try again.');
    });
    return () => unsub();
  }, [convId, guestName]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startChat = async (e) => {
    e.preventDefault();
    setChatError('');
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    if (!validName(normalizedFirstName) || !validName(normalizedLastName)) {
      setNameError('Enter a valid first and last name using at least two letters each.');
      return;
    }
    setNameError('');
    const normalizedGuestName = joinGuestName(normalizedFirstName, normalizedLastName);
    const id = `guest_${Date.now()}`;
    setFirstName(normalizedFirstName);
    setLastName(normalizedLastName);
    setMessages([{
      id: 'welcome',
      sender: 'system',
      text: `Hello ${normalizedGuestName}. Welcome to Lawiswis Kawayan Garden Resort. How can we help you today?`,
      createdAt: { seconds: Math.floor(Date.now() / 1000) },
    }]);
    setStarted(true);
    try {
      const profile = JSON.parse(localStorage.getItem('guest_profile') || '{}');
      localStorage.setItem('guest_profile', JSON.stringify({
        ...profile,
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        guestName: normalizedGuestName,
        phone: guestPhone,
      }));
      const user = await ensureGuestAuth();
      setOwnerUid(user.uid);
      setConvId(id);
      localStorage.setItem('huapro_conv', JSON.stringify({
        id,
        name: normalizedGuestName,
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        phone: guestPhone,
        ownerUid: user.uid,
        sessionStarted: true,
      }));
      await setDoc(doc(db, 'conversations', id), {
        ownerUid: user.uid,
        sessionStarted: true,
        guestName: normalizedGuestName,
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        phone: guestPhone,
        guestPhone,
        lastMessage: '',
        lastMessageAt: serverTimestamp(),
        unread: true,
      });
    } catch (error) {
      console.error('Unable to start guest chat:', error);
      setChatError('Your chat is open, but we could not connect to the resort team. Please try sending your message again or contact us by phone.');
    }
  };

  const sendMessage = async () => {
    if (!newMsg.trim() || sendingMessage) return;
    if (countWords(newMsg) > 50) return;
    if (!convId || !ownerUid) {
      setChatError('This chat is not connected yet. Please refresh and try again.');
      return;
    }
    const text = newMsg;
    setSendingMessage(true);
    setChatError('');
    try {
      await addDoc(collection(db, 'conversations', convId, 'messages'), {
        sender: 'guest',
        text,
        createdAt: serverTimestamp(),
        ownerUid,
      });
      await setDoc(doc(db, 'conversations', convId), {
        lastMessage: text,
        lastMessageAt: serverTimestamp(),
        unread: true,
        guestName,
        guestPhone,
      }, { merge: true });
      setNewMsg('');
    } catch (error) {
      console.error('Unable to send guest chat message:', error);
      setChatError('Your message could not be sent. Please check your connection and try again.');
    } finally {
      setSendingMessage(false);
    }
  };

  return (
    <div style={{ fontFamily: "'Poppins', sans-serif", background: '#f9fafb', minHeight: '100vh' }}>
      {/* Navbar */}
      <nav style={{ background: DARK, padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px' }}>
        <div style={{ fontWeight: '800', fontSize: '20px', color: '#fff', cursor: 'pointer' }} onClick={() => window.location.href = '/home'}>
          Lawiswis Kawayan Garden Resort
        </div>
        <button onClick={() => window.location.href = '/home'}
          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: '8px', padding: '8px 16px', fontSize: '12px', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
          ← Back to Home
        </button>
      </nav>

      <div className="section-container" style={{ maxWidth: '700px', margin: '40px auto', width: '100%' }}>
        {/* Header */}
        <div style={{ background: DARK, borderRadius: '16px 16px 0 0', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: '#d4f550', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
            <ResortIcon size={20} />
          </div>
          {chatError && <div role="alert" style={{ background: '#fef2f2', color: '#991b1b', padding: '12px 18px', fontSize: 12 }}>{chatError}</div>}
          <div>
            <div style={{ fontWeight: '700', fontSize: '15px', color: '#fff' }}>Lawiswis Kawayan Garden Resort Support</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#d4f550' }} />
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>Online · Usually replies in minutes</span>
            </div>
          </div>
        </div>

        {!started ? (
          /* Start chat form */
          <div style={{ background: '#fff', borderRadius: '0 0 16px 16px', border: '1px solid #e5e7eb', borderTop: 'none', padding: '40px 32px' }}>
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <div style={{ color: ACCENT, marginBottom: '12px' }}><ChatIcon size={36} /></div>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#111', marginBottom: '8px' }}>Chat with Us</h2>
              <p style={{ fontSize: '13px', color: '#6b7280' }}>Tell us your name to start chatting with our resort team.</p>
            </div>
            <form onSubmit={startChat}>
              <div style={{ marginBottom: '14px' }}>
                <label htmlFor="guest-chat-first-name" style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>First Name *</label>
                <input id="guest-chat-first-name" required value={firstName} maxLength={35} autoComplete="given-name"
                  onChange={e => {
                    const value = e.target.value;
                    setFirstName(value.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ\s'-]/g, '').slice(0, 35));
                    setNameError(NAME_ALLOWED_CHARACTERS.test(value) ? '' : 'Numbers and special symbols are not allowed.');
                  }}
                  placeholder="Juan"
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '12px 14px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label htmlFor="guest-chat-last-name" style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last Name *</label>
                <input id="guest-chat-last-name" required value={lastName} maxLength={35} autoComplete="family-name"
                  onChange={e => {
                    const value = e.target.value;
                    setLastName(value.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ\s'-]/g, '').slice(0, 35));
                    setNameError(NAME_ALLOWED_CHARACTERS.test(value) ? '' : 'Numbers and special symbols are not allowed.');
                  }}
                  placeholder="Dela Cruz"
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '12px 14px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", outline: 'none', boxSizing: 'border-box' }} />
                {nameError && <div role="alert" style={{ color: '#b91c1c', fontSize: 12, marginTop: 5 }}>{nameError}</div>}
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label htmlFor="guest-chat-phone" style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Phone Number (optional)</label>
                <input id="guest-chat-phone" value={guestPhone} inputMode="numeric" maxLength={11} onChange={e => setGuestPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  placeholder="09XX XXX XXXX"
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '12px 14px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <button type="submit" disabled={!validName(firstName) || !validName(lastName)}
                style={{ width: '100%', background: DARK, color: '#d4f550', border: 'none', borderRadius: '12px', padding: '14px', fontSize: '14px', fontWeight: '700', cursor: validName(firstName) && validName(lastName) ? 'pointer' : 'not-allowed', opacity: validName(firstName) && validName(lastName) ? 1 : 0.65, fontFamily: "'Poppins', sans-serif" }}>
                Start Chatting →
              </button>
            </form>
          </div>
        ) : (
          /* Chat window */
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 16px 16px', display: 'flex', flexDirection: 'column', height: '520px' }}>
            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', background: '#fafafa' }}>
              {messages.map(m => (
                <div key={m.id} style={{ display: 'flex', justifyContent: m.sender === 'guest' ? 'flex-end' : 'flex-start', gap: '8px', alignItems: 'flex-end' }}>
                  {m.sender !== 'guest' && (
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: DARK, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><ResortIcon size={15} /></div>
                  )}
                  <div style={{ maxWidth: '70%' }}>
                    <div style={{
                      background: m.sender === 'guest' ? DARK : '#fff',
                      color: m.sender === 'guest' ? '#d4f550' : '#111',
                      border: m.sender === 'guest' ? 'none' : '1px solid #e5e7eb',
                      borderRadius: m.sender === 'guest' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      padding: '10px 14px', fontSize: '13px', lineHeight: '1.5',
                    }}>
                      {m.text}
                    </div>
                    <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '4px', textAlign: m.sender === 'guest' ? 'right' : 'left' }}>
                      {m.createdAt?.seconds ? new Date(m.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sending...'}
                    </div>
                  </div>
                  {m.sender === 'guest' && (
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: '700', fontSize: '11px', flexShrink: 0 }}>
                      {guestName[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Quick replies */}
            <div style={{ padding: '8px 16px', display: 'flex', gap: '8px', overflowX: 'auto', borderTop: '1px solid #f3f4f6' }}>
              {['Room availability?', 'Booking inquiry', 'Cancellation policy', 'Check-in time?'].map(q => (
                <button key={q} onClick={() => { setNewMsg(q); }}
                  style={{ background: '#f3f4f6', border: 'none', borderRadius: '20px', padding: '6px 12px', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'Poppins', sans-serif", color: '#374151' }}>
                  {q}
                </button>
              ))}
            </div>

            {/* Input */}
            <div style={{ padding: '14px 16px', borderTop: '1px solid #f3f4f6' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
              <input value={newMsg} onChange={e => setNewMsg(limitWords(e.target.value))}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder="Type your message..."
                aria-describedby="guest-chat-word-count"
                style={{ flex: 1, minWidth: 0, border: '1px solid #e5e7eb', borderRadius: '10px', padding: '11px 16px', fontSize: '13px', outline: 'none', fontFamily: "'Poppins', sans-serif" }} />
              <button onClick={sendMessage} disabled={!newMsg.trim() || sendingMessage}
                style={{ background: DARK, border: 'none', borderRadius: '10px', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: newMsg.trim() && !sendingMessage ? 'pointer' : 'not-allowed', flexShrink: 0 }} aria-label="Send message">
                <span style={{ color: '#d4f550' }}><SendIcon /></span>
              </button>
              </div>
              <div id="guest-chat-word-count" aria-live="polite" style={{ color: '#6b7280', fontSize: '10px', marginTop: '6px' }}>{countWords(newMsg)} words · {50 - countWords(newMsg)} remaining</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}