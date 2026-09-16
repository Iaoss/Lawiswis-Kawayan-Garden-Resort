import React, { useState, useEffect, useRef } from 'react';
import { db } from '../../firebase/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';

const PANEL_WIDTH = 400;

export default function ChatPanel({ dark, accent, open, onClose }) {
  const ACCENT      = accent || '#9cb56f';
  const ACCENT_TEXT = '#0a1a0a';
  const PANEL_BG  = dark ? '#1c1c1c' : '#ffffff';
  const CARD2     = dark ? '#282827' : '#f9fafb';
  const BORDER    = dark ? '#2a2a28' : '#e5e7eb';
  const TEXT      = dark ? '#f0f0f0' : '#111827';
  const MUTED     = dark ? '#9ca3af' : '#9ca3af';
  const HOVER_BG  = dark ? '#242422' : '#f9fafb';
  const SELECTED_BG = dark ? '#242422' : '#f3f4f6';
  const CHAT_BG   = dark ? '#141414' : '#fafafa';
  const BUBBLE_BG = dark ? '#282827' : '#ffffff';
  const AVATAR_BG = dark ? '#282827' : '#1f2937';

  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState('list'); // 'list' | 'chat'
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [search, setSearch] = useState('');
  const [faqs, setFaqs] = useState([]);
  const [quickOpen, setQuickOpen] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'conversations'), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (b.lastMessageAt?.seconds || 0) - (a.lastMessageAt?.seconds || 0));
      setConversations(data);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'faqs'), orderBy('order', 'asc'));
    const unsub = onSnapshot(q, (snap) => setFaqs(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!selected) return;
    const q = query(collection(db, 'conversations', selected.id, 'messages'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, [selected]);

  useEffect(() => {
    if (view === 'chat') bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, view]);

  const openConversation = async (conv) => {
    setSelected(conv);
    setView('chat');
    setQuickOpen(false);
    if (conv.unread) {
      await updateDoc(doc(db, 'conversations', conv.id), { unread: false });
    }
  };

  const backToList = () => {
    setView('list');
    setQuickOpen(false);
  };

  const sendMessage = async () => {
    if (!newMsg.trim() || !selected) return;
    await addDoc(collection(db, 'conversations', selected.id, 'messages'), {
      sender: 'staff',
      text: newMsg,
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'conversations', selected.id), {
      lastMessage: newMsg,
      lastMessageAt: serverTimestamp(),
    });
    setNewMsg('');
  };

  const insertFaqAnswer = (faq) => {
    setNewMsg(faq.answer);
    setQuickOpen(false);
    inputRef.current?.focus();
  };

  const filtered = conversations.filter(c =>
    c.guestName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.35)',
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none',
        transition: 'opacity 0.2s',
      }} />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, height: '100vh', width: PANEL_WIDTH,
        maxWidth: '100vw', background: PANEL_BG, zIndex: 301,
        display: 'flex', flexDirection: 'column',
        boxShadow: dark ? '-8px 0 40px rgba(0,0,0,0.5)' : '-8px 0 40px rgba(0,0,0,0.15)',
        transform: open ? 'translateX(0)' : `translateX(${PANEL_WIDTH}px)`,
        transition: 'transform 0.25s ease',
        fontFamily: "'Poppins', sans-serif",
      }}>

        {view === 'list' ? (
          <>
            {/* Header */}
            <div style={{ padding: '18px 18px 14px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: TEXT }}>Messages</div>
              <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: MUTED, fontSize: 18, padding: 4 }}>
                <i className="ti ti-x" />
              </button>
            </div>

            {/* Search */}
            <div style={{ padding: '14px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: CARD2, borderRadius: 10, padding: '8px 12px' }}>
                <i className="ti ti-search" style={{ fontSize: 14, color: MUTED }} />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search guest..."
                  style={{ border: 'none', outline: 'none', fontSize: 12, background: 'transparent', fontFamily: 'inherit', width: '100%', color: TEXT }} />
              </div>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', color: MUTED, fontSize: 12, padding: 30 }}>No conversations yet.</div>
              ) : filtered.map(c => (
                <div key={c.id} onClick={() => openConversation(c)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px',
                    borderBottom: `1px solid ${BORDER}`, cursor: 'pointer',
                    background: selected?.id === c.id ? SELECTED_BG : 'transparent',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = HOVER_BG}
                  onMouseLeave={e => e.currentTarget.style.background = selected?.id === c.id ? SELECTED_BG : 'transparent'}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: AVATAR_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ACCENT, fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
                    {(c.guestName || 'G')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600, fontSize: 12.5, color: TEXT }}>{c.guestName}</span>
                      <span style={{ fontSize: 10, color: MUTED }}>
                        {c.lastMessageAt?.seconds ? new Date(c.lastMessageAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.lastMessage || 'No messages yet'}
                    </div>
                  </div>
                  {c.unread && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />}
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* Chat header */}
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={backToList} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: TEXT, fontSize: 18, padding: 4, display: 'flex' }}>
                <i className="ti ti-arrow-left" />
              </button>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: AVATAR_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ACCENT, fontWeight: 700, fontSize: 13 }}>
                {(selected?.guestName || 'G')[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: TEXT }}>{selected?.guestName}</div>
                <div style={{ fontSize: 11, color: MUTED }}>Room {selected?.roomNumber || '—'}</div>
              </div>
              <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: MUTED, fontSize: 18, padding: 4 }}>
                <i className="ti ti-x" />
              </button>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, background: CHAT_BG }}>
              {messages.map(m => (
                <div key={m.id} style={{ alignSelf: m.sender === 'staff' ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
                  <div style={{
                    background: m.sender === 'staff' ? ACCENT : BUBBLE_BG,
                    border: m.sender === 'staff' ? 'none' : `1px solid ${BORDER}`,
                    borderRadius: 14, padding: '10px 14px', fontSize: 12,
                    color: m.sender === 'staff' ? ACCENT_TEXT : TEXT,
                  }}>
                    {m.text}
                  </div>
                  <div style={{ fontSize: 10, color: MUTED, marginTop: 4, display: 'flex', gap: 6, justifyContent: m.sender === 'staff' ? 'flex-end' : 'flex-start' }}>
                    {m.isBot && <span>🤖 Auto-reply</span>}
                    <span>{m.createdAt?.seconds ? new Date(m.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sending...'}</span>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div style={{ padding: 14, borderTop: `1px solid ${BORDER}`, position: 'relative' }}>
              {quickOpen && (
                <>
                  <div onClick={() => setQuickOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 350 }} />
                  <div style={{
                    position: 'absolute', bottom: 64, left: 14, right: 14, maxHeight: 240, overflowY: 'auto',
                    background: PANEL_BG, border: `1px solid ${BORDER}`, borderRadius: 12,
                    boxShadow: dark ? '0 12px 32px rgba(0,0,0,0.5)' : '0 12px 32px rgba(0,0,0,0.12)', zIndex: 360,
                  }}>
                    <div style={{ padding: '10px 14px', borderBottom: `1px solid ${BORDER}`, fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Quick Replies
                    </div>
                    {faqs.length === 0 ? (
                      <div style={{ padding: 16, fontSize: 12, color: MUTED, textAlign: 'center' }}>
                        No quick replies yet. Add some in Settings → Quick Replies.
                      </div>
                    ) : faqs.map(faq => (
                      <div key={faq.id} onClick={() => insertFaqAnswer(faq)}
                        style={{ padding: '10px 14px', borderBottom: `1px solid ${BORDER}`, cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = HOVER_BG}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: TEXT }}>{faq.question}</div>
                        <div style={{ fontSize: 11, color: MUTED, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{faq.answer}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setQuickOpen(p => !p)} title="Insert a quick reply"
                  style={{ background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 10, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                  <i className="ti ti-message-2-bolt" style={{ fontSize: 16, color: TEXT }} />
                </button>
                <input ref={inputRef} value={newMsg} onChange={e => setNewMsg(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  placeholder="Type a message..."
                  style={{ flex: 1, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px', fontSize: 12, outline: 'none', fontFamily: 'inherit', background: CARD2, color: TEXT }} />
                <button onClick={sendMessage}
                  style={{ background: ACCENT, border: 'none', borderRadius: 10, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                  <i className="ti ti-send" style={{ fontSize: 15, color: ACCENT_TEXT }} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}