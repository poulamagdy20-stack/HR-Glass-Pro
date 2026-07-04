
const DB_NAME = 'hr_glass_pro_local';
const DB_VERSION = 1;
const STORE_QUEUE = 'syncQueue';

function openDb(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains(STORE_QUEUE)){
        db.createObjectStore(STORE_QUEUE, { keyPath:'localId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function queueWrite(action, collectionName, payload){
  const db = await openDb();
  const tx = db.transaction(STORE_QUEUE, 'readwrite');
  const store = tx.objectStore(STORE_QUEUE);
  const item = {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    action,
    collectionName,
    payload,
    createdAt: new Date().toISOString(),
    status: 'pending'
  };
  store.put(item);
  await new Promise((resolve,reject)=>{
    tx.oncomplete=resolve;
    tx.onerror=()=>reject(tx.error);
  });
  return item;
}

export async function getQueue(){
  const db = await openDb();
  const tx = db.transaction(STORE_QUEUE, 'readonly');
  const store = tx.objectStore(STORE_QUEUE);
  const req = store.getAll();
  return await new Promise((resolve,reject)=>{
    req.onsuccess=()=>resolve(req.result || []);
    req.onerror=()=>reject(req.error);
  });
}

export async function removeQueued(localId){
  const db = await openDb();
  const tx = db.transaction(STORE_QUEUE, 'readwrite');
  tx.objectStore(STORE_QUEUE).delete(localId);
  await new Promise((resolve,reject)=>{
    tx.oncomplete=resolve;
    tx.onerror=()=>reject(tx.error);
  });
}

export async function queueCount(){
  return (await getQueue()).length;
}
