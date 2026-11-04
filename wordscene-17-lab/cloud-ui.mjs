// The laboratory can connect only to loopback emulators.
import {initializeApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getAuth,connectAuthEmulator,inMemoryPersistence,setPersistence,signInWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import * as sdk from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';

if (!['localhost', '127.0.0.1'].includes(location.hostname)) throw Error('Local emulator required');
const app = initializeApp({projectId:'demo-wordscene17', apiKey:'demo-wordscene17'}, 'wordscene-17-lab');
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099');
await setPersistence(auth, inMemoryPersistence);
const db = sdk.getFirestore(app);
sdk.connectFirestoreEmulator(db, '127.0.0.1', 8080);

export async function open(email, password) {
 const {user} = await signInWithEmailAndPassword(auth, email, password);
 return {
  uid: () => auth.currentUser?.uid,
  signedInUid: user.uid,
  transport: window.WS17Firestore.create({db, sdk, auth}),
  close: () => signOut(auth)
 };
}
