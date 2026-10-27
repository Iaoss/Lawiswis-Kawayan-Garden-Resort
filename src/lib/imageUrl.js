// Smaller, faster versions of the website's photos.
//
// - Photos hosted on the old WordPress site are full-size originals (some are
//   2560px "scaled" files). They go through the free wsrv.nl image service,
//   which resizes them, converts them to WebP and caches them on a CDN. If
//   the service ever fails, `default=` sends the browser to the original.
// - Cloudinary uploads get Cloudinary's own resize + auto format/quality.
// - Anything else (local /images files, data URLs) is returned unchanged.

const WORDPRESS = /^https?:\/\/(www\.)?lawiswiskawayanresort\.com\/wp-content\//i;
const CLOUDINARY_UPLOAD = /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/i;

export const IMAGE_WIDTHS = {
  hero: 1920, // full-width banners and sliders
  large: 1400, // big feature photos
  card: 900, // room / news / amenity cards
  thumb: 400, // gallery thumbnails
  logo: 480,
};

export function optimizeImage(url, width = IMAGE_WIDTHS.large) {
  if (typeof url !== 'string' || !url) return url;

  const cloudinary = CLOUDINARY_UPLOAD.exec(url);
  if (cloudinary) {
    const [, base, rest] = cloudinary;
    // Leave URLs that already carry their own transformation alone.
    if (/^(?:[a-z]{1,3}_[^/,]+,?)+\//i.test(rest)) return url;
    return `${base}f_auto,q_auto,c_limit,w_${width}/${rest}`;
  }

  if (WORDPRESS.test(url)) {
    const source = url.replace(/^https?:\/\//i, '');
    return `https://wsrv.nl/?url=${encodeURIComponent(source)}&w=${width}&we&output=webp&q=78&default=${encodeURIComponent(url)}`;
  }

  return url;
}

// Optimizes every value of an { name: url } map at one width.
export function optimizeImageMap(map, width) {
  return Object.fromEntries(Object.entries(map).map(([key, url]) => [key, optimizeImage(url, width)]));
}
