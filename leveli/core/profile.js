import {getFirebaseServices} from "./firebase.js";
const SDK="https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
// Read-only: profile document must be provisioned separately with rules.
export async function loadOwnProfile(){
  const {auth,db}=getFirebaseServices();
  const uid=auth.currentUser?.uid;
  if(!uid)throw new Error("Требуется вход в аккаунт");
  const {doc,getDoc}=await import(SDK);
  const snapshot=await getDoc(doc(db,"profiles",uid));
  if(!snapshot.exists())return {status:"missing",profile:null};
  const data=snapshot.data();
  return {status:"ok",profile:{
    name:typeof data.name==="string"?data.name.trim().slice(0,50):"",
    theme:typeof data.theme==="string"?data.theme:null
  }};
}
