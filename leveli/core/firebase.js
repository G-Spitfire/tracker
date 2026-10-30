// Leveli core: Firebase SDK adapter. No user data or credentials are stored here.
const SDK = "https://www.gstatic.com/firebasejs/10.14.1/";
let app, auth, db;
export async function initializeFirebase(config) {
  if (!config || !config.apiKey || !config.projectId || !config.appId) {
    throw new Error("Не задана конфигурация Firebase.");
  }
  const [{initializeApp,getApps,getApp}, authSdk, firestoreSdk] = await Promise.all([
    import(SDK+"firebase-app.js"),import(SDK+"firebase-auth.js"),import(SDK+"firebase-firestore.js")
  ]);
  app=getApps().length?getApp():initializeApp(config);
  auth=authSdk.getAuth(app);
  db=firestoreSdk.getFirestore(app);
  return {auth,db};
}
export function getFirebaseServices(){
  if(!auth||!db)throw new Error("Firebase ещё не инициализирован.");
  return {auth,db};
}
