const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {test} = require('node:test');

test('automatic cloud backup is enabled after Firebase rules verification', () => {
  const source = readFileSync(new URL('../cloud-ui.js', `file://${__filename}`), 'utf8');
  assert.match(source, /const AUTO_BACKUP_ENABLED\s*=\s*true\s*;/);
});
