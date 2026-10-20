// Multiple user-scoped drafts. Uses the original IndexedDB database so old drafts migrate safely.
const DB = 'rentdesk-return-drafts-v1';
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
export async function listReturnDrafts(uid) {
  const all=await operation(uid,'readonly',s=>s.getAll());
  return (all||[]).filter(x=>x.ownerId===uid).sort((a,b)=>b.savedAt.localeCompare(a.savedAt));
}
export async function saveReturnDraft(uid,draft) {
  const id=draft.id||crypto.randomUUID();
  const record={...draft,id,ownerId:uid,savedAt:new Date().toISOString()};
  await operation(uid,'readwrite',s=>s.put(record,key(uid,id)));
  return record;
}
export async function deleteReturnDraft(uid,id) {
  if (!id) throw new Error('Select a draft to delete.');
  await operation(uid,'readwrite',s=>s.delete(key(uid,id)));
}
// Migrate existing single-draft entries into the multi-draft list.
export async function readReturnDraft(uid) {
  const drafts=await listReturnDrafts(uid);
  if(drafts.length) return drafts[0];
  const legacy=await operation(uid,'readonly',s=>s.get(uid));
  if(!legacy)return null;
  const migrated=await saveReturnDraft(uid,legacy);
  await operation(uid,'readwrite',s=>s.delete(uid));
  return migrated;
}
