// api/email-sync.js
//
// Connects to Gmail over IMAP, copies the latest messages from Inbox and Sent
// into the Firestore `emails` collection, then disconnects.
// Only NEW messages are downloaded in full, so repeat syncs are fast.
//
// Usage:  POST /api/email-sync   (Authorization: Bearer <Firebase ID token>)
//
// Env vars (same ones email.js already uses):
//   GMAIL_USER, GMAIL_APP_PASSWORD
// IMAP must be enabled in Gmail: Settings → Forwarding and POP/IMAP.

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { adminDb, FieldValue } from '../src/lib/firebaseAdmin';
import { verifyStaff } from '../src/lib/verifyStaff';

const PER_FOLDER = 25;        // newest messages checked per folder per sync
const MAX_HTML = 400000;      // keep each Firestore doc safely under 1 MB
const MAX_TEXT = 100000;

const addrList = (field) =>
  [].concat(field || []).flatMap((f) => f.value || []).map((a) => a.address).filter(Boolean);

async function syncFolder(client, path, folder) {
  const lock = await client.getMailboxLock(path);
  let added = 0;
  try {
    const total = client.mailbox.exists;
    if (!total) return 0;

    // Step 1: cheap fetch of UIDs + flags for the newest messages.
    const headers = [];
    for await (const m of client.fetch(`${Math.max(1, total - PER_FOLDER + 1)}:*`, { uid: true, flags: true })) {
      headers.push({ uid: m.uid, seen: m.flags.has('\\Seen') });
    }
    if (!headers.length) return 0;

    const col = adminDb.collection('emails');
    const idOf = (uid) => `${folder}_${uid}`;
    const snaps = await adminDb.getAll(...headers.map((h) => col.doc(idOf(h.uid))));
    const existing = new Map(snaps.filter((s) => s.exists).map((s) => [s.id, s.data()]));

    // Step 2: if something was read in Gmail itself, reflect that here.
    const batch = adminDb.batch();
    let updates = 0;
    headers.forEach((h) => {
      const doc = existing.get(idOf(h.uid));
      if (doc && doc.read === false && h.seen) {
        batch.update(col.doc(idOf(h.uid)), { read: true });
        updates++;
      }
    });
    if (updates) await batch.commit();

    // Step 3: download full source only for messages we don't have yet.
    const fresh = headers.filter((h) => !existing.has(idOf(h.uid))).map((h) => h.uid);
    if (!fresh.length) return 0;

    for await (const m of client.fetch(fresh.join(','), { uid: true, source: true, flags: true }, { uid: true })) {
      const p = await simpleParser(m.source);
      const from = p.from?.value?.[0] || {};
      const text = (p.text || '').slice(0, MAX_TEXT);

      await col.doc(idOf(m.uid)).set({
        folder,
        uid: m.uid,
        messageId: p.messageId || null,
        inReplyTo: p.inReplyTo || null,
        references: [].concat(p.references || []),
        from: from.address || '',
        fromName: from.name || '',
        to: addrList(p.to),
        cc: addrList(p.cc),
        subject: p.subject || '(no subject)',
        text,
        html: typeof p.html === 'string' ? p.html.slice(0, MAX_HTML) : '',
        snippet: text.replace(/\s+/g, ' ').trim().slice(0, 140),
        date: p.date || new Date(),
        read: folder === 'sent' ? true : m.flags.has('\\Seen'),
        attachments: (p.attachments || []).map((a) => ({
          filename: a.filename || 'attachment',
          size: a.size || 0,
          contentType: a.contentType || '',
        })),
        syncedAt: FieldValue.serverTimestamp(),
      });
      added++;
    }
  } finally {
    lock.release();
  }
  return added;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const staff = await verifyStaff(req);
  if (!staff) return res.status(401).json({ error: 'Not authorized.' });

  if (!adminDb) {
    return res.status(500).json({
      error: 'Firebase Admin is not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in Vercel.',
    });
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return res.status(500).json({
      error: 'Gmail IMAP credentials are missing. Set GMAIL_USER and GMAIL_APP_PASSWORD in Vercel.',
    });
  }

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    logger: false,
  });

  try {
    await client.connect();

    // Find the Sent folder by its role, so it works whatever Gmail's language.
    const boxes = await client.list();
    const sentPath = boxes.find((b) => b.specialUse === '\\Sent' || b.path?.toLowerCase().endsWith('/sent'))?.path || '[Gmail]/Sent Mail';

    if (!sentPath) {
      return res.status(500).json({ error: 'No Gmail Sent folder was found. Verify the Gmail account and IMAP access.' });
    }

    const inbox = await syncFolder(client, 'INBOX', 'inbox');
    const sent = await syncFolder(client, sentPath, 'sent');

    return res.status(200).json({ added: inbox + sent });
  } catch (err) {
    console.error('email-sync error:', err);
    return res.status(500).json({
      error: 'Could not sync Gmail. Check IMAP is enabled, the App Password is valid, and the Gmail account can access the Inbox/Sent folders.',
    });
  } finally {
    try { await client.logout(); } catch {}
  }
}
