const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {test} = require('node:test');

test('automatic cloud backup remains disabled until integration sign-off', () => {
  const source = readFileSync(new URL('../cloud-ui.js', `file://${__filename}`), 'utf8');
  assert.match(source, /const AUTO_BACKUP_ENABLED\s*=\s*false\s*;/);
});
