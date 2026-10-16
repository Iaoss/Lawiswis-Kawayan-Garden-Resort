import { adminDb, FieldValue } from '../lib/firebaseAdmin';

const asTrimmedString = (value, maximumLength) => (
  typeof value === 'string' ? value.trim().slice(0, maximumLength) : ''
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!adminDb) {
    return res.status(503).json({ error: 'Guest feedback is temporarily unavailable.' });
  }

  const {
    firstName,
    lastName,
    emailAddress,
    roomName,
    comment,
    rating,
    ratings,
    tags,
  } = req.body || {};

  const normalizedFirstName = asTrimmedString(firstName, 35);
  const normalizedLastName = asTrimmedString(lastName, 35);
  const normalizedEmail = asTrimmedString(emailAddress, 254);
  const normalizedRoomName = asTrimmedString(roomName, 120);
  const normalizedComment = asTrimmedString(comment, 800);
  const normalizedRating = Number(rating);

  if (!Number.isInteger(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) {
    return res.status(400).json({ error: 'Provide an overall rating from 1 to 5.' });
  }
  if (typeof ratings !== 'object' || ratings === null || Array.isArray(ratings)) {
    return res.status(400).json({ error: 'Provide category ratings.' });
  }

  const safeRatings = Object.fromEntries(
    ['ambience', 'rooms', 'staff', 'facilities']
      .map(key => [key, Number(ratings[key])])
      .filter(([, value]) => Number.isInteger(value) && value >= 0 && value <= 5)
  );
  const safeTags = Array.isArray(tags)
    ? tags.filter(tag => typeof tag === 'string').map(tag => tag.trim().slice(0, 80)).filter(Boolean).slice(0, 8)
    : [];
  const guestName = [normalizedFirstName, normalizedLastName].filter(Boolean).join(' ') || 'Anonymous';
  const isAnonymous = !normalizedFirstName && !normalizedLastName && !normalizedEmail;

  try {
    const feedback = await adminDb.collection('feedback').add({
      guestName,
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
      email: normalizedEmail,
      roomName: normalizedRoomName,
      roomNumber: normalizedRoomName,
      isAnonymous,
      comment: normalizedComment,
      rating: normalizedRating,
      ratings: safeRatings,
      tags: safeTags,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    return res.status(201).json({ feedbackId: feedback.id });
  } catch (error) {
    console.error('Feedback submission failed:', error);
    return res.status(500).json({ error: 'Could not send your feedback.' });
  }
}
