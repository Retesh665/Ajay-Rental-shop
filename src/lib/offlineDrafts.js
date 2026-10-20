// Multiple user-scoped drafts. Uses the original IndexedDB database so old drafts migrate safely.
const DB = 'rentdesk-rental-drafts-v1';
const STORE = 'drafts';
function openDB() {
  return new Promise((resolve,reject)=>{
    if (typeof indexedDB === 'undefined') return reject(new Error('Local storage is unavailable.'));
    const r=indexedDB.open(DB,1);
    r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE);};
    r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error);
  });
}
async function operation(userId,mode,work) {
  if (!userId) throw new Error('Sign in before using offline drafts.');
  const db=await openDB();
  try {return await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,mode), store=tx.objectStore(STORE);
    let result;
    const r=work(store,userId);
    r.onsuccess=()=>{result=r.result;};
    r.onerror=()=>reject(r.error);
    tx.oncomplete=()=>resolve(result);
    tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });} finally {db.close();}
}
const key=(uid,id)=>`${uid}::${id}`;
export async function listRentalDrafts(uid) {
  const all=await operation(uid,'readonly',s=>s.getAll());
  return (all||[]).filter(x=>x.ownerId===uid).sort((a,b)=>b.savedAt.localeCompare(a.savedAt));
}
export async function saveRentalDraft(uid,draft) {
  const id=draft.id||crypto.randomUUID();
  const record={...draft,id,ownerId:uid,savedAt:new Date().toISOString()};
  await operation(uid,'readwrite',s=>s.put(record,key(uid,id)));
  return record;
}
// Machine locks are scoped to the signed-in account and this browser's IndexedDB.
// Checking and saving in one readwrite transaction prevents two local saves from racing.
export function machineDraftConflicts(drafts, machineIds, ownDraftId = null) {
  const ids = new Set(machineIds.filter(Boolean).map(String));
  return drafts.filter(d => d.type !== 'return' && d.id !== ownDraftId &&
    (d.items || []).some(item => ids.has(String(item.machineId))));
}
export async function saveStartRentalDraftLocked(uid, draft) {
  if (!uid) throw new Error('Sign in before saving offline drafts.');
  const ids = (draft.items || []).map(item => item.machineId);
  if (!ids.length || ids.some(id => !id) || new Set(ids.map(String)).size !== ids.length) {
    throw new Error('Choose unique machines before saving this draft.');
  }
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const id = draft.id || crypto.randomUUID();
      const record = { ...draft, id, type: 'start', ownerId: uid, savedAt: new Date().toISOString() };
      let error = null;
      const get = store.getAll();
      get.onsuccess = () => {
        const conflicts = machineDraftConflicts((get.result || []).filter(d => d.ownerId === uid), ids, id);
        if (conflicts.length) {
          error = new Error('One or more machines are already in another saved rental draft on this device. Remove them or delete the other draft first.');
          tx.abort();
          return;
        }
        store.put(record, key(uid, id));
      };
      get.onerror = () => { error = get.error; tx.abort(); };
      tx.oncomplete = () => resolve(record);
      tx.onabort = () => reject(error || tx.error || new Error('Could not save draft.'));
      tx.onerror = () => reject(error || tx.error);
    });
  } finally { db.close(); }
}
export async function deleteRentalDraft(uid,id) {
  if (!id) throw new Error('Select a draft to delete.');
  await operation(uid,'readwrite',s=>s.delete(key(uid,id)));
}
// Migrate existing single-draft entries into the multi-draft list.
export async function readRentalDraft(uid) {
  const drafts=await listRentalDrafts(uid);
  if(drafts.length) return drafts[0];
  const legacy=await operation(uid,'readonly',s=>s.get(uid));
  if(!legacy)return null;
  const migrated=await saveRentalDraft(uid,legacy);
  await operation(uid,'readwrite',s=>s.delete(uid));
  return migrated;
}
