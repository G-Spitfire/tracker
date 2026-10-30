import {getFirebaseServices} from "./firebase.js";
import {currentUid} from "./auth.js";
const SDK="https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
// Read only: never accept a UID from UI or URL. Firestore Rules must enforce the same.
export async function loadOwnSchoolGrades(){
  const uid=currentUid();
  if(!uid)throw new Error("Сначала войдите в аккаунт.");
  const {doc,getDoc}=await import(SDK);
  const {db}=getFirebaseServices();
  const snapshot=await getDoc(doc(db,"schoolGrades",uid));
  return snapshot.exists()?{status:"ok",data:snapshot.data()}:{status:"missing",data:null};
}
