import React, { useState, useEffect, useRef } from 'react';
import { db } from '../../firebase/firebase';
import { collection, addDoc, query, orderBy, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore';

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
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [convId, setConvId] = useState(null);
  const [started, setStarted] = useState(false);
  const bottomRef = useRef(null);

  // Restore session
  useEffect(() => {
    const saved = localStorage.getItem('huapro_conv');
    if (saved) {
      const { id, name, phone } = JSON.parse(saved);
      setConvId(id);
      setGuestName(name);
      setGuestPhone(phone);
      setStarted(true);
    }
  }, []);

  // Listen for messages
  useEffect(() => {
    if (!convId) return;
    const q = query(collection(db, 'conversations', convId, 'messages'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [convId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startChat = async (e) => {
    e.preventDefault();
    if (!guestName.trim()) return;
    const id = `guest_${Date.now()}`;
    await setDoc(doc(db, 'conversations', id), {
      guestName,
      guestPhone,
      lastMessage: '',
      lastMessageAt: serverTimestamp(),
      unread: true,
    });
    localStorage.setItem('huapro_conv', JSON.stringify({ id, name: guestName, phone: guestPhone }));
    setConvId(id);
    setStarted(true);
    // Send welcome message from system
    await addDoc(collection(db, 'conversations', id, 'messages'), {
      sender: 'staff',
      text: `Hello ${guestName}. Welcome to Lawiswis Kawayan Garden Resort. How can we help you today?`,
      createdAt: serverTimestamp(),
    });
  };

  const sendMessage = async () => {
    if (!newMsg.trim() || !convId) return;
    if (countWords(newMsg) > 50) return;
    const text = newMsg;
    setNewMsg('');
    await addDoc(collection(db, 'conversations', convId, 'messages'), {
      sender: 'guest',
      text,
      createdAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'conversations', convId), {
      lastMessage: text,
      lastMessageAt: serverTimestamp(),
      unread: true,
      guestName,
      guestPhone,
    }, { merge: true });
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
                <label style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Name *</label>
                <input required value={guestName} onChange={e => setGuestName(e.target.value)}
                  placeholder="Juan dela Cruz"
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '12px 14px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Phone Number (optional)</label>
                <input value={guestPhone} onChange={e => setGuestPhone(e.target.value)}
                  placeholder="09XX XXX XXXX"
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '12px 14px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <button type="submit"
                style={{ width: '100%', background: DARK, color: '#d4f550', border: 'none', borderRadius: '12px', padding: '14px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
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
                  {m.sender === 'staff' && (
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
              <button onClick={sendMessage} disabled={!newMsg.trim()}
                style={{ background: DARK, border: 'none', borderRadius: '10px', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: newMsg.trim() ? 'pointer' : 'not-allowed', flexShrink: 0 }} aria-label="Send message">
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