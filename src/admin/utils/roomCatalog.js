export const ROOM_TYPES = ['Standard', 'Deluxe', 'FamilyRoom', 'JuniorSuite4', 'FamilySuite', 'PresidentialSuite', 'MainVilla'];

export const ROOM_TYPE_CATEGORY_MAP = {
  Standard: 'Regular Rooms',
  Deluxe: 'Couple Room',
  FamilyRoom: 'Family Room for 4 / Family Room for 6',
  JuniorSuite4: 'Junior Suite for 4',
  FamilySuite: 'Family Suite for 4 / Family Suite for 6',
  PresidentialSuite: 'Presidential Suite for 8 / 12',
  MainVilla: 'Main Villa for 25 with Kitchen',
};

const TYPE_ALIASES = {
  Standard: ['standard', 'regularroom', 'regularrooms', 'regularroomfor2'],
  Deluxe: ['deluxe', 'coupleroom', 'couple', 'coupleroom'],
  FamilyRoom: ['familyroom', 'familyroom4', 'familyroom6', 'familyroomfor4', 'familyroomfor6', 'family room', 'family room for 4', 'family room for 6'],
  JuniorSuite4: ['juniorsuite4', 'juniorsuite', 'junior suite', 'junior suite for 4', 'juniorsuitefor4'],
  FamilySuite: ['familysuite', 'familysuite4', 'familysuite6', 'family suite', 'family suite for 4', 'family suite for 6'],
  PresidentialSuite: ['presidentialsuite', 'presidential suite', 'presidentialsuitefor8', 'presidentialsuitefor12', 'presidential suite for 8', 'presidential suite for 12'],
  MainVilla: ['mainvilla', 'main villa', 'mainvilla25', 'main villa with kitchen'],
};

const normalizeKey = (value = '') => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

export const normalizeRoomType = (value = '') => {
  const key = normalizeKey(value);
  if (!key) return '';

  const directMatch = ROOM_TYPES.find(type => normalizeKey(type) === key);
  if (directMatch) return directMatch;

  for (const [canonical, aliases] of Object.entries(TYPE_ALIASES)) {
    if (aliases.some(alias => normalizeKey(alias) === key)) return canonical;
  }

  return '';
};

export const WALK_IN_CATEGORIES = [
  { category: 'Regular Rooms', icon: '🛏', types: ['Standard'], description: 'Comfortable rooms for solo travelers or couples', capacity: 'Up to 2 guests', typeLabel: 'Standard' },
  { category: 'Couple Room', icon: '💑', types: ['Deluxe'], description: 'Romantic rooms designed for couples', capacity: 'Up to 2 guests', typeLabel: 'Deluxe' },
  { category: 'Family Room for 4', icon: '👨‍👩‍👧‍👦', types: ['FamilyRoom'], description: 'Spacious rooms for families of up to 4', capacity: 'Up to 4 guests', typeLabel: 'FamilyRoom' },
  { category: 'Family Room for 6', icon: '👨‍👩‍👧‍👦', types: ['FamilyRoom'], description: 'Large family rooms accommodating up to 6 guests', capacity: 'Up to 6 guests', typeLabel: 'FamilyRoom' },
  { category: 'Junior Suite for 4', icon: '🏨', types: ['JuniorSuite4'], description: 'Junior suites with living area for up to 4', capacity: 'Up to 4 guests', typeLabel: 'JuniorSuite4' },
  { category: 'Family Suite for 4', icon: '🏠', types: ['FamilySuite'], description: 'Full suite with family amenities for 4', capacity: 'Up to 4 guests', typeLabel: 'FamilySuite' },
  { category: 'Family Suite for 6', icon: '🏠', types: ['FamilySuite'], description: 'Spacious family suite for up to 6 guests', capacity: 'Up to 6 guests', typeLabel: 'FamilySuite' },
  { category: 'Presidential Suite for 8', icon: '👑', types: ['PresidentialSuite'], description: 'Premium suite for large groups of up to 8', capacity: 'Up to 8 guests', typeLabel: 'PresidentialSuite' },
  { category: 'Presidential Suite for 12', icon: '👑', types: ['PresidentialSuite'], description: 'Grand presidential suite for up to 12 guests', capacity: 'Up to 12 guests', typeLabel: 'PresidentialSuite' },
  { category: 'Main Villa for 25 with Kitchen', icon: '🏡', types: ['MainVilla'], description: 'The iconic main villa with full kitchen, accommodating up to 25 guests', capacity: 'Up to 25 guests', typeLabel: 'MainVilla' },
];

export const getRoomsForCategory = (rooms = [], category) => {
  if (!category?.types?.length) return [];
  return rooms.filter(room => category.types.includes(normalizeRoomType(room?.type)));
};
