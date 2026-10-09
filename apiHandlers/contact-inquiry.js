import nodemailer from 'nodemailer';
import { adminDb, FieldValue } from '../lib/firebaseAdmin';
import { NAME_PATTERN, joinGuestName } from '../src/lib/nameValidation';

const INBOX = 'info@lawiswiskawayanresort.com';
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
});

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!adminDb) return res.status(503).json({ error: 'The inquiry service is temporarily unavailable.' });

  const { firstName, lastName, email, phone = '', subject = '', message } = req.body || {};
  const normalizedFirstName = typeof firstName === 'string' ? firstName.trim() : '';
  const normalizedLastName = typeof lastName === 'string' ? lastName.trim() : '';
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const normalizedPhone = typeof phone === 'string' ? phone.trim() : '';
  const normalizedSubject = typeof subject === 'string' ? subject.trim().slice(0, 160) : '';
  const normalizedMessage = typeof message === 'string' ? message.trim() : '';

  if (!NAME_PATTERN.test(normalizedFirstName) || !NAME_PATTERN.test(normalizedLastName)) {
    return res.status(400).json({ error: 'Enter a valid first and last name (2-35 letters each).' });
  }
  if (!EMAIL_RE.test(normalizedEmail) || normalizedEmail.length > 254) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (normalizedPhone.length > 40 || normalizedSubject.length > 160
    || normalizedMessage.length < 5 || normalizedMessage.length > 10000) {
    return res.status(400).json({ error: 'Check the phone, subject, and message fields and try again.' });
  }

  const fullName = joinGuestName(normalizedFirstName, normalizedLastName);
  let inquiryRef;
  try {
    inquiryRef = await adminDb.collection('contacts').add({
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
      name: fullName,
      email: normalizedEmail,
      phone: normalizedPhone,
      subject: normalizedSubject || 'General Inquiry',
      message: normalizedMessage,
      status: 'unanswered',
      read: false,
      emailDelivery: 'pending',
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error('Contact inquiry persistence failed:', error);
    return res.status(503).json({ error: 'We could not save your message. Please try again later.' });
  }

  try {
    await transporter.sendMail({
      from: `Lawiswis Kawayan Resort <${process.env.GMAIL_USER}>`,
      to: INBOX,
      replyTo: { name: fullName, address: normalizedEmail },
      subject: `[Website inquiry] ${normalizedSubject || 'General Inquiry'}`,
      text: `From: ${fullName}\nEmail: ${normalizedEmail}\nPhone: ${normalizedPhone || 'Not provided'}\n\n${normalizedMessage}`,
      html: `<h2>Website inquiry</h2><p><strong>From:</strong> ${escapeHtml(fullName)}</p><p><strong>Email:</strong> ${escapeHtml(normalizedEmail)}</p><p><strong>Phone:</strong> ${escapeHtml(normalizedPhone || 'Not provided')}</p><p><strong>Subject:</strong> ${escapeHtml(normalizedSubject || 'General Inquiry')}</p><hr><p style="white-space:pre-wrap">${escapeHtml(normalizedMessage)}</p>`,
    });
    await inquiryRef.update({ emailDelivery: 'sent', emailSentAt: FieldValue.serverTimestamp() });
    return res.status(200).json({ submitted: true });
  } catch (error) {
    console.error('Contact inquiry email delivery failed:', error);
    try {
      await inquiryRef.update({ emailDelivery: 'failed', emailDeliveryError: String(error.message || 'Email delivery failed').slice(0, 300) });
    } catch (updateError) {
      console.error('Could not record contact email delivery failure:', updateError);
    }
    return res.status(502).json({
      saved: true,
      error: 'Your message was saved for the resort team, but email delivery failed. Please call 0917 811 2332.',
    });
  }
}
