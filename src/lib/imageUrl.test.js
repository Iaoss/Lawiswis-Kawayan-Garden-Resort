import { optimizeImage } from './imageUrl';

test('WordPress photos go through the resizing service with a fallback to the original', () => {
  const original = 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/09/Welcome-scaled-1.jpeg';
  const url = optimizeImage(original, 1400);
  expect(url.startsWith('https://wsrv.nl/?url=lawiswiskawayanresort.com%2Fwp-content')).toBe(true);
  expect(url).toContain('&w=1400&we&output=webp');
  expect(url).toContain(`&default=${encodeURIComponent(original)}`);
});

test('Cloudinary uploads get resize and auto format/quality once', () => {
  const url = 'https://res.cloudinary.com/demo/image/upload/v1712/rooms/abc.jpg';
  expect(optimizeImage(url, 900)).toBe('https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_900/v1712/rooms/abc.jpg');
  const already = 'https://res.cloudinary.com/demo/image/upload/w_300,c_fill/v1712/rooms/abc.jpg';
  expect(optimizeImage(already, 900)).toBe(already);
});

test('other images are left alone', () => {
  expect(optimizeImage('/images/resort/serenity-pool.webp')).toBe('/images/resort/serenity-pool.webp');
  expect(optimizeImage('')).toBe('');
  expect(optimizeImage(undefined)).toBe(undefined);
});
