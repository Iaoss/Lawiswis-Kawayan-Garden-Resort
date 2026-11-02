// /api/chat-quick-reply
//
// Quick-reply buttons in the guest chat ("Check-in time", "Room rates", …).
// The replies are the ones staff set in Settings → Quick Replies.
//
//   GET  → { replies: [{ id, question }] }   (the buttons to show)
//   POST { conversationId, replyId }          (Authorization: Bearer <guest ID token>)
//        Adds the guest's question and the saved answer to their chat.
//        The answer is marked sender: 'bot' so staff can tell it was automatic.
//
// It runs on the server because guests can't read the staff quick-reply list
// or post a resort message under the Firestore rules.

import { getAuth } from 'firebase-admin/auth';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb, FieldValue } from '../lib/firebaseAdmin';
import { DEFAULT_QUICK_REPLIES, sortQuickReplies } from '../src/admin/components/quickReplyDefaults';

const MAX_AUTO_REPLIES_PER_CHAT = 40;

async function loadReplies() {
  const snapshot = await adminDb.collection('faqs').get();
  const saved = sortQuickReplies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    .filter(item => typeof item.question === 'string' && item.question.trim()
      && typeof item.answer === 'string' && item.answer.trim());
  return saved.length ? saved : DEFAULT_QUICK_REPLIES;
}

export default async function handler(req, res) {
  if (!adminDb) return res.status(503).json({ error: 'Chat is temporarily unavailable.' });

  if (req.method === 'GET') {
    try {
      const replies = await loadReplies();
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      return res.status(200).json({ replies: replies.map(item => ({ id: item.id, question: item.question.trim().slice(0, 60) })) });
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

  const { conversationId, replyId } = req.body || {};
  if (typeof conversationId !== 'string' || !/^[A-Za-z0-9]{10,40}$/.test(conversationId) || typeof replyId !== 'string' || replyId.length > 60) {
    return res.status(400).json({ error: 'Choose a question.' });
  }

  try {
    const reply = (await loadReplies()).find(item => item.id === replyId);
    if (!reply) return res.status(404).json({ error: 'That question is no longer available.' });

    const conversationRef = adminDb.collection('conversations').doc(conversationId);
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
      text: reply.question.trim(),
      timestamp: Timestamp.fromMillis(now),
      quickReplyId: reply.id,
    });
    batch.set(messages.doc(), {
      sender: 'bot',
      text: reply.answer.trim(),
      timestamp: Timestamp.fromMillis(now + 1),
      quickReplyId: reply.id,
    });
    batch.update(conversationRef, {
      lastMessage: reply.answer.trim().slice(0, 2000),
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
