const assert = require('node:assert/strict');
const {after, test} = require('node:test');
const {doc, getDoc, setDoc} = require('firebase/firestore');
const {initializeTestEnvironment, assertSucceeds, assertFails} = require('@firebase/rules-unit-testing');

const projectId = 'demo-wordscene-backup-rules';
let env;

after(async () => { await env?.cleanup(); });

test('Firestore rules allow the owner and reject other UIDs, anonymous access, and non-state paths', async () => {
  env = await initializeTestEnvironment({projectId, firestore: {host: '127.0.0.1', port: 8080}});
  const payload = {schemaVersion: 1, revision: 1, payload: {version: 5, words: {}, session: null}};
  const owner = env.authenticatedContext('child-a').firestore();
  const other = env.authenticatedContext('child-b').firestore();
  const anonymous = env.unauthenticatedContext().firestore();
  const ownRef = doc(owner, 'users/child-a/wordscene/state');

  await assertSucceeds(setDoc(ownRef, payload));
  await assertSucceeds(getDoc(ownRef));
  await assertFails(getDoc(doc(other, 'users/child-a/wordscene/state')));
  await assertFails(setDoc(doc(other, 'users/child-a/wordscene/state'), payload));
  await assertFails(getDoc(doc(owner, 'users/child-b/wordscene/state')));
  await assertFails(setDoc(doc(owner, 'users/child-b/wordscene/state'), payload));
  await assertFails(getDoc(doc(anonymous, 'users/child-a/wordscene/state')));
  await assertFails(setDoc(doc(anonymous, 'users/child-a/wordscene/state'), payload));
  await assertFails(setDoc(doc(owner, 'users/child-a/wordscene/other'), payload));
});
