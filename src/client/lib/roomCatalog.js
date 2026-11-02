// Room catalog shared by the Rooms page and the home page carousel.
import { FALLBACK_ROOM_IMAGES, resolveRoomImage } from '../components/clientTheme';
import { IMAGE_WIDTHS, optimizeImage } from '../../lib/imageUrl';

/* ------------------------------------------------------------------ */
/* Room catalog copied from lawiswiskawayanresort.com/regular-rooms    */
/* Matched to Firestore rooms by name (room.name or room.roomNumber).  */
/* Firestore values (price, description, image, amenities) win when    */
/* present; the catalog fills in whatever is missing.                  */
/* ------------------------------------------------------------------ */
export const UP = 'https://lawiswiskawayanresort.com/wp-content/uploads/';

export const GROUPS = [
  {
    title: 'Couple Rooms',
    price: 3000,
    capacity: 'Couple',
    intro: 'Cozy, intimate rooms for two. Each room is sanitized and set up for your comfort in a peaceful, nature-inspired setting.',
  },
  {
    title: 'Couple Rooms with Extra Bed',
    price: 3000,
    capacity: 'Couple + optional extra bed',
    intro: 'Room for a small family. Choose the option to add an extra bed. Available in both our new and old buildings.',
  },
  {
    title: 'Family Rooms for 4',
    price: 4600,
    capacity: 'Up to 4 guests',
    intro: 'Spacious family rooms for relaxing and bonding, in the new or old building.',
  },
  {
    title: 'Family Rooms for 6',
    price: 6200,
    capacity: 'Up to 6 guests',
    intro: 'Deluxe rooms with space for the whole family to rest, reconnect, and enjoy the garden.',
  },
];

// [name, image path, group index, description]
const CATALOG_ROWS = [
  ['Himbing', '2024/10/Himbing-01-1400x700-1.jpeg', 0, 'Slip into deep relaxation in Himbing, one of our deluxe couple rooms. Offering a blend of elegance and coziness, this room is designed for couples looking to recharge and reconnect.'],
  ['Tahimik', '2024/10/Tahimik-02-1400x700-1.jpeg', 0, 'True to its name, Tahimik is a haven of peace. These deluxe rooms are thoughtfully designed for couples who value tranquility and restfulness during their stay.'],
  ['Minamahal', '2024/10/MInamahal-01-1400x700-1.jpeg', 0, 'Minamahal is where couples can find ultimate comfort. With its well-designed interiors and a tranquil atmosphere on the second floor, this room is perfect for those seeking both privacy and luxury.'],
  ['Bituin', '2024/10/Bituin-02-1400x700-2.jpeg', 0, 'For those who want a touch of romance, Bituin, located on the second floor, offers stunning views of the surrounding landscape. Let the beauty of the night sky accompany your stay in this elevated and cozy space.'],
  ['Dilag', '2024/10/Dilag-03-1400x700-1.jpeg', 0, 'Step into the bright and inviting space of Dilag. Located on the first floor, this couple’s retreat ensures privacy and relaxation, ideal for unwinding after a day of resort activities.'],
  ['Tadhana', '2024/10/Tadhana-02-1400x700-1.jpeg', 0, 'Tadhana is your serene escape nestled on the first floor. Whether you’re celebrating a special moment or simply seeking time away together, Tadhana brings a sense of calm with all the essentials to make your stay delightful.'],
  ['Hirang', '2020/04/Hirang-02-1400x700-1.jpeg', 0, 'Hirang offers modern comforts on the first floor of our new building. Its strategic location offers easy access to resort amenities, making it the perfect spot for couples looking for relaxation and convenience.'],
  ['Panaginip', '2024/10/Panaginip-05.jpeg', 1, 'True to its name, Panaginip offers a dreamy escape for families. With ample space and a relaxing atmosphere on the first floor, it’s designed for families who want both convenience and privacy.'],
  ['Aruga', '2024/10/Aruga-02-1400x700-1.jpeg', 1, 'Aruga embodies care and comfort. Situated on the first floor of the old building, this room is perfect for families seeking a cozy, well-appointed space to relax after a day of adventure.'],
  ['Giliw', '2024/10/Giliw-01-1400x700-1.jpeg', 1, 'Giliw, located on the first floor of our charming old building, is a family-friendly space that blends modern comforts with a touch of classic design. A perfect base for families to explore and enjoy resort activities.'],
  ['Lambingan', '2024/10/Lambingan-01-1400x700-1.jpeg', 1, 'Located in the heart of the new building, Lambingan is a sanctuary for families looking for both comfort and easy access to resort amenities. A serene environment awaits your family’s stay, ensuring peace and relaxation.'],
  ['Irog', '2024/10/Irog-01-1400x700-1.jpeg', 1, 'Irog is a perfect retreat for families, offering modern amenities and a tranquil ambiance on the first floor of our new building. Spacious and comfortable, it’s a room designed for quality family time.'],
  ['Pag-ibig', '2024/10/Pag-ibig-04-1400x700-1.jpeg', 2, 'Pag-ibig brings a sense of love and togetherness to your family’s vacation. With spacious interiors and a relaxing ambiance, it’s the perfect setting for families to bond and create lasting memories.'],
  ['Kalinga', '2024/10/Kalinga-02-1400x700-1.jpeg', 2, 'Kalinga offers warmth and care, providing a cozy and restful environment on the second floor. This family room is ideal for those looking for a peaceful escape with all the essentials for comfort.'],
  ['Ugoy', '2024/10/Ugoy-02-1400x700-1.jpeg', 2, 'Ugoy, located on the second floor of the old building, provides an inviting and serene space for families to unwind. Its elevated position offers quietness, making it perfect for a peaceful family retreat.'],
  ['Aliwalas', '2024/10/Aliwalas-02-1400x700-1.jpeg', 2, 'Aliwalas brings light and openness to your family’s vacation. Situated on the first floor, it’s a bright and airy room, perfect for families who appreciate spacious and relaxing environments.'],
  ['Ginhawa', '2024/10/Ginhawa-03-1400x700-1.jpeg', 2, 'Ginhawa offers comfort and ease for families on the first floor of the old building. Its spacious layout ensures that your family has everything they need for a restful stay.'],
  ['Iglipan', '2024/10/Iglipan-05-1400x700-1.jpeg', 2, 'Iglipan provides a homely atmosphere in the old building. This room offers a cozy space for families to bond and unwind in a peaceful and comfortable setting.'],
  ['Panatag', '2024/10/Panatag-01-1400x700-1.jpeg', 3, 'True to its name, Panatag offers a serene and peaceful escape for families. This deluxe room is ideal for a restful stay, with a spacious layout that allows for bonding and relaxation.'],
  ['Payapa', '2024/10/Payapa-01-1400x700-1.jpeg', 3, 'Payapa is a sanctuary of tranquility for families. Designed with ample space, this deluxe room ensures comfort and relaxation for all members of the family.'],
];

