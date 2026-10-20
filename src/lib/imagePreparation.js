// Vercel's serverless request body has a platform limit. Accept original camera
// images of any file size and optimize them *before* uploading.
// This is a transport limit, not a restriction on the original capture.
export const UPLOAD_TARGET_BYTES = 3_500_000;

export async function prepareImageForUpload(file) {
  if (!file || !file.type?.startsWith('image/')) throw new Error('Choose an image.');
  if (file.size <= UPLOAD_TARGET_BYTES && ['image/jpeg','image/png','image/webp'].includes(file.type)) return file;
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') {
    throw new Error('This browser cannot prepare the image. Use a modern Chrome or Safari browser.');
  }
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('Cannot read this image. Try a JPG or PNG photo.'); }
  try {
    const maxDimension = 2400;
    let scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    for (let pass = 0; pass < 8; pass++) {
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Image processing is unavailable in this browser.');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      const quality = Math.max(0.48, 0.86 - pass * 0.055);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      canvas.width = 0; canvas.height = 0;
      if (!blob) throw new Error('Image compression failed. Please try again.');
      if (blob.size <= UPLOAD_TARGET_BYTES) {
        const baseName = (file.name || 'photo').replace(/\.[^.]+$/, '');
        return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
      }
      scale *= 0.73;
    }
    throw new Error('This image could not be optimized for upload. Try a different photo.');
  } finally { bitmap.close?.(); }
}
