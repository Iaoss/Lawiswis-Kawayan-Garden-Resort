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

export const FALLBACK_ROOM_IMAGES = [
  ROOM_IMAGES.himbing,
  ROOM_IMAGES.tahimik,
  ROOM_IMAGES.minamahal,
  ROOM_IMAGES.panaginip,
];