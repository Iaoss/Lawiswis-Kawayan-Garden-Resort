// The room list for the guest pages, from /api/public-rooms.
//
// That route is cached on Vercel's CDN, so all visitors share one database
// read every few minutes instead of each visitor reading every room. The list
// is also kept in memory while the guest moves between pages. If the route
// can't be reached (e.g. running `npm start` locally), it falls back to
// reading Firestore directly.
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';

let roomsPromise = null;

async function fetchRooms() {
  try {
    const response = await fetch('/api/public-rooms');
    if (!response.ok) throw new Error(`public-rooms ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.rooms)) throw new Error('public-rooms returned no list');
    return data.rooms;
  } catch (error) {
    const snapshot = await getDocs(collection(db, 'rooms'));
    return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  }
}

// Resolves to [{ id, ...room }].
export function loadPublicRooms() {
  roomsPromise = roomsPromise || fetchRooms().catch(error => {
    roomsPromise = null;
    throw error;
  });
  return roomsPromise;
}
