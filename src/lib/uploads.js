import { prepareImageForUpload } from './imagePreparation.js';
import { supabase } from './supabaseClient.js';
const TYPES = new Set(['image/jpeg','image/png','image/webp']);
const photoCache = new Map();
const pendingPhotos = new Map();
const MAX_CACHED_PHOTOS = 40;
export function clearPrivatePhotoCache() {
  for (const url of photoCache.values()) URL.revokeObjectURL(url);
  photoCache.clear();
  pendingPhotos.clear();
}

async function accessToken(forceRefresh = false) {
  const { data, error } = forceRefresh ? await supabase.auth.refreshSession() : await supabase.auth.getSession();
  if (error || !data?.session?.access_token) throw new Error('RentDesk login is unavailable. Sign in to the app before uploading photos.');
  const session = data.session;
  if (!forceRefresh && session.expires_at && session.expires_at * 1000 < Date.now() + 120000) return accessToken(true);
  return session.access_token;
}
async function serverError(response) {
  const body = await response.json().catch(() => ({}));
  const err = new Error(body.error || `Photo API returned HTTP ${response.status}`);
  err.status = response.status;
  err.code = body.code;
  return err;
}
async function photoRequest(path, makeRequest) {
  const send = async (refresh) => {
    const token = await accessToken(refresh);
    return fetch(path, makeRequest(token));
  };
  let response;
  try {
    response = await send(false);
    // An old browser token may be rejected even though a refresh token is valid.
    // Retry exactly once, never repeatedly submit successful uploads.
    if (response.status === 401) response = await send(true);
  } catch (e) {
    if (e.message?.includes('RentDesk login')) throw e;
    throw new Error('Cannot reach RentDesk photo API. Run npm.cmd run dev:all locally or check Vercel deployment. ' + e.message);
  }
  if (!response.ok) throw await serverError(response);
  return response;
}
export async function uploadImage(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('Choose an image.');
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('Connect to the internet to upload photos.');
  const prepared = await prepareImageForUpload(file);
  if (!TYPES.has(prepared.type)) throw new Error('This image format could not be prepared for upload.');
  const response = await photoRequest('/api/r2/upload', token => ({method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':prepared.type},body:prepared}));
  const body = await response.json();
  if (!body.objectKey) throw new Error('Photo API returned no image reference.');
  return `r2:${body.objectKey}`;
}
export async function resolvePhotoUrl(value) {
  if (!value || !value.startsWith('r2:')) return value || null;
  const key = value.slice(3);
  if (photoCache.has(key)) return photoCache.get(key);
  // Concurrent cards showing the same private photo share one authenticated request.
  if (pendingPhotos.has(key)) return pendingPhotos.get(key);
  const pending = (async () => {
    const response = await photoRequest('/api/r2/photo', token => ({
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectKey: key })
    }));
    const url = URL.createObjectURL(await response.blob());
    // Keep object URLs valid while mounted. Clear on sign-out; do not evict
    // during the session because mounted <img> elements may still reference them.
    photoCache.set(key, url);
    if (photoCache.size > MAX_CACHED_PHOTOS) console.debug('RentDesk private photo cache exceeds recommended size');
    return url;
  })();
  pendingPhotos.set(key, pending);
  try { return await pending; }
  finally { pendingPhotos.delete(key); }
}
export async function checkPhotoConnection() {
  const response = await photoRequest('/api/r2/auth-check',token=>({method:'GET',headers:{Authorization:`Bearer ${token}`}}));
  return response.json();
}
