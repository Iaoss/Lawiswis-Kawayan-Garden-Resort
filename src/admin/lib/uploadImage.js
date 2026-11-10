import { staffApi } from './staffApi';

// Uploads a photo to Cloudinary. The server (/api/image-upload) decides how:
// a one-time signed upload, so no Cloudinary key or preset is in the page.
// purpose: 'room' | 'news'. Returns the image's https URL.
export async function uploadImage(file, purpose) {
  const { uploadUrl, fields } = await staffApi('image-upload', { purpose });
  const formData = new FormData();
  formData.append('file', file);
  Object.entries(fields || {}).forEach(([key, value]) => formData.append(key, value));
  const response = await fetch(uploadUrl, { method: 'POST', body: formData });
  if (!response.ok) throw new Error('The photo could not be uploaded. Please try again.');
  const data = await response.json();
  if (!data.secure_url) throw new Error('The photo could not be uploaded. Please try again.');
  return data.secure_url;
}
