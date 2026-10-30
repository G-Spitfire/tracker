import {getFirebaseServices} from "./firebase.js";
const SDK="https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
export async function signIn(email,password){
  if(!email||!password)throw new Error("Введите email и пароль.");
  const {signInWithEmailAndPassword}=await import(SDK);
  return signInWithEmailAndPassword(getFirebaseServices().auth,email.trim(),password);
}
export async function signOutUser(){
  const {signOut}=await import(SDK);
  return signOut(getFirebaseServices().auth);
}
export async function observeUser(callback){
  const {onAuthStateChanged}=await import(SDK);
  return onAuthStateChanged(getFirebaseServices().auth,callback);
}
export function currentUid(){
  return getFirebaseServices().auth.currentUser?.uid??null;
}
