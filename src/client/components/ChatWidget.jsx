import React, { useState, useEffect, useRef } from 'react';
import { db } from '../../firebase/firebase';
import { collection, addDoc, query, orderBy, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore';

const ACCENT = '#4a7c59';
const DARK = '#1a3a1a';
const LIGHT = '#f9fafb';

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [convId, setConvId] = useState(null);
  const [started, setStarted] = useState(false);
  const bottomRef = useRef(null);

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

  useEffect(() => {
    const openHandler = () => setOpen(true);
    window.addEventListener('openGuestChat', openHandler);
    return () => window.removeEventListener('openGuestChat', openHandler);
  }, []);

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
    <div style={{ position: 'fixed', right: '22px', bottom: '22px', zIndex: 9999, fontFamily: "'Poppins', sans-serif" }}>
      {open ? (
        <div style={{ width: '320px', maxWidth: 'calc(100vw - 32px)', background: '#fff', borderRadius: '24px', boxShadow: '0 30px 80px rgba(0,0,0,0.18)', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: '420px', minWidth: '280px' }}>
          <div style={{ background: DARK, color: '#fff', padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div>
              <div style={{ fontWeight: '800', fontSize: '15px' }}>Lawiswis Support</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>Usually replies in minutes</div>
            </div>
            <button onClick={() => setOpen(false)}
              style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', color: '#fff', cursor: 'pointer', fontSize: '16px' }}>
              ×
            </button>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: LIGHT }}>
            {!started ? (
              <form onSubmit={startChat} style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>💬</div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#111', marginBottom: '4px' }}>Start a conversation</div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>Enter your name to begin chatting.</div>
                </div>
                <label style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Name *</label>
                <input
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  placeholder="Juan dela Cruz"
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '12px 14px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                />
                <label style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Phone (optional)</label>
                <input
                  value={guestPhone}
                  onChange={e => setGuestPhone(e.target.value)}
                  placeholder="09XX XXX XXXX"
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '12px 14px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                />
                <button type="submit" style={{ width: '100%', background: DARK, color: '#d4f550', border: 'none', borderRadius: '14px', padding: '12px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
                  Start Chatting
                </button>
              </form>
            ) : (
              <>
                <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {messages.map(m => (
                    <div key={m.id} style={{ display: 'flex', justifyContent: m.sender === 'guest' ? 'flex-end' : 'flex-start' }}>
                      <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ alignSelf: m.sender === 'guest' ? 'flex-end' : 'flex-start', background: m.sender === 'guest' ? DARK : '#fff', color: m.sender === 'guest' ? '#d4f550' : '#111', border: m.sender === 'guest' ? 'none' : '1px solid #e5e7eb', borderRadius: '18px', padding: '12px 14px', fontSize: '13px', lineHeight: 1.5 }}>
                          {m.text}
                        </div>
                        <div style={{ fontSize: '10px', color: '#9ca3af', textAlign: m.sender === 'guest' ? 'right' : 'left' }}>
                          {m.createdAt?.seconds ? new Date(m.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sending...'}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>
                <div style={{ padding: '12px 14px', borderTop: '1px solid #e5e7eb', background: '#fff' }}>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                      value={newMsg}
                      onChange={e => setNewMsg(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && sendMessage()}
                      placeholder="Type your message..."
                      style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: '14px', padding: '12px 14px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                    />
                    <button onClick={sendMessage} style={{ width: '48px', height: '48px', borderRadius: '14px', border: 'none', background: DARK, color: '#d4f550', cursor: 'pointer', fontSize: '18px' }}>
                      ➤
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <button onClick={() => setOpen(true)}
          style={{ width: '60px', height: '60px', borderRadius: '50%', background: ACCENT, border: 'none', boxShadow: '0 20px 40px rgba(0,0,0,0.18)', color: '#fff', fontSize: '24px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          💬
        </button>
      )}
    </div>
  );
}
