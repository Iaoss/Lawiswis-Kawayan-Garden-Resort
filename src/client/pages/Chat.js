import React, { useState, useEffect, useRef } from 'react';
import { db } from '../../firebase/firebase';
import { collection, addDoc, query, orderBy, onSnapshot, doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';

const ACCENT = '#4a7c59';
const DARK = '#1a3a1a';

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
      text: `Hello ${guestName}! 👋 Welcome to Lawiswis Kawayan Garden Resort. How can we help you today?`,
      createdAt: serverTimestamp(),
    });
  };

  const sendMessage = async () => {
    if (!newMsg.trim() || !convId) return;
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
          🌿 Lawiswis Kawayan Garden Resort
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
            🏨
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
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>💬</div>
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
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', flexShrink: 0 }}>🏨</div>
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
            <div style={{ padding: '14px 16px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: '10px' }}>
              <input value={newMsg} onChange={e => setNewMsg(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder="Type your message..."
                style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: '10px', padding: '11px 16px', fontSize: '13px', outline: 'none', fontFamily: "'Poppins', sans-serif" }} />
              <button onClick={sendMessage}
                style={{ background: DARK, border: 'none', borderRadius: '10px', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                <span style={{ color: '#d4f550', fontSize: '18px' }}>➤</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}