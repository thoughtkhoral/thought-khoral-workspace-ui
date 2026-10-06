import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const checker = fileURLToPath(new URL('./check-conversation-contract.mjs', import.meta.url));
const source = fileURLToPath(new URL('../contracts/agent-conversation-v1', import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), 'ui-contract-check-'));
try {
  await cp(source, temporary, { recursive: true });
  const run = () => spawnSync(process.execPath, [checker, temporary], { encoding: 'utf8' });
  assert.equal(run().status, 0);
  const fixture = path.join(temporary, 'fixtures/valid/catalog.json');
  const original = await readFile(fixture);
  await writeFile(fixture, `${original}\n`);
  assert.notEqual(run().status, 0, 'Fixture tampering must fail.');
  await writeFile(fixture, original);
  await writeFile(path.join(temporary, 'extra.json'), '{}');
  assert.notEqual(run().status, 0, 'Unexpected files must fail.');
  await rm(path.join(temporary, 'extra.json'));
  const lockFile = path.join(temporary, 'lock.json');
  await writeFile(lockFile, `${await readFile(lockFile)}\n`);
  assert.notEqual(run().status, 0, 'Lock tampering must fail.');
  console.log('Contract pin tamper checks passed.');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