const CATALOG = Object.fromEntries(
  CATALOG_ROWS.map(([name, path, group, description]) => [
    name.toLowerCase(),
    { name, image: optimizeImage(UP + path, IMAGE_WIDTHS.card), group, description },
  ])
);

// Extra photos we know about (Tahimik has a 5-photo gallery on the resort site).
const EXTRA_GALLERY = {
  tahimik: [1, 2, 3, 4, 5].map(n => optimizeImage(`${UP}2024/10/Tahimik-0${n}.jpeg`, IMAGE_WIDTHS.large)),
};

const DEFAULT_AMENITIES = 'Air conditioning, Wi-Fi, Hot shower';
export const OTHER_GROUP = { title: 'Other Rooms', capacity: '', intro: '' };

/* Merge a Firestore room with the catalog entry that matches its name. */
export function decorateRoom(room, index) {
  const key = String(room.name || room.roomName || room.roomNumber || '').trim().toLowerCase();
  const entry = CATALOG[key];
  const group = entry ? GROUPS[entry.group] : null;
  const groupTitle = group ? group.title : (room.type ? String(room.type) : OTHER_GROUP.title);
  const cover = entry?.image || resolveRoomImage(room) || FALLBACK_ROOM_IMAGES[index % FALLBACK_ROOM_IMAGES.length];
  const gallery = EXTRA_GALLERY[key] || [cover];
  return {
    ...room,
    key,
    title: entry?.name || room.name || room.roomName || `Room ${room.roomNumber}`,
    groupTitle,
    capacity: group?.capacity || '',
    cover,
    gallery,
    price: Number(room.price) || group?.price || 0,
    description: room.description || entry?.description || 'A comfortable stay surrounded by the quiet rhythm of the garden.',
    amenities: String(room.amenities || DEFAULT_AMENITIES).split(',').map(item => item.trim()).filter(Boolean),
  };
}
