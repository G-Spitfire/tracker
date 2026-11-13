const NAME='moya-kapa-v2';let connection;
export function openDB(){if(connection)return connection;connection=new Promise((resolve,reject)=>{const req=indexedDB.open(NAME,1);req.onupgradeneeded=()=>{const db=req.result;db.createObjectStore('sessions',{keyPath:'id'});db.createObjectStore('nights',{keyPath:'date'});db.createObjectStore('meta',{keyPath:'key'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});return connection;}
export async function all(store){const db=await openDB();return new Promise((resolve,reject)=>{const req=db.transaction(store).objectStore(store).getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
export async function get(store,key){const db=await openDB();return new Promise((resolve,reject)=>{const req=db.transaction(store).objectStore(store).get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
export async function put(store,value){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
export async function remove(store,key){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).delete(key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
export async function replaceAll(data){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(['sessions','nights','meta'],'readwrite');for(const name of ['sessions','nights','meta'])tx.objectStore(name).clear();for(const s of data.sessions)tx.objectStore('sessions').put(s);for(const n of data.nights)tx.objectStore('nights').put(n);tx.objectStore('meta').put({key:'settings',goal:data.settings.goal});tx.objectStore('meta').put({key:'active',start:null});tx.objectStore('meta').put({key:'migration',done:true});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}

// Read and clear the active timer in the same transaction as the saved session.
// Concurrent tabs can finish a particular timer only once.
export async function finishSession(session){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['sessions','meta'],'readwrite');
    let saved=false;
    const meta=tx.objectStore('meta'),req=meta.get('active');
    req.onsuccess=()=>{
      if(req.result?.start!==session.start)return;
      tx.objectStore('sessions').put(session);
      meta.put({key:'active',start:null});
      saved=true;
    };
    tx.oncomplete=()=>resolve(saved);
    tx.onabort=()=>reject(tx.error||new Error('Сохранение отменено'));
    tx.onerror=()=>reject(tx.error);
  });
}
