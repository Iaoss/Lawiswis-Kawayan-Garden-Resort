// POST /api/image-upload  { purpose: 'room' | 'news' }   (staff sign-in)
//
// Lets staff upload a photo straight to Cloudinary without putting any
// Cloudinary setting in the website code.
//
// With CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET set (recommended), it
// returns a one-time signed upload: the browser can upload one image to the
// given folder for the next hour, and nobody can reuse it for anything else.
// Without them it falls back to the old unsigned preset, which is then only
// given to signed-in staff instead of being visible in the page source.
//
// Room photos: admins only. News photos: admins and staff with News access.

import crypto from 'crypto';
import { staffCan, verifyStaff } from '../lib/verifyStaff';

const FOLDERS = { room: 'lawiswis/rooms', news: 'lawiswis/news' };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const staff = await verifyStaff(req);
  if (!staff) return res.status(401).json({ error: 'Please sign in again.' });

  const purpose = req.body?.purpose;
  if (!FOLDERS[purpose]) return res.status(400).json({ error: 'Choose what the photo is for.' });
  const allowed = purpose === 'room' ? staff.role === 'admin' : staffCan(staff, 'news');
  if (!allowed) return res.status(403).json({ error: 'You can’t upload photos here.' });

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || 'x17b4eux';
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

  if (apiKey && apiSecret) {
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = FOLDERS[purpose];
    // Cloudinary signs the parameters in alphabetical order, then the secret.
    const signature = crypto.createHash('sha1').update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`).digest('hex');
    return res.status(200).json({ uploadUrl, fields: { api_key: apiKey, timestamp: String(timestamp), folder, signature } });
  }

  const preset = process.env.CLOUDINARY_UPLOAD_PRESET || 'w8sfwf9b';
  return res.status(200).json({ uploadUrl, fields: { upload_preset: preset } });
}
