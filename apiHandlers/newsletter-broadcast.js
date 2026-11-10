import nodemailer from 'nodemailer';
import { adminDb } from '../lib/firebaseAdmin';
import { staffCan, verifyStaff } from '../lib/verifyStaff';
import { safeHttpUrl } from '../src/lib/safeUrl';
import { button, paragraph, renderEmail } from '../lib/emailLayout';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
});

const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const staff = await verifyStaff(req);
  if (!staff) return res.status(401).json({ error: 'Not authorized.' });
  // Emailing every subscriber: admins, or staff given News access.
  if (!staffCan(staff, 'news')) return res.status(403).json({ error: 'Only an admin can email subscribers.' });
  if (!adminDb) return res.status(503).json({ error: 'Newsletter service is unavailable.' });

  const { articleId } = req.body || {};
  if (typeof articleId !== 'string' || !articleId.trim()) {
    return res.status(400).json({ error: 'Article is required.' });
  }

  try {
    const [articleSnap, subscribersSnap] = await Promise.all([
      adminDb.collection('news').doc(articleId).get(),
      adminDb.collection('newsletterSubscribers').where('status', '==', 'active').get(),
    ]);
    if (!articleSnap.exists) return res.status(404).json({ error: 'Article not found.' });
    const stored = articleSnap.data();
    // Only plain web links go into the email.
    const article = { ...stored, externalLink: safeHttpUrl(stored.externalLink), imageUrl: safeHttpUrl(stored.imageUrl) };
    if (article.status !== 'published') {
      return res.status(400).json({ error: 'Only published articles can be broadcast.' });
    }
    const emails = [...new Set(subscribersSnap.docs
      .map((subscriber) => String(subscriber.data().email || '').trim().toLowerCase())
      .filter((email) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)))];
    if (!emails.length) return res.status(200).json({ sent: 0 });

    const from = `Lawiswis Kawayan Resort <${process.env.GMAIL_USER}>`;
    const subject = `${article.category || 'Resort News'}: ${article.title}`;
    const text = `${article.title}\n\n${article.excerpt || article.content || ''}${article.externalLink ? `\n\nRead more: ${article.externalLink}` : ''}`;
    const html = renderEmail({
      title: article.title || 'Resort News',
      preheader: String(article.excerpt || '').slice(0, 120),
      body: [
        `<p style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#7c8a5e;">${escapeHtml(article.category || 'Resort News')}</p>`,
        article.imageUrl ? `<img src="${escapeHtml(article.imageUrl)}" alt="" style="width:100%;height:auto;border-radius:8px;margin:0 0 16px;">` : '',
        paragraph(`<span style="white-space:pre-wrap;">${escapeHtml(article.excerpt || article.content || '')}</span>`),
        article.externalLink ? `<p style="margin:0 0 16px;">${button(article.externalLink, 'Read more')}</p>` : '',
      ].join(''),
      footerNote: 'You received this email because you subscribed to Lawiswis Kawayan Garden Resort updates.',
    });

    let sent = 0;
    for (let offset = 0; offset < emails.length; offset += 40) {
      const batch = emails.slice(offset, offset + 40);
      await transporter.sendMail({ from, to: process.env.GMAIL_USER, bcc: batch, subject, text, html });
      sent += batch.length;
    }
    return res.status(200).json({ sent });
  } catch (error) {
    console.error('Newsletter broadcast failed:', error);
    return res.status(502).json({ error: 'The article was published, but subscriber email delivery failed.' });
  }
}
