const {after, test} = require('node:test');
const {doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, serverTimestamp} = require('firebase/firestore');
const {initializeTestEnvironment, assertSucceeds, assertFails} = require('@firebase/rules-unit-testing');

const projectId = 'demo-wordscene-backup-rules';
let env;
after(async () => { await env?.cleanup(); });

test('full Firestore rules: WordScene ownership, schema, revisions and existing app paths', async () => {
  env = await initializeTestEnvironment({projectId, firestore: {host: '127.0.0.1', port: 8080}});
  const owner = env.authenticatedContext('child-a').firestore();
  const other = env.authenticatedContext('child-b').firestore();
  const anonymous = env.unauthenticatedContext().firestore();
  const path = 'users/child-a/wordscene/state';
  const ownRef = doc(owner, path);
  const payload = {version: 5, words: {}, session: null};
  const state = (revision, overrides = {}) => ({
    schemaVersion: 1, revision, updatedAt: serverTimestamp(),
    clientSavedAt: Date.now(), payload, ...overrides
  });

  await assertFails(setDoc(ownRef, state(2))); // first write must start at 1
  await assertFails(setDoc(ownRef, state(1, {schemaVersion: 2})));
  await assertFails(setDoc(ownRef, state(1, {payload: {version: 5}})));
  await assertFails(setDoc(ownRef, state(1, {extraField: true})));
  await assertSucceeds(setDoc(ownRef, state(1)));
  await assertSucceeds(getDoc(ownRef));
  await assertFails(setDoc(ownRef, state(1))); // no same-revision overwrite
  await assertFails(setDoc(ownRef, state(3))); // no skipped revisions
  await assertSucceeds(setDoc(ownRef, state(2)));
  await assertFails(updateDoc(ownRef, {revision: 3})); // incomplete schema for timestamp rule
  await assertFails(deleteDoc(ownRef));
  await assertFails(getDocs(collection(owner, 'users/child-a/wordscene')));
  await assertFails(getDoc(doc(other, path)));
  await assertFails(setDoc(doc(other, path), state(3)));
  await assertFails(getDoc(doc(owner, 'users/child-b/wordscene/state')));
  await assertFails(setDoc(doc(owner, 'users/child-b/wordscene/state'), state(1)));
  await assertFails(getDoc(doc(anonymous, path)));
  await assertFails(setDoc(doc(anonymous, path), state(1)));
  await assertFails(setDoc(doc(owner, 'users/child-a/wordscene/other'), state(1)));

  await env.withSecurityRulesDisabled(async ctx => {
    const admin = ctx.firestore();
    await setDoc(doc(admin, 'schoolGrades/child-a'), {grades: [5]});
    await setDoc(doc(admin, 'profiles/child-a'), {name: 'Test'});
  });
  for (const segment of ['schoolGrades', 'profiles']) {
    await assertSucceeds(getDoc(doc(owner, segment + '/child-a')));
    await assertFails(getDoc(doc(other, segment + '/child-a')));
    await assertFails(getDoc(doc(anonymous, segment + '/child-a')));
    await assertFails(getDocs(collection(owner, segment)));
    await assertFails(setDoc(doc(owner, segment + '/child-a'), {overwrite: true}));
    await assertFails(deleteDoc(doc(owner, segment + '/child-a')));
  }
});
