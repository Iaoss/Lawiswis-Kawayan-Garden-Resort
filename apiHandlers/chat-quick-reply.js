// /api/chat-quick-reply
//
// Automatic answers in the guest chat. The built-in topics (room rates,
// cottage rates, tour rates, times, booking, cancellation, location) are
// answered from the live rate card and room list; staff can add more
// questions in Settings → Quick Replies.
//
//   GET  → { replies: [{ id, question }] }   (the buttons to show)
//   POST { conversationId, replyId }          (Authorization: Bearer <guest ID token>)
//        Adds the guest's question and the answer to their chat.
//   POST { conversationId, text }
//        The guest typed a message (already saved by the chat). If it asks
//        about a known topic, the answer is added right away; otherwise a
//        short "staff will reply" note is added (at most every 30 minutes).
// Answers are marked sender: 'bot' so staff can tell they were automatic.
//
// It runs on the server because guests can't read the staff quick-reply list
// or post a resort message under the Firestore rules.

import { getAuth } from 'firebase-admin/auth';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb, FieldValue } from '../lib/firebaseAdmin';
import { DEFAULT_QUICK_REPLIES, sortQuickReplies } from '../src/admin/components/quickReplyDefaults';
import { AUTO_TOPICS, HANDOFF_MESSAGE, buildAutoAnswer, detectTopic, isAutoTopic } from '../src/lib/chatAutoReply';

const MAX_AUTO_REPLIES_PER_CHAT = 40;

const HANDOFF_EVERY_MS = 30 * 60000;
// The old fixed defaults are covered by the live topics now.
const COVERED_DEFAULTS = new Set(DEFAULT_QUICK_REPLIES.map(item => item.id));

// Staff-written questions from Settings → Quick Replies.
async function loadStaffReplies() {
  const snapshot = await adminDb.collection('faqs').get();
  return sortQuickReplies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    .filter(item => !COVERED_DEFAULTS.has(item.id)
      && typeof item.question === 'string' && item.question.trim()
      && typeof item.answer === 'string' && item.answer.trim());
}

async function loadPolicy() {
  try {
    const snap = await adminDb.doc('settings/cancellationPolicy').get();
    return snap.exists ? snap.data() : undefined;
  } catch {
    return undefined;
  }
}

async function loadRooms() {
  const snapshot = await adminDb.collection('rooms').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// { question, answer } for a button id, or null.
async function answerFor(replyId) {
  if (isAutoTopic(replyId)) {
    const topic = AUTO_TOPICS.find(item => item.id === replyId);
    const rooms = replyId === 'auto-room-rates' ? await loadRooms() : [];
    const policy = replyId === 'auto-cancellation' ? await loadPolicy() : undefined;
    return { question: topic.question, answer: buildAutoAnswer(replyId, { rooms, policy }) };
  }
  const reply = (await loadStaffReplies()).find(item => item.id === replyId);
  return reply ? { question: reply.question.trim(), answer: reply.answer.trim() } : null;
}

export default async function handler(req, res) {
  if (!adminDb) return res.status(503).json({ error: 'Chat is temporarily unavailable.' });

  if (req.method === 'GET') {
    try {
      const staffReplies = await loadStaffReplies();
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      return res.status(200).json({
        replies: [...AUTO_TOPICS, ...staffReplies].map(item => ({ id: item.id, question: item.question.trim().slice(0, 60) })),
      });
    } catch (error) {
      console.error('Quick replies could not be loaded:', error);
      return res.status(500).json({ error: 'Quick replies could not be loaded.' });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  let uid = '';
  try {
    uid = token ? (await getAuth().verifyIdToken(token)).uid : '';
  } catch {
    uid = '';
  }
  if (!uid) return res.status(401).json({ error: 'Please refresh the chat and try again.' });

  const { conversationId, replyId, text } = req.body || {};
  const typed = typeof text === 'string';
  if (typeof conversationId !== 'string' || !/^[A-Za-z0-9]{10,40}$/.test(conversationId)
    || (!typed && (typeof replyId !== 'string' || replyId.length > 60))
    || (typed && (!text.trim() || text.length > 600))) {
    return res.status(400).json({ error: 'Choose a question.' });
  }

  try {
    const conversationRef = adminDb.collection('conversations').doc(conversationId);

    // A typed message: answer it if we know the topic.
    if (typed) {
      const conversation = await conversationRef.get();
      if (!conversation.exists || conversation.data().guestUid !== uid) {
        return res.status(403).json({ error: 'This chat could not be found.' });
      }
      const data = conversation.data();
      if (Number(data.autoReplyCount || 0) >= MAX_AUTO_REPLIES_PER_CHAT) return res.status(200).json({ answered: false });
      const topicId = detectTopic(text);
      const rooms = topicId === 'auto-room-rates' ? await loadRooms() : [];
      const policy = topicId === 'auto-cancellation' ? await loadPolicy() : undefined;
      const answer = topicId ? buildAutoAnswer(topicId, { rooms, policy }) : '';
      const lastHandoff = data.lastHandoffAt?.toMillis ? data.lastHandoffAt.toMillis() : 0;
      if (!answer && Date.now() - lastHandoff < HANDOFF_EVERY_MS) return res.status(200).json({ answered: false });
      const reply = answer || HANDOFF_MESSAGE;
      await conversationRef.collection('messages').add({
        sender: 'bot',
        text: reply,
        timestamp: Timestamp.fromMillis(Date.now() + 1),
        ...(topicId ? { quickReplyId: topicId } : { handoff: true }),
      });
      await conversationRef.update({
        lastMessage: reply.slice(0, 2000),
        lastMessageAt: FieldValue.serverTimestamp(),
        autoReplyCount: FieldValue.increment(1),
        ...(answer ? {} : { lastHandoffAt: FieldValue.serverTimestamp() }),
      });
      return res.status(200).json({ answered: Boolean(answer), topic: topicId || null });
    }

    const reply = await answerFor(replyId);
    if (!reply || !reply.answer) return res.status(404).json({ error: 'That question is no longer available.' });

    const conversation = await conversationRef.get();
    if (!conversation.exists || conversation.data().guestUid !== uid) {
      return res.status(403).json({ error: 'This chat could not be found.' });
    }
    if (Number(conversation.data().autoReplyCount || 0) >= MAX_AUTO_REPLIES_PER_CHAT) {
      return res.status(429).json({ error: 'Please type your question and our staff will reply.' });
    }

    // Fixed times, one millisecond apart, so the answer always follows the question.
    const now = Date.now();
    const messages = conversationRef.collection('messages');
    const batch = adminDb.batch();
    batch.set(messages.doc(), {
      sender: 'guest',
      text: reply.question,
      timestamp: Timestamp.fromMillis(now),
      quickReplyId: replyId,
    });
    batch.set(messages.doc(), {
      sender: 'bot',
      text: reply.answer,
      timestamp: Timestamp.fromMillis(now + 1),
      quickReplyId: replyId,
    });
    batch.update(conversationRef, {
      lastMessage: reply.answer.slice(0, 2000),
      lastMessageAt: FieldValue.serverTimestamp(),
      autoReplyCount: FieldValue.increment(1),
    });
    await batch.commit();
    return res.status(200).json({ sent: true });
  } catch (error) {
    console.error('Quick reply failed:', error);
    return res.status(500).json({ error: 'The answer could not be sent. Please type your question instead.' });
  }
}
