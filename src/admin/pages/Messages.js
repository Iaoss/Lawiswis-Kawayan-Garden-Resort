import React, { useState, useEffect, useRef } from 'react';
import { db } from '../../firebase/firebase';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, serverTimestamp, doc, updateDoc, setDoc, getDocs, deleteDoc
} from 'firebase/firestore';
import PageLayout from '../components/PageLayout';

const ACCENT = '#9cb56f';
const DARK   = '#1A312C';
const MUTED  = '#9ca3af';

const DEFAULT_FAQS = [
  { id: 'f1', category: 'Check-in/out',   question: 'What time is check-in?',          answer: 'Check-in is at 2:00 PM and check-out is at 12:00 NN. Early check-in may be arranged upon request and availability.' },
  { id: 'f2', category: 'Check-in/out',   question: 'What time is check-out?',         answer: 'Check-out is at 12:00 NN. Late check-out may be arranged upon request, subject to availability.' },
  { id: 'f3', category: 'Booking',        question: 'How do I book a room?',           answer: 'You can book directly through our website at lawiswiskawayanresort.com, or contact us at 0917 811 2332 / info@lawiswiskawayanresort.com.' },
  { id: 'f4', category: 'Booking',        question: 'Is my reservation confirmed?',    answer: 'Your reservation is confirmed once you receive a confirmation email from us. Please keep your booking reference number for your records.' },
  { id: 'f5', category: 'Payment',        question: 'What payment methods do you accept?', answer: 'We accept Cash, GCash (0917 811 2332), Bank Transfer (BDO, BPI, Metrobank, UnionBank), and Credit/Debit Cards.' },
  { id: 'f6', category: 'Payment',        question: 'Do you require a deposit?',       answer: 'Yes, a 50% deposit is required to secure your reservation. The remaining balance can be paid upon check-in.' },
  { id: 'f7', category: 'Cancellation',   question: 'What is your cancellation policy?', answer: 'Cancellations more than 7 days before check-in: 20% fee. 4–7 days before: 50% fee. 3 days or less / same day: 100% fee.' },
  { id: 'f8', category: 'Amenities',      question: 'Do you have a swimming pool?',   answer: 'Yes! We have adult and kiddie pools with bamboo poolside cabanas, open for guests throughout their stay.' },
  { id: 'f9', category: 'Amenities',      question: 'Is WiFi available?',              answer: 'Yes, complimentary high-speed WiFi is available throughout the resort.' },
  { id: 'f10', category: 'Amenities',     question: 'Do you have a restaurant?',      answer: 'Yes, we have dining halls offering Filipino and international cuisine. We also have function halls for events.' },
  { id: 'f11', category: 'Location',      question: 'Where are you located?',         answer: 'We are located at 402 Brgy. Buguion, Calumpit, Bulacan, Philippines. Near major roads from Metro Manila.' },
  { id: 'f12', category: 'Location',      question: 'How do I get there?',            answer: 'From Manila: Take NLEX → Pulilan Exit → follow signs to Calumpit. We are about 1.5–2 hours from Metro Manila. We can arrange transport upon request.' },
  { id: 'f13', category: 'Rooms',         question: 'What types of rooms do you have?', answer: 'We offer Regular Rooms, Couple Rooms, Family Rooms (4–6 pax), Junior Suites, Family Suites, Presidential Suites (8–12 pax), and our Main Villa for up to 25 guests.' },
  { id: 'f14', category: 'Rooms',         question: 'Is breakfast included?',         answer: 'Breakfast is not automatically included but can be arranged. Please let us know your preference when booking.' },
  { id: 'f15', category: 'General',       question: 'Do you allow pets?',             answer: 'We appreciate your love for pets, however we do not allow pets inside the resort premises to ensure comfort for all guests.' },
  { id: 'f16', category: 'General',       question: 'Is there parking available?',    answer: 'Yes, we have free on-site parking available for all guests throughout their stay.' },
  { id: 'f17', category: 'General',       question: 'Thank you message',              answer: "Thank you for reaching out to Lawiswis Kawayan Garden Resort! 🌿 We're happy to assist you. Is there anything else you'd like to know?" },
  { id: 'f18', category: 'General',       question: 'Greeting message',               answer: "Hello! Welcome to Lawiswis Kawayan Garden Resort! 🎋 How can we assist you today? Feel free to ask us anything about your stay." },
];

