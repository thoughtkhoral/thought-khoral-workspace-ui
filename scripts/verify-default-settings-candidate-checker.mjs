import { cp, mkdtemp, readFile, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const checker = fileURLToPath(new URL('./check-default-settings-candidate.mjs', import.meta.url));
const source = fileURLToPath(new URL('../contracts/agent-conversation-v1.1-candidate', import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), 'ui-defaults-candidate-'));
try {
  await cp(source, temporary, { recursive: true });
  const run = () => spawnSync(process.execPath, [checker, temporary], { encoding: 'utf8' });
  assert.equal(run().status, 0, 'Exact candidate must pass');
  const fixture = path.join(temporary, 'fixtures/agent-conversation-v1.1/valid/resolved-settings.json');
  const original = await readFile(fixture);
  await writeFile(fixture, `${original}\n`);
  assert.notEqual(run().status, 0, 'Payload tampering must fail');
  await writeFile(fixture, original);
  const extra = path.join(temporary, 'extra.json');
  await writeFile(extra, '{}'); assert.notEqual(run().status, 0, 'Extra files must fail'); await rm(extra);
  await symlink(fixture, extra); assert.notEqual(run().status, 0, 'Symlinks must fail'); await rm(extra);
  await rm(fixture); assert.notEqual(run().status, 0, 'Missing payload must fail'); await writeFile(fixture, original);
  const lock = path.join(temporary, 'lock.json');
  await writeFile(lock, `${await readFile(lock)}\n`); assert.notEqual(run().status, 0, 'Lock tampering must fail');
  console.log('Candidate exact payload and five tamper cases passed.');
} finally { await rm(temporary, { recursive: true, force: true }); }
