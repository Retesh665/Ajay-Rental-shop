// Per-user IndexedDB read-through snapshots. No financial writes are queued.
const DB_NAME = 'rentdesk-offline-v1';
const STORE = 'snapshots';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
function dbOpen() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function operation(mode, key, value) {
  const db = await dbOpen();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = mode === 'readonly' ? tx.objectStore(STORE).get(key) : value === undefined ? tx.objectStore(STORE).delete(key) : tx.objectStore(STORE).put(value, key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
export async function readSnapshot(userId, type) {
  if (!userId) return null;
  try {
    const value = await operation('readonly', `${userId}:${type}`);
    return value && Date.now() - value.updatedAt <= MAX_AGE_MS ? value : null;
  } catch { return null; }
}
export async function writeSnapshot(userId, type, rows) {
  if (!userId || !Array.isArray(rows)) return;
  try { await operation('readwrite', `${userId}:${type}`, {rows, updatedAt: Date.now()}); } catch (error) { console.warn('Offline cache unavailable', error); }
}
export async function mergeSnapshot(userId, type, rows, key = 'id') {
  if (!userId || !Array.isArray(rows)) return;
  const old = await readSnapshot(userId, type);
  const merged = new Map((old?.rows || []).map(row => [row[key], row]));
  for (const row of rows) if (row?.[key]) merged.set(row[key], row);
  await writeSnapshot(userId, type, [...merged.values()]);
}
export async function clearOfflineSnapshots(userId) {
  if (!userId) return;
  await Promise.all(['customers','products','machines','recentCustomers'].map(type => operation('readwrite', `${userId}:${type}`).catch(() => {})));
}
export function localCustomerSearch(rows, query) {
  const needle = query.trim().toLocaleLowerCase();
  return (rows || []).filter(c => `${c.name || ''} ${c.mobile || ''} ${c.additional_mobile || ''}`.toLocaleLowerCase().includes(needle)).slice(0, 20);
}
export function isNetworkFailure(error) {
  return typeof navigator !== 'undefined' && !navigator.onLine || /failed to fetch|network|fetch failed|load failed|timeout/i.test(error?.message || '');
}
