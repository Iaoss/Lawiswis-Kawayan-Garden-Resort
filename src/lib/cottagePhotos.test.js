import { COTTAGE_OPTIONS, DEFAULT_COTTAGE_IMAGES, applyCottageCatalog, cottageImage, normalizeCottageCatalog } from './bookingPricing';

describe('cottage photos', () => {
  it('uses the resort photo when no photo was uploaded', () => {
    expect(cottageImage({ id: 'poolside-cabana' })).toBe(DEFAULT_COTTAGE_IMAGES['poolside-cabana']);
    expect(cottageImage({ id: 'umbrella-hut' })).toBe('');
    expect(COTTAGE_OPTIONS.find(option => option.id === 'pavilion').image).toBe(DEFAULT_COTTAGE_IMAGES.pavilion);
  });

  it('keeps an uploaded https photo and drops anything else', () => {
    const list = normalizeCottageCatalog({ cottages: [
      { id: 'umbrella-hut', name: 'Umbrella Hut', maxGuests: 6, price: 500, image: 'https://res.cloudinary.com/demo/image/upload/hut.jpg' },
      { id: 'garden-cabana', name: 'Garden Cabana', maxGuests: 10, price: 1000, image: 'javascript:alert(1)' },
    ] });
    expect(list[0].image).toBe('https://res.cloudinary.com/demo/image/upload/hut.jpg');
    expect(list[1].image).toBe('');
    expect(cottageImage(list[1])).toBe(DEFAULT_COTTAGE_IMAGES['garden-cabana']);
  });

  it('gives the saved photo to the cottage list guests see', () => {
    applyCottageCatalog({ cottages: [{ id: 'umbrella-hut', name: 'Umbrella Hut', maxGuests: 6, price: 500, image: 'https://example.com/hut.jpg' }] });
    expect(COTTAGE_OPTIONS.find(option => option.id === 'umbrella-hut').image).toBe('https://example.com/hut.jpg');
  });
});
