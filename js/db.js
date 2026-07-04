import { db, COMPANY_ID } from '../firebase.js';
import { collection, doc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDocs, serverTimestamp, orderBy, limit } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';
import { state } from './state.js';
import { queueWrite, getQueue, removeQueued, queueCount } from './localdb.js';
const col=(name)=>collection(db,name);

async function resilientAdd(collectionName, payload){
  try{
    return await addDoc(col(collectionName), payload);
  }catch(e){
    if(!navigator.onLine || String(e?.message||'').toLowerCase().includes('offline') || String(e?.code||'').includes('unavailable')){
      await queueWrite('add', collectionName, payload);
      return { id:'local-'+Date.now() };
    }
    throw e;
  }
}

async function resilientSetDoc(collectionName, id, payload){
  try{
    await setDoc(doc(db,collectionName,id), payload);
    return id;
  }catch(e){
    if(!navigator.onLine || String(e?.message||'').toLowerCase().includes('offline') || String(e?.code||'').includes('unavailable')){
      await queueWrite('set', collectionName, { id, data:payload });
      return id;
    }
    throw e;
  }
}

async function resilientUpdate(collectionName, id, payload){
  try{
    await updateDoc(doc(db,collectionName,id), payload);
    return id;
  }catch(e){
    if(!navigator.onLine || String(e?.message||'').toLowerCase().includes('offline') || String(e?.code||'').includes('unavailable')){
      await queueWrite('update', collectionName, { id, data:payload });
      return id;
    }
    throw e;
  }
}

export async function syncOfflineQueue(){
  const items = await getQueue();
  let done = 0;
  for(const item of items){
    try{
      if(item.action === 'add') await addDoc(col(item.collectionName), item.payload);
      if(item.action === 'set') await setDoc(doc(db,item.collectionName,item.payload.id), item.payload.data);
      if(item.action === 'update') await updateDoc(doc(db,item.collectionName,item.payload.id), item.payload.data);
      await removeQueued(item.localId);
      done++;
    }catch(e){
      console.warn('sync item failed', item, e);
      break;
    }
  }
  return { done, remaining: await queueCount() };
}

export { queueCount };
export function uidCode(n){ return 'EMP-'+String(n+1).padStart(4,'0'); }
export async function nextEmployeeCode(){ const snap=await getDocs(query(col('employees'), where('companyId','==',COMPANY_ID))); return uidCode(snap.size); }
export async function saveEmployee(data, id){ if(id){ await resilientUpdate('employees',id, {...data, updatedAt:serverTimestamp()}); return id; } const ref=doc(col('employees')); await resilientSetDoc('employees', ref.id, {...data, companyId:COMPANY_ID, createdAt:serverTimestamp(), updatedAt:serverTimestamp()}); return ref.id; }
export async function deleteEmployee(id){ await deleteDoc(doc(db,'employees',id)); }
export async function saveShift(data,id){ if(id){ await resilientUpdate('shifts',id, {...data, updatedAt:serverTimestamp()}); return id;} const ref=doc(col('shifts')); await resilientSetDoc('shifts',ref.id,{...data, companyId:COMPANY_ID, createdAt:serverTimestamp(), updatedAt:serverTimestamp()}); return ref.id; }
export async function deleteShift(id){ await deleteDoc(doc(db,'shifts',id)); }
export async function saveSettings(data){ await resilientSetDoc('settings',COMPANY_ID,{...data, companyId:COMPANY_ID, updatedAt:serverTimestamp()}); }
export async function addAttendance(data){ await resilientAdd('attendance', {...data, companyId:COMPANY_ID, createdAt:serverTimestamp()}); }
export async function addRequest(data){ await resilientAdd('requests', {...data, companyId:COMPANY_ID, status:'pending', createdAt:serverTimestamp()}); }
export async function updateRequest(id,status){ await resilientUpdate('requests',id,{status, updatedAt:serverTimestamp()}); }
export async function addTransaction(data){ await resilientAdd('transactions', {...data, companyId:COMPANY_ID, createdAt:serverTimestamp(), updatedAt:serverTimestamp()}); }
export async function deleteTransaction(id){ await deleteDoc(doc(db,'transactions',id)); }
export function listenCollection(name, cb){ const q=query(col(name), where('companyId','==',COMPANY_ID)); return onSnapshot(q, s=>cb(s.docs.map(d=>({docId:d.id,...d.data()}))), e=>console.error('listen',name,e)); }
export function listenUserDoc(uid, cb){ return onSnapshot(doc(db,'users',uid), d=>cb(d.exists()?{docId:d.id,...d.data()}:null)); }
export async function createUserProfile(uid, data){ await resilientSetDoc('users',uid,{...data, companyId:COMPANY_ID, updatedAt:serverTimestamp()}); }
export async function backupData(){ const names=['users','employees','shifts','attendance','requests','transactions','settings']; const out={version:'14', exportedAt:new Date().toISOString(), collections:{}}; for(const n of names){ const snap=await getDocs(query(col(n), where('companyId','==',COMPANY_ID))); out.collections[n]=snap.docs.map(d=>({docId:d.id,...d.data()})); } return out; }
export async function restoreData(json){ for(const [name,rows] of Object.entries(json.collections||{})){ for(const row of rows){ const {docId,...data}=row; await setDoc(doc(db,name,docId), data, {merge:true}); } } }
