import React, { useState, useEffect, useRef } from 'react';
import { db } from '../../firebase/firebase';
import { collection, addDoc, query, orderBy, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { NAME_ALLOWED_CHARACTERS, NAME_PATTERN, joinGuestName, splitGuestName } from '../../lib/nameValidation';
import { ensureGuestAuth, guestAuthErrorMessage } from '../../lib/guestAuth';

const ACCENT = '#4a7c59';
const DARK = '#1a3a1a';
const LIGHT = '#f9fafb';
const countWords = value => value.trim() ? value.trim().split(/\s+/).length : 0;
const limitWords = value => {
  const matches = [...value.matchAll(/\S+/g)];
  return matches.length <= 50 ? value : value.slice(0, matches[49].index + matches[49][0].length);
};

function ChatIcon({ size = 22 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z" /></svg>;
}
function SendIcon({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4 20-7Z" /><path d="M22 2 11 13" /></svg>;
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
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
  const [startingChat, setStartingChat] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const phoneInvalid = Boolean(guestPhone) && !/^09\d{9}$/.test(guestPhone);
  const [convId, setConvId] = useState(null);
  const [ownerUid, setOwnerUid] = useState(null);
  const [started, setStarted] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    let active = true;
    const restoreGuestSession = async () => {
    try {
      const user = await ensureGuestAuth();
      if (!active) return;
      setOwnerUid(user.uid);
      const profile = JSON.parse(localStorage.getItem('guest_profile') || 'null');
      if (profile && typeof profile === 'object') {
        const savedNames = typeof profile.guestName === 'string' ? splitGuestName(profile.guestName) : {};
        setFirstName(typeof profile.firstName === 'string' ? profile.firstName : savedNames.firstName || '');
        setLastName(typeof profile.lastName === 'string' ? profile.lastName : savedNames.lastName || '');
        if (typeof profile.phone === 'string') setGuestPhone(profile.phone.replace(/\D/g, '').slice(0, 11));
      }

      const saved = JSON.parse(localStorage.getItem('huapro_conv') || 'null');
      if (saved?.id) {
        const savedNames = typeof saved.name === 'string' ? splitGuestName(saved.name) : {};
        setFirstName(saved.firstName || savedNames.firstName || '');
        setLastName(saved.lastName || savedNames.lastName || '');
        setGuestPhone(String(saved.phone || '').replace(/\D/g, '').slice(0, 11));
        if (saved.ownerUid === user.uid && saved.sessionStarted === true) {
          setConvId(saved.id);
          setStarted(true);
        }
      }
    } catch (error) {
      console.error('Unable to restore saved guest chat details:', error);
      if (active) setChatError(guestAuthErrorMessage(error));
    }
    };
    restoreGuestSession();
    return () => { active = false; };
  }, []);

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

  useEffect(() => {
    const openHandler = () => setOpen(true);
    window.addEventListener('openGuestChat', openHandler);
    return () => window.removeEventListener('openGuestChat', openHandler);
  }, []);

  const startChat = async (e) => {
    e.preventDefault();
    setChatError('');
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    if (!validName(normalizedFirstName) || !validName(normalizedLastName) || phoneInvalid) {
      setNameError('Enter a valid first and last name using at least two letters each.');
      return;
    }
    setNameError('');
    setFirstName(normalizedFirstName);
    setLastName(normalizedLastName);
    const normalizedGuestName = joinGuestName(normalizedFirstName, normalizedLastName);
    const id = `guest_${Date.now()}`;
    setStarted(true);
    setStartingChat(true);
    setMessages([{
      id: `${id}_welcome`,
      sender: 'staff',
      text: `Hello ${normalizedGuestName}. Welcome to Lawiswis Kawayan Garden Resort. How can we help you today?`,
      createdAt: { seconds: Math.floor(Date.now() / 1000) },
    }]);
    try {
      const profile = JSON.parse(localStorage.getItem('guest_profile') || '{}');
      localStorage.setItem('guest_profile', JSON.stringify({
        ...profile,
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        guestName: normalizedGuestName,
        phone: guestPhone,
      }));
    } catch (error) {
      console.error('Unable to save guest chat details:', error);
      setChatError('Chat is open, but this browser could not save your guest details.');
    }
    try {
      const user = await ensureGuestAuth();
      setOwnerUid(user.uid);
      await setDoc(doc(db, 'conversations', id), {
        ownerUid: user.uid,
        sessionStarted: true,
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        phone: guestPhone,
        guestName: normalizedGuestName,
        guestPhone,
        lastMessage: '',
        lastMessageAt: serverTimestamp(),
        unread: true,
      });
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
    } catch (error) {
      console.error('Unable to start guest chat:', error);
      setConvId(null);
      setStarted(false);
      setMessages([]);
      setChatError(guestAuthErrorMessage(error));
    } finally {
      setStartingChat(false);
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
        ownerUid,
        createdAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'conversations', convId), {
        lastMessage: text,
        lastMessageAt: serverTimestamp(),
        unread: true,
        guestName,
        firstName,
        lastName,
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
    <div style={{ position: 'fixed', right: '20px', bottom: '20px', zIndex: open ? 1000 : 40, fontFamily: "'Poppins', sans-serif" }}>
      {open ? (
        <div style={{ width: '320px', maxWidth: 'calc(100vw - 32px)', height: 'min(620px, calc(100dvh - 44px))', maxHeight: 'calc(100dvh - 44px)', background: '#fff', borderRadius: '24px', boxShadow: '0 30px 80px rgba(0,0,0,0.18)', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: '280px' }}>
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

          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: LIGHT }}>
            {!started ? (
              <form onSubmit={startChat} style={{ padding: '18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ textAlign: 'center' }}>
                  <div style={{ color: ACCENT, marginBottom: '8px' }}><ChatIcon size={28} /></div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#111', marginBottom: '4px' }}>Start a conversation</div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>Enter your name to begin chatting.</div>
                </div>
                <label htmlFor="chat-first-name" style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>First Name *</label>
                <input
                  id="chat-first-name"
                  value={firstName}
                  maxLength={35}
                  autoComplete="given-name"
                  onChange={e => {
                    const value = e.target.value;
                    setFirstName(value.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ\s'-]/g, '').slice(0, 35));
                    setNameError(NAME_ALLOWED_CHARACTERS.test(value) ? '' : 'Numbers and special symbols are not allowed.');
                  }}
                  placeholder="Juan"
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '12px 14px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                />
                <label htmlFor="chat-last-name" style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last Name *</label>
                <input
                  id="chat-last-name"
                  value={lastName}
                  maxLength={35}
                  autoComplete="family-name"
                  onChange={e => {
                    const value = e.target.value;
                    setLastName(value.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ\s'-]/g, '').slice(0, 35));
                    setNameError(NAME_ALLOWED_CHARACTERS.test(value) ? '' : 'Numbers and special symbols are not allowed.');
                  }}
                  placeholder="Dela Cruz"
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '12px 14px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                />
                {nameError && <div role="alert" style={{ color: '#b91c1c', fontSize: '12px', marginTop: '-8px' }}>{nameError}</div>}
                {chatError && <div role="alert" style={{ color: '#b91c1c', fontSize: '12px' }}>{chatError}</div>}
                <label style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Phone (optional)</label>
                <input
                  value={guestPhone}
                  type="tel"
                  inputMode="numeric"
                  maxLength={11}
                  onKeyDown={e => {
                    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
                    if (!/\d/.test(e.key)) e.preventDefault();
                  }}
                  onPaste={e => {
                    const pasted = e.clipboardData.getData('text');
                    if (!/^\d+$/.test(pasted)) e.preventDefault();
                  }}
                  onChange={e => {
                    if (/^\d{0,11}$/.test(e.target.value)) setGuestPhone(e.target.value);
                  }}
                  placeholder="09XXXXXXXXX"
                  aria-invalid={phoneInvalid}
                  aria-describedby={phoneInvalid ? 'chat-phone-error' : undefined}
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '12px 14px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                />
                {phoneInvalid && <div id="chat-phone-error" role="alert" style={{ color: '#b91c1c', fontSize: '12px', marginTop: '-8px' }}>Please enter a valid 11-digit mobile number.</div>}
                <button type="submit" disabled={!validName(firstName) || !validName(lastName) || phoneInvalid || startingChat} style={{ width: '100%', background: DARK, color: '#d4f550', border: 'none', borderRadius: '14px', padding: '12px', fontSize: '14px', fontWeight: '700', cursor: !validName(firstName) || !validName(lastName) || phoneInvalid || startingChat ? 'not-allowed' : 'pointer', opacity: !validName(firstName) || !validName(lastName) || phoneInvalid || startingChat ? 0.6 : 1 }}>
                  {startingChat ? 'Connecting…' : 'Start Chatting'}
                </button>
              </form>
            ) : (
              <>
                <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {chatError && <div role="alert" style={{ color: '#991b1b', background: '#fef2f2', borderRadius: 8, padding: 10, fontSize: 11 }}>{chatError}</div>}
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
                      onChange={e => setNewMsg(limitWords(e.target.value))}
                      onKeyDown={e => e.key === 'Enter' && sendMessage()}
                      placeholder="Type your message..."
                      aria-describedby="chat-widget-word-count"
                      style={{ flex: 1, minWidth: 0, border: '1px solid #e5e7eb', borderRadius: '14px', padding: '12px 14px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                    />
                    <button onClick={sendMessage} disabled={!newMsg.trim() || sendingMessage} aria-label="Send message" style={{ width: '48px', height: '48px', borderRadius: '14px', border: 'none', background: DARK, color: '#d4f550', cursor: newMsg.trim() && !sendingMessage ? 'pointer' : 'not-allowed', display: 'grid', placeItems: 'center' }}>
                      <SendIcon />
                    </button>
                  </div>
                  <div id="chat-widget-word-count" aria-live="polite" style={{ color: '#6b7280', fontSize: '10px', marginTop: '6px' }}>{countWords(newMsg)} words · {50 - countWords(newMsg)} remaining</div>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} aria-label="Open chat"
          style={{ width: '60px', height: '60px', borderRadius: '50%', background: ACCENT, border: 'none', boxShadow: '0 20px 40px rgba(0,0,0,0.18)', color: '#fff', fontSize: '24px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ChatIcon size={26} />
        </button>
      )}
    </div>
  );
}