const CATEGORIES = ['All', 'Check-in/out', 'Booking', 'Payment', 'Cancellation', 'Amenities', 'Location', 'Rooms', 'General'];

export default function Messages() {
  const [conversations, setConversations]   = useState([]);
  const [selected,      setSelected]        = useState(null);
  const [messages,      setMessages]        = useState([]);
  const [newMsg,        setNewMsg]          = useState('');
  const [search,        setSearch]          = useState('');
  const [showFAQ,       setShowFAQ]         = useState(false);
  const [faqCategory,   setFaqCategory]     = useState('All');
  const [faqSearch,     setFaqSearch]       = useState('');
  const [faqs,          setFaqs]            = useState(DEFAULT_FAQS);
  const [showAddFAQ,    setShowAddFAQ]      = useState(false);
  const [newFAQ,        setNewFAQ]          = useState({ category: 'General', question: '', answer: '' });
  const [editFAQ,       setEditFAQ]         = useState(null);
  const bottomRef = useRef(null);

  // Load custom FAQs from Firestore
  useEffect(() => {
    const loadFAQs = async () => {
      try {
        const snap = await getDocs(collection(db, 'faqs'));
        if (snap.docs.length > 0) {
          const custom = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setFaqs([...DEFAULT_FAQS, ...custom]);
        }
      } catch (e) {}
    };
    loadFAQs();
  }, []);

  // Listen for conversations
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'conversations'), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (b.lastMessageAt?.seconds || 0) - (a.lastMessageAt?.seconds || 0));
      setConversations(data);
    });
    return () => unsub();
  }, []);

  // Listen for messages of selected conversation
  useEffect(() => {
    if (!selected) return;
    const q = query(collection(db, 'conversations', selected.id, 'messages'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [selected]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const openConversation = async (conv) => {
    setSelected(conv);
    setShowFAQ(false);
    if (conv.unread) {
      await updateDoc(doc(db, 'conversations', conv.id), { unread: false });
    }
  };

  const sendMessage = async (text) => {
    const msg = text || newMsg;
    if (!msg.trim() || !selected) return;
    await addDoc(collection(db, 'conversations', selected.id, 'messages'), {
      sender: 'staff',
      text: msg,
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'conversations', selected.id), {
      lastMessage: msg,
      lastMessageAt: serverTimestamp(),
    });
    setNewMsg('');
    setShowFAQ(false);
  };

  const handleFAQSelect = (faq) => {
    setNewMsg(faq.answer);
    setShowFAQ(false);
  };

  const handleSendFAQ = (faq) => {
    sendMessage(faq.answer);
  };

  const handleSaveFAQ = async () => {
    if (!newFAQ.question || !newFAQ.answer) return;
    if (editFAQ) {
      // Update existing
      const updated = faqs.map(f => f.id === editFAQ.id ? { ...f, ...newFAQ } : f);
      setFaqs(updated);
      try { await setDoc(doc(db, 'faqs', editFAQ.id), newFAQ); } catch (e) {}
    } else {
      const ref = await addDoc(collection(db, 'faqs'), newFAQ);
      setFaqs(prev => [...prev, { id: ref.id, ...newFAQ }]);
    }
    setNewFAQ({ category: 'General', question: '', answer: '' });
    setShowAddFAQ(false);
    setEditFAQ(null);
  };

  const handleDeleteFAQ = async (faq) => {
    if (!window.confirm('Delete this quick reply?')) return;
    setFaqs(prev => prev.filter(f => f.id !== faq.id));
    try { await deleteDoc(doc(db, 'faqs', faq.id)); } catch (e) {}
  };

  const filteredFAQs = faqs.filter(f => {
    const matchCat = faqCategory === 'All' || f.category === faqCategory;
    const matchSearch = !faqSearch ||
      f.question.toLowerCase().includes(faqSearch.toLowerCase()) ||
      f.answer.toLowerCase().includes(faqSearch.toLowerCase());
    return matchCat && matchSearch;
  });

  const filteredConvs = conversations.filter(c =>
    c.guestName?.toLowerCase().includes(search.toLowerCase())
  );

  const inp = {
    background: '#f9fafb', border: '1px solid #e5e7eb',
    borderRadius: '10px', padding: '9px 12px',
    fontSize: '12px', fontFamily: "'Poppins', sans-serif",
    color: '#111', outline: 'none', width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <PageLayout>
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '16px', height: 'calc(100vh - 120px)', fontFamily: "'Poppins', sans-serif" }}>

        {/* ── Conversation List ── */}
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ fontWeight: '700', fontSize: '14px', color: '#111', marginBottom: '10px' }}>Messages</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f9fafb', borderRadius: '10px', padding: '8px 12px', border: '1px solid #e5e7eb' }}>
              <i className="ti ti-search" style={{ fontSize: '14px', color: MUTED }} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search guest..."
                style={{ border: 'none', outline: 'none', fontSize: '12px', background: 'transparent', fontFamily: "'Poppins', sans-serif", width: '100%', color: '#111' }} />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredConvs.length === 0 ? (
              <div style={{ textAlign: 'center', color: MUTED, fontSize: '12px', padding: '30px' }}>No conversations yet.</div>
            ) : (
              filteredConvs.map(c => (
                <div key={c.id} onClick={() => openConversation(c)}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', borderBottom: '1px solid #f9fafb', cursor: 'pointer', background: selected?.id === c.id ? '#f0fdf4' : 'transparent', borderLeft: selected?.id === c.id ? `3px solid ${ACCENT}` : '3px solid transparent', transition: 'all 0.15s' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ACCENT, fontWeight: '700', fontSize: '14px', flexShrink: 0 }}>
                    {(c.guestName || 'G')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: '600', fontSize: '12px', color: '#111' }}>{c.guestName}</span>
                      <span style={{ fontSize: '10px', color: MUTED }}>
                        {c.lastMessageAt?.seconds ? new Date(c.lastMessageAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '2px' }}>
                      {c.lastMessage || 'No messages yet'}
                    </div>
                  </div>
                  {c.unread && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />}
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Chat Window ── */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: MUTED }}>
              <div style={{ fontSize: '48px', marginBottom: '14px' }}>💬</div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Select a conversation</div>
              <div style={{ fontSize: '12px' }}>Choose a guest from the list to start chatting</div>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ACCENT, fontWeight: '700', fontSize: '13px' }}>
                    {(selected.guestName || 'G')[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '13px', color: '#111' }}>{selected.guestName}</div>
                    <div style={{ fontSize: '11px', color: MUTED }}>Room {selected.roomNumber || '—'} · Guest</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => { setShowFAQ(!showFAQ); setShowAddFAQ(false); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: showFAQ ? DARK : '#f0fdf4', color: showFAQ ? ACCENT : '#428475', border: `1px solid ${showFAQ ? DARK : '#86efac'}`, borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                    <i className="ti ti-bolt" style={{ fontSize: '14px' }} />
                    Quick Replies
                  </button>
                </div>
              </div>

              {/* FAQ Panel */}
              {showFAQ && (
                <div style={{ borderBottom: '1px solid #f3f4f6', background: '#fafffe' }}>
                  {/* FAQ Header */}
                  <div style={{ padding: '12px 16px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: '600', fontSize: '13px', color: '#111', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <i className="ti ti-bolt" style={{ color: '#428475', fontSize: '15px' }} />
                      Quick Replies & FAQ
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => { setShowAddFAQ(!showAddFAQ); setEditFAQ(null); setNewFAQ({ category: 'General', question: '', answer: '' }); }}
                        style={{ padding: '5px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', color: '#428475', fontFamily: "'Poppins', sans-serif" }}>
                        + Add FAQ
                      </button>
                      <button onClick={() => setShowFAQ(false)}
                        style={{ padding: '5px 10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '11px', cursor: 'pointer', color: MUTED, fontFamily: "'Poppins', sans-serif" }}>
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Add/Edit FAQ Form */}
                  {showAddFAQ && (
                    <div style={{ margin: '0 14px 10px', background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '14px' }}>
                      <div style={{ fontWeight: '600', fontSize: '12px', color: '#111', marginBottom: '10px' }}>{editFAQ ? 'Edit Quick Reply' : 'Add New Quick Reply'}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '8px', marginBottom: '8px' }}>
                        <div>
                          <label style={{ fontSize: '10px', color: MUTED, display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Category</label>
                          <select value={newFAQ.category} onChange={e => setNewFAQ({ ...newFAQ, category: e.target.value })}
                            style={{ ...inp, fontSize: '11px' }}>
                            {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: '10px', color: MUTED, display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Question / Label</label>
                          <input value={newFAQ.question} onChange={e => setNewFAQ({ ...newFAQ, question: e.target.value })}
                            placeholder="e.g. What are your rates?" style={{ ...inp, fontSize: '11px' }} />
                        </div>
                      </div>
                      <div style={{ marginBottom: '10px' }}>
                        <label style={{ fontSize: '10px', color: MUTED, display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Reply Message</label>
                        <textarea value={newFAQ.answer} onChange={e => setNewFAQ({ ...newFAQ, answer: e.target.value })}
                          placeholder="Type the reply that will be sent to the guest..."
                          rows={3}
                          style={{ ...inp, resize: 'vertical', fontSize: '11px' }} />
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={handleSaveFAQ}
                          style={{ padding: '7px 16px', background: DARK, color: ACCENT, border: 'none', borderRadius: '8px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                          {editFAQ ? 'Update' : 'Save FAQ'}
                        </button>
                        <button onClick={() => { setShowAddFAQ(false); setEditFAQ(null); }}
                          style={{ padding: '7px 16px', background: '#f9fafb', color: MUTED, border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '11px', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Search FAQs */}
                  <div style={{ padding: '0 14px 8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '6px 10px' }}>
                      <i className="ti ti-search" style={{ fontSize: '12px', color: MUTED }} />
                      <input value={faqSearch} onChange={e => setFaqSearch(e.target.value)}
                        placeholder="Search quick replies..."
                        style={{ border: 'none', outline: 'none', fontSize: '11px', background: 'transparent', fontFamily: "'Poppins', sans-serif", width: '100%', color: '#111' }} />
                    </div>
                  </div>

                  {/* Category Tabs */}
                  <div style={{ padding: '0 14px 8px', display: 'flex', gap: '6px', overflowX: 'auto', flexWrap: 'nowrap' }}>
                    {CATEGORIES.map(cat => (
                      <button key={cat} onClick={() => setFaqCategory(cat)}
                        style={{ padding: '4px 12px', borderRadius: '20px', border: faqCategory === cat ? 'none' : '1px solid #e5e7eb', background: faqCategory === cat ? DARK : '#fff', color: faqCategory === cat ? ACCENT : '#6b7280', fontSize: '10px', fontWeight: faqCategory === cat ? '600' : '400', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'Poppins', sans-serif" }}>
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* FAQ Cards */}
                  <div style={{ maxHeight: '260px', overflowY: 'auto', padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {filteredFAQs.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '20px', color: MUTED, fontSize: '12px' }}>No quick replies found.</div>
                    ) : (
                      filteredFAQs.map(faq => (
                        <div key={faq.id}
                          style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e5e7eb', padding: '10px 12px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                              <span style={{ background: '#f0fdf4', color: '#428475', borderRadius: '20px', padding: '1px 8px', fontSize: '9px', fontWeight: '600' }}>
                                {faq.category}
                              </span>
                              <span style={{ fontSize: '11px', fontWeight: '600', color: '#111' }}>{faq.question}</span>
                            </div>
                            <p style={{ fontSize: '11px', color: '#6b7280', margin: 0, lineHeight: '1.5', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                              {faq.answer}
                            </p>
                          </div>
                          <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
                            <button onClick={() => handleFAQSelect(faq)}
                              title="Edit in input"
                              style={{ padding: '5px 10px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '7px', fontSize: '10px', fontWeight: '600', cursor: 'pointer', color: '#428475', fontFamily: "'Poppins', sans-serif" }}>
                              ✏️ Edit
                            </button>
                            <button onClick={() => handleSendFAQ(faq)}
                              title="Send immediately"
                              style={{ padding: '5px 10px', background: DARK, border: 'none', borderRadius: '7px', fontSize: '10px', fontWeight: '600', cursor: 'pointer', color: ACCENT, fontFamily: "'Poppins', sans-serif" }}>
                              Send ➤
                            </button>
                            {!DEFAULT_FAQS.find(d => d.id === faq.id) && (
                              <button onClick={() => handleDeleteFAQ(faq)}
                                title="Delete"
                                style={{ padding: '5px 8px', background: '#fff', border: '1px solid #fee2e2', borderRadius: '7px', fontSize: '10px', cursor: 'pointer', color: '#ef4444', fontFamily: "'Poppins', sans-serif" }}>
                                🗑
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '18px', display: 'flex', flexDirection: 'column', gap: '10px', background: '#fafafa' }}>
                {messages.length === 0 && (
                  <div style={{ textAlign: 'center', color: MUTED, fontSize: '12px', padding: '30px' }}>
                    No messages yet. Say hello! 👋
                  </div>
                )}
                {messages.map(m => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: m.sender === 'staff' ? 'flex-end' : 'flex-start', gap: '8px', alignItems: 'flex-end' }}>
                    {m.sender !== 'staff' && (
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', flexShrink: 0 }}>
                        {(selected.guestName || 'G')[0].toUpperCase()}
                      </div>
                    )}
                    <div style={{ maxWidth: '65%' }}>
                      <div style={{ background: m.sender === 'staff' ? DARK : '#fff', color: m.sender === 'staff' ? ACCENT : '#111', border: m.sender === 'staff' ? 'none' : '1px solid #e5e7eb', borderRadius: m.sender === 'staff' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', padding: '10px 14px', fontSize: '13px', lineHeight: '1.5' }}>
                        {m.text}
                      </div>
                      <div style={{ fontSize: '10px', color: MUTED, marginTop: '4px', textAlign: m.sender === 'staff' ? 'right' : 'left' }}>
                        {m.createdAt?.seconds ? new Date(m.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sending...'}
                      </div>
                    </div>
                    {m.sender === 'staff' && (
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', color: DARK, fontWeight: '700', fontSize: '11px', flexShrink: 0 }}>
                        S
                      </div>
                    )}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Suggested Quick Replies above input */}
              {!showFAQ && (
                <div style={{ padding: '6px 16px 0', display: 'flex', gap: '6px', overflowX: 'auto', borderTop: '1px solid #f3f4f6' }}>
                  {[
                    { label: '👋 Greeting',     faq: faqs.find(f => f.id === 'f18') },
                    { label: '🕐 Check-in',     faq: faqs.find(f => f.id === 'f1') },
                    { label: '💳 Payment',      faq: faqs.find(f => f.id === 'f5') },
                    { label: '🚫 Cancellation', faq: faqs.find(f => f.id === 'f7') },
                    { label: '📍 Location',     faq: faqs.find(f => f.id === 'f11') },
                    { label: '🙏 Thank you',    faq: faqs.find(f => f.id === 'f17') },
                  ].filter(s => s.faq).map(s => (
                    <button key={s.label}
                      onClick={() => handleFAQSelect(s.faq)}
                      style={{ padding: '5px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '20px', fontSize: '11px', fontWeight: '500', cursor: 'pointer', whiteSpace: 'nowrap', color: '#428475', fontFamily: "'Poppins', sans-serif", flexShrink: 0 }}>
                      {s.label}
                    </button>
                  ))}
                  <button onClick={() => setShowFAQ(true)}
                    style={{ padding: '5px 12px', background: DARK, border: 'none', borderRadius: '20px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap', color: ACCENT, fontFamily: "'Poppins', sans-serif", flexShrink: 0 }}>
                    ⚡ More
                  </button>
                </div>
              )}

              {/* Input */}
              <div style={{ padding: '12px 16px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: '10px', background: '#fff' }}>
                <input value={newMsg} onChange={e => setNewMsg(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder="Type a message... or use Quick Replies above"
                  style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: '10px', padding: '11px 16px', fontSize: '13px', outline: 'none', fontFamily: "'Poppins', sans-serif", color: '#111', background: '#f9fafb' }} />
                <button onClick={() => sendMessage()}
                  style={{ background: DARK, border: 'none', borderRadius: '10px', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                  <span style={{ color: ACCENT, fontSize: '18px' }}>➤</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </PageLayout>
  );
}