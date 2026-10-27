// Resort amenities, from lawiswiskawayanresort.com/our-amenities and the
// resort rate card. Used by the Home page carousel and the Amenities page.
import { Flame, Flower2, Leaf, PartyPopper, UtensilsCrossed, Waves, BedDouble } from 'lucide-react';
import { IMAGE_WIDTHS, optimizeImage } from '../../lib/imageUrl';

const UPLOADS = 'https://lawiswiskawayanresort.com/wp-content/uploads';
const PHOTOS = `${process.env.PUBLIC_URL || ''}/images/resort`;

export const AMENITY_GROUPS = [
  {
    id: 'pools',
    number: '01',
    title: 'Pool & Recreation',
    icon: Waves,
    gradient: 'from-[#e3efe4] to-[#cfe3d2]',
    image: `${PHOTOS}/serenity-pool.webp`,
    alt: 'The Serenity pool surrounded by gardens',
    description: 'Three pools for every age, with cabanas, daybeds and a poolside bar for lounging between dips.',
    highlights: ['Adult pool (3–6 ft)', 'Kiddie pool (18 in)', 'Bubble pool (2 ft)'],
    items: ['Adult Swimming Pool (3–6 ft)', 'Kiddie Pool (18 inches)', 'Bubble Pool (2 ft)', 'Jacuzzi Area', 'Poolside Bar', 'Poolside Cabanas', 'Poolside Pavilion', 'Covered Daybeds', 'Billiards / Mini Gym Area', 'Playground / Basketball Shooting Area'],
  },
  {
    id: 'events',
    number: '02',
    title: 'Function & Event Spaces',
    icon: PartyPopper,
    gradient: 'from-[#f3ead3] to-[#e9dbb6]',
    image: `${PHOTOS}/bonfire-gathering.webp`,
    alt: 'Group gathering around the bonfire under string lights',
    description: 'Room for reunions, weddings, seminars and team building — indoors or out in the gardens.',
    highlights: ['Function hall for 150+ guests', 'Dining hall & pavilion', 'KTV room'],
    items: ['Air-conditioned Function Hall (150+ guests, with powder rooms)', 'Dining Hall (covered and al fresco areas)', 'Pavilion for Gatherings and Celebrations', 'KTV Room', 'Manicured Gardens for Photoshoots and Events', 'Barbecue Areas with Artistic Stoneworks', 'Team Building Materials'],
  },
  {
    id: 'dining',
    number: '03',
    title: 'Dining & Lounging',
    icon: UtensilsCrossed,
    gradient: 'from-[#f6e3d7] to-[#efcdb8]',
    image: `${PHOTOS}/garden-terrace.webp`,
    alt: 'A couple sharing drinks on a garden terrace',
    description: 'Casual meals in the open air, from the snack bar and café to grilling stations under the trees.',
    highlights: ['Garden Resort Café', 'Snack bar & al fresco lounge', 'Grilling stations'],
    items: ['Garden Resort Café', 'Snack Bar and Al Fresco Lounge', 'Kitchen-on-call', 'Grilling / Samgyupsal Stations', 'Main Kitchen and Store Room', 'Gift / Souvenir Shop'],
  },
  {
    id: 'spa',
    number: '04',
    title: 'Spa & Wellness',
    icon: Flower2,
    gradient: 'from-[#ece4f1] to-[#dccfe8]',
    image: optimizeImage(`${UPLOADS}/2020/01/Spa.jpeg`, IMAGE_WIDTHS.card),
    alt: 'Lawiswis Kawayan Spa',
    description: 'A quiet spa tucked away from the main grounds. Room guests get 20% off all spa rates.',
    highlights: ['₱1,000 per hour', '20% off for room guests', 'Tea preparation room'],
    items: ['Lawiswis Kawayan Spa / Boutique', 'Dressing Area', 'Tea Preparation Room', 'Separate Toilet and Bath'],
  },
  {
    id: 'activities',
    number: '05',
    title: 'Activities & Evenings',
    icon: Flame,
    gradient: 'from-[#f7e7c6] to-[#f0d49a]',
    image: `${PHOTOS}/fireside-friends.webp`,
    alt: 'Friends roasting marshmallows by the fire pit',
    description: 'Bonfires with s’mores, open-air movies and old-school games — the resort comes alive after dark.',
    highlights: ['Bonfire & s’mores', 'Al fresco movie nights', 'Kadang-kadang (bamboo stilts)'],
    items: ['Bonfire Area for S’mores', 'Al Fresco Movie Watching', 'Kadang-kadang / Bamboo Stilts', 'Romantic Dinner Setup', 'Billiards', 'Table Tennis', 'Street Basketball Court', 'Trampoline'],
  },
  {
    id: 'stays',
    number: '06',
    title: 'Rooms, Suites & Villa',
    icon: BedDouble,
    gradient: 'from-[#e1ebf0] to-[#c9dbe4]',
    image: `${PHOTOS}/veranda-lounge.webp`,
    alt: 'Veranda lounge overlooking the trees',
    description: '30 guest rooms, 7 suites with kitchens, the four-bedroom Main Villa and a private house for big families.',
    highlights: ['23 standard rooms', '7 suites with kitchens', 'Main Villa (4 bedrooms)'],
    items: ['23 Standard Air-conditioned Rooms (private bath with heater)', '7 Suites with Kitchens (one with a private theater room)', 'Main Villa: 4 bedrooms, private kitchen', 'Private House (3rd floor): master bedroom, 3 bedrooms, guest room, full kitchen, 20-seat dining table', 'Artworks by Nilo Badajos, Gilbert Angeles, Rommel Hipolito and Joshua Laureano'],
  },
  {
    id: 'grounds',
    number: '07',
    title: 'Grounds & Sustainability',
    icon: Leaf,
    gradient: 'from-[#e6eedb] to-[#d2e2bf]',
    image: `${PHOTOS}/bamboo-cabanas.webp`,
    alt: 'Curtained cabanas in the bamboo garden',
    description: 'Bamboo gardens, grass-covered lawns and art displays — powered in part by the sun.',
    highlights: ['10 kWp solar installation', 'Parking for 30 cars', 'Bamboo gardens'],
    items: ['10 kWp Solar Installation', 'Driveway and Parking for up to 30 Cars', 'Outdoor Bamboo Gardens', 'Grass-covered Areas', 'Art Displays'],
  },
];

// Headline numbers for the Amenities page.
export const AMENITY_STATS = [
  { value: '30', label: 'Guest rooms' },
  { value: '3', label: 'Swimming pools' },
  { value: '150+', label: 'Guests in the function hall' },
  { value: '30', label: 'Parking slots' },
  { value: '10 kWp', label: 'Solar power' },
];
