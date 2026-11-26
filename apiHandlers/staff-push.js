import crypto from 'crypto';
import { adminDb, FieldValue } from '../lib/firebaseAdmin';
import { verifyStaff } from '../lib/verifyStaff';
import { getAuth } from 'firebase-admin/auth';
import { sendStaffPush } from '../lib/staffPush';

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const tokenId = token => crypto.createHash('sha256').update(token).digest('hex');
const validRoles = ['admin', 'receptionist', 'housekeeper'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!adminDb) return res.status(503).json({ error: 'Push notification service is unavailable.' });
  const { action, token, conversationId, messageId } = req.body || {};
  if (action === 'notify-chat') {
    const header = req.headers.authorization || '';
    const idToken = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!idToken || typeof conversationId !== 'string' || typeof messageId !== 'string') {
      return res.status(400).json({ error: 'Provide a signed-in guest chat message.' });
    }
    try {
      const guest = await getAuth().verifyIdToken(idToken);
      if (!guest.firebase?.sign_in_provider || guest.firebase.sign_in_provider !== 'anonymous') {
        return res.status(403).json({ error: 'Guest chat authentication is required.' });
      }
      const conversationRef = adminDb.collection('conversations').doc(conversationId);
      const messageRef = conversationRef.collection('messages').doc(messageId);
      const shouldNotify = await adminDb.runTransaction(async transaction => {
        const [conversationSnapshot, messageSnapshot] = await Promise.all([
          transaction.get(conversationRef),
          transaction.get(messageRef),
        ]);
        if (!conversationSnapshot.exists || !messageSnapshot.exists) return false;
        const conversation = conversationSnapshot.data() || {};
        const message = messageSnapshot.data() || {};
        const messageAt = typeof message.timestamp?.toMillis === 'function' ? message.timestamp.toMillis() : 0;
        if (conversation.guestUid !== guest.uid || message.sender !== 'guest'
          || !messageAt || Date.now() - messageAt > 180000
          || conversation.lastPushMessageId === messageId) return false;
        transaction.update(conversationRef, { lastPushMessageId: messageId });
        return true;
      });
      if (shouldNotify) {
        const message = await messageRef.get();
        await sendStaffPush({
          roles: ['admin', 'receptionist'],
          title: `New guest message · ${message.data()?.guestName || 'Guest'}`,
          body: String(message.data()?.text || '').slice(0, 120),
          url: '/admin/messages',
        });
      }
      return res.status(200).json({ ok: true });
    } catch (error) {
      if (['auth/argument-error', 'auth/id-token-expired', 'auth/invalid-id-token', 'auth/user-disabled', 'auth/user-not-found'].includes(error.code)) {
        return res.status(401).json({ error: 'Guest chat authentication has expired.' });
      }
      console.error('Guest chat push request failed:', error);
      return res.status(500).json({ error: 'Guest message notification could not be sent.' });
    }
  }

  const staff = await verifyStaff(req, { allowedRoles: validRoles });
  if (!staff) return res.status(401).json({ error: 'Please sign in with an active staff account.' });

  if (!['register', 'unregister'].includes(action) || typeof token !== 'string' || token.length < 20 || token.length > 4096) {
    return res.status(400).json({ error: 'Provide a valid push registration.' });
  }
  const ref = adminDb.collection('staffPushTokens').doc(`${staff.uid}_${tokenId(token)}`);
  try {
    if (action === 'register') {
      await ref.set({
        uid: staff.uid,
        role: staff.role,
        token,
        expiresAt: Date.now() + TOKEN_TTL_MS,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      await ref.delete();
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(`Staff push token ${action} failed:`, error);
    return res.status(500).json({ error: 'Push registration could not be updated.' });
  }
}
