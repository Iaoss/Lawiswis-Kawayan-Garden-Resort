import { storage } from '../../firebase/firebase';
import { ref, deleteObject } from 'firebase/storage';

export const FOREST = '#3B4530';
export const FOREST_DEEP = '#232A1B';
export const MOSS = '#7C8A5E';
export const BRASS = '#AD8A52';
export const INK = '#22261B';
export const CREAM = '#F4EFE1';
export const PAPER = '#FBF9F4';
export const LINE = '#E3DDC8';
export const SERIF = "'Fraunces', 'Times New Roman', serif";
export const SANS = "'Inter', sans-serif";

export const ROOM_IMAGES = {
  himbing: 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Himbing-01-1400x700-1.jpeg',
  tahimik: 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Tahimik-02-1400x700-1.jpeg',
  minamahal: 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/MInamahal-01-1400x700-1.jpeg',
  bituin: 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Bituin-02-1400x700-2.jpeg',
  dilag: 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Dilag-03-1400x700-1.jpeg',
  tadhana: 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Tadhana-02-1400x700-1.jpeg',
  hirang: 'https://lawiswiskawayanresort.com/wp-content/uploads/2020/04/Hirang-02-1400x700-1.jpeg',
  panaginip: 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Panaginip-05.jpeg',
  aruga: 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Aruga-02-1400x700-1.jpeg',
  giliw: 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Giliw-01-1400x700-1.jpeg',
  lambingan: 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Lambingan-01-1400x700-1.jpeg',
  irog: 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Irog-01-1400x700-1.jpeg',
  'pag-ibig': 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Pag-ibig-04-1400x700-1.jpeg',
  kalinga: 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Kalinga-02-1400x700-1.jpeg',
  ugoy: 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Ugoy-02-1400x700-1.jpeg',
  aliwalas: 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Aliwalas-02-1400x700-1.jpeg',
  ginhawa: 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Ginhawa-03-1400x700-1.jpeg',
  iglipan: 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Iglipan-05-1400x700-1.jpeg',
  panatag: 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Panatag-01-1400x700-1.jpeg',
  payapa: 'https://lawiswiskayanresort.com/wp-content/uploads/2024/10/Payapa-01-1400x700-1.jpeg',
  hiwaga: 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Hiwaga-02-1400x700-1.jpeg',
  simoy: 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Simoy-01-1400x700-1.jpeg',
  ligaya: 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Ligaya-01-1400x700-1.jpeg',
  hapag: 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Hapag-06-1400x700-1.jpeg',
  dalisay: 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Dalisay-05-1400x700-1.jpeg',
  halimuyak: 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Halimuyak-04-1400x700-1.jpeg',
  paraiso: 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Paraiso-03-1400x700-1.jpeg',
  'main villa': 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Main-Villa-08-1400x700-1.jpeg',
};

export const getRoomImage = (name) => {
  if (!name) return null;
  return ROOM_IMAGES[String(name).trim().toLowerCase()] || null;
};

// Prefer an admin-uploaded photo (room.imageUrl, stored in Firebase Storage);
// fall back to the legacy WordPress-hosted map for rooms nobody has re-uploaded yet.
export const resolveRoomImage = (room) => {
  if (room?.imageUrl) return room.imageUrl;
  return getRoomImage(room?.roomNumber);
};

// True only for images we uploaded ourselves (live in our Storage bucket under
// "rooms/"), as opposed to the hardcoded external WordPress URLs above.
// Used to decide whether an old photo is safe/appropriate to delete from Storage.
export const isManagedStorageUrl = (url) => {
  if (!url) return false;
  return url.includes('firebasestorage.googleapis.com') || url.includes('appspot.com');
};

// Best-effort delete of a previously uploaded room image from Firebase Storage.
// Safe to call with WP URLs or empty values — it just no-ops in that case.
export const deleteRoomImageFromStorage = async (url) => {
  if (!isManagedStorageUrl(url)) return;
  try {
    const storageRef = ref(storage, url);
    await deleteObject(storageRef);
  } catch (err) {
    // Not fatal — the doc/UI already moved on. Common cause: already deleted,
    // or the URL wasn't a storage ref we could resolve back to a path.
    console.warn('Could not delete old room image from storage:', err);
  }
};

export const FALLBACK_ROOM_IMAGES = [
  ROOM_IMAGES.himbing,
  ROOM_IMAGES.tahimik,
  ROOM_IMAGES.minamahal,
  ROOM_IMAGES.panaginip,
];