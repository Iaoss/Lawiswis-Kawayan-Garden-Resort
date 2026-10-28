import React, { useId } from 'react';

// Friendly round "beam" avatars (the style in the resort's avatar sheet):
// a coloured face on a second colour, with eyes and a smile. The same seed
// always draws the same avatar, so a guest keeps their face everywhere.

export const AVATAR_COLORS = ['#A3A948', '#EDB92E', '#F85931', '#CE1836', '#009989'];

// Seeds for the staff picker, from the avatar sheet.
export const AVATAR_PRESETS = [
  'Mary Baker', 'Amelia Earhart', 'Mary Roebling', 'Sarah Winnemucca', 'Margaret Brent',
  'Lucy Stone', 'Mary Edwards', 'Margaret Chase', 'Mahalia Jackson', 'Maya Angelou',
  'Alicia Dickerson', 'Daisy Gatson', 'Emma Willard', 'Amelia Boynton', 'Maria Mitchell',
  'Sojourner Truth', 'Willa Cather', 'Coretta Scott', 'Harriet Tubman', 'Fabiola Cabeza',
  'Ma Rainey', 'Julia Ward', 'Irene Morgan', 'Babe Didrikson', 'Lyda Conley',
  'Annie Dodge', 'Maud Nathan', 'Betty Ford', 'Rosa Parks', 'Susan La',
  'Katharine Graham', 'Florence Chadwick', 'Zora Neale', 'Wilma Rudolph', 'Annie Jump',
  'Mother Frances', 'Jovita Idar', 'Maggie L', 'Henrietta Swan', 'Jane Cunningham',
];

const SIZE = 36;

function hashCode(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash &= hash; // keep it a 32-bit integer
  }
  return Math.abs(hash);
}
const getDigit = (number: number, position: number) => Math.floor((number / 10 ** position) % 10);
const getBoolean = (number: number, position: number) => !(getDigit(number, position) % 2);
const getUnit = (number: number, range: number, index?: number) => {
  const value = number % range;
  return index && getDigit(number, index) % 2 === 0 ? -value : value;
};
const getColor = (number: number, colors: string[]) => colors[number % colors.length];
const getContrast = (hex: string) => {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 >= 128 ? '#000000' : '#FFFFFF';
};

export function getBeamData(seed: string, colors: string[] = AVATAR_COLORS) {
  const number = hashCode(String(seed || 'guest'));
  const wrapperColor = getColor(number, colors);
  const preX = getUnit(number, 10, 1);
  const wrapperTranslateX = preX < 5 ? preX + SIZE / 9 : preX;
  const preY = getUnit(number, 10, 2);
  const wrapperTranslateY = preY < 5 ? preY + SIZE / 9 : preY;
  return {
    wrapperColor,
    faceColor: getContrast(wrapperColor),
    backgroundColor: getColor(number + 13, colors),
    wrapperTranslateX,
    wrapperTranslateY,
    wrapperRotate: getUnit(number, 360),
    wrapperScale: 1 + getUnit(number, SIZE / 12) / 10,
    isMouthOpen: getBoolean(number, 2),
    isCircle: getBoolean(number, 1),
    eyeSpread: getUnit(number, 5),
    mouthSpread: getUnit(number, 3),
    faceRotate: getUnit(number, 10, 3),
    faceTranslateX: wrapperTranslateX > SIZE / 6 ? wrapperTranslateX / 2 : getUnit(number, 8, 1),
    faceTranslateY: wrapperTranslateY > SIZE / 6 ? wrapperTranslateY / 2 : getUnit(number, 7, 2),
  };
}

// A seed for a guest that stays the same across pages: phone, then email,
// then name.
export function guestAvatarSeed(guest: { phone?: string; guestPhone?: string; email?: string; guestEmail?: string; guestName?: string; name?: string; firstName?: string; lastName?: string; id?: string } = {}) {
  const phone = String(guest.phone || guest.guestPhone || '').replace(/\D/g, '');
  if (phone.length >= 7) return `phone:${phone}`;
  const email = String(guest.email || guest.guestEmail || '').trim().toLowerCase();
  if (email) return `email:${email}`;
  const name = String(guest.guestName || guest.name || [guest.firstName, guest.lastName].filter(Boolean).join(' ')).trim().toLowerCase();
  return name ? `name:${name}` : `id:${guest.id || 'guest'}`;
}

interface BeamAvatarProps {
  seed: string;
  size?: number | string;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function BeamAvatar({ seed, size = 40, title, className, style }: BeamAvatarProps) {
  const maskId = `beam-${useId().replace(/:/g, '')}`;
  const d = getBeamData(seed);
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      fill="none"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      className={className}
      style={{ display: 'block', flexShrink: 0, borderRadius: '50%', ...style }}
    >
      {title && <title>{title}</title>}
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={SIZE} height={SIZE}>
        <rect width={SIZE} height={SIZE} rx={SIZE * 2} fill="#FFFFFF" />
      </mask>
      <g mask={`url(#${maskId})`}>
        <rect width={SIZE} height={SIZE} fill={d.backgroundColor} />
        <rect
          x="0"
          y="0"
          width={SIZE}
          height={SIZE}
          transform={`translate(${d.wrapperTranslateX} ${d.wrapperTranslateY}) rotate(${d.wrapperRotate} ${SIZE / 2} ${SIZE / 2}) scale(${d.wrapperScale})`}
          fill={d.wrapperColor}
          rx={d.isCircle ? SIZE : SIZE / 6}
        />
        <g transform={`translate(${d.faceTranslateX} ${d.faceTranslateY}) rotate(${d.faceRotate} ${SIZE / 2} ${SIZE / 2})`}>
          {d.isMouthOpen ? (
            <path d={`M15 ${19 + d.mouthSpread}c2 1 4 1 6 0`} stroke={d.faceColor} fill="none" strokeLinecap="round" />
          ) : (
            <path d={`M13,${19 + d.mouthSpread} a1,0.75 0 0,0 10,0`} fill={d.faceColor} />
          )}
          <rect x={14 - d.eyeSpread} y={14} width={1.5} height={2} rx={1} stroke="none" fill={d.faceColor} />
          <rect x={20 + d.eyeSpread} y={14} width={1.5} height={2} rx={1} stroke="none" fill={d.faceColor} />
        </g>
      </g>
    </svg>
  );
}

// Staff avatar: their chosen avatar, or their initials until they pick one.
export function StaffAvatar({ seed, name, size = 36, background, color }: { seed?: string; name?: string; size?: number; background?: string; color?: string }) {
  if (seed) return <BeamAvatar seed={seed} size={size} title={name ? `${name}'s avatar` : 'Avatar'} />;
  const initials = String(name || '?').trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || '?';
  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0,
        background: background || 'var(--accent)', color: color || 'var(--accent-foreground)', fontWeight: 700, fontSize: Math.round(size * 0.36),
      }}
    >
      {initials}
    </span>
  );
}

export default BeamAvatar;
