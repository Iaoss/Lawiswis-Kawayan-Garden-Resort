// api/email-send.js
//
// Sends a new email, a reply, or a forward from the admin Email page.
// Gmail automatically files the sent message under "Sent Mail", and
// /api/email-sync picks it up from there.
//
// Usage:  POST /api/email-send   (Authorization: Bearer <Firebase ID token>)
//   body: { to, cc?, subject, text, inReplyTo?, references? }

import nodemailer from 'nodemailer';
import { verifyStaff } from '../src/lib/verifyStaff';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
});

const FROM_ADDRESS = `Lawiswis Kawayan Resort <${process.env.GMAIL_USER}>`;
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

const parseList = (v) =>
  String(v || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean);

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const staff = await verifyStaff(req);
  if (!staff) return res.status(401).json({ error: 'Not authorized.' });

  try {
    const { to, cc, subject, text, inReplyTo, references } = req.body || {};

    const toList = parseList(to);
    const ccList = parseList(cc);
    if (!toList.length) return res.status(400).json({ error: 'Add at least one recipient.' });
    if ([...toList, ...ccList].some((a) => !EMAIL_RE.test(a))) {
      return res.status(400).json({ error: 'One of the email addresses is not valid.' });
    }
    if (toList.length + ccList.length > 20) {
      return res.status(400).json({ error: 'Too many recipients (max 20).' });
    }
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: 'Write a message before sending.' });
    }
    if (String(text).length > 50000) {
      return res.status(400).json({ error: 'Message is too long.' });
    }

    const body = String(text);
    const info = await transporter.sendMail({
      from: FROM_ADDRESS,
      to: toList,
      cc: ccList.length ? ccList : undefined,
      subject: String(subject || '(no subject)').slice(0, 200),
      text: body,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;white-space:pre-wrap">${escapeHtml(body)}</div>`,
      // These two headers keep replies in the same Gmail conversation.
      inReplyTo: inReplyTo || undefined,
      references: Array.isArray(references) && references.length ? references : undefined,
    });

    return res.status(200).json({ sent: true, messageId: info.messageId });
  } catch (err) {
    console.error('email-send error:', err);
    return res.status(500).json({ error: 'Could not send the email.' });
  }
}
