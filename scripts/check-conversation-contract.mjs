import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const directory = path.resolve(process.argv[2] ?? fileURLToPath(new URL('../contracts/agent-conversation-v1', import.meta.url)));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const expectedLock = '6e579a2624c79dc8472951a95c74a8b460b386e396845c75816014b1b6c86e40';
const lockedBytes = await readFile(path.join(directory, 'lock.json'));
if (digest(lockedBytes) !== expectedLock) throw new Error('Conversation release lock changed.');
const lock = JSON.parse(lockedBytes);
const actualFiles = [];
async function walk(prefix = '') {
  for (const entry of await readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const name = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) await walk(name);
    else if (entry.isFile()) actualFiles.push(name);
    else throw new Error(`Unsupported contract file: ${name}`);
  }
}
await walk();
const expectedFiles = ['lock.json', ...Object.keys(lock.files)].sort();
if (JSON.stringify(actualFiles.sort()) !== JSON.stringify(expectedFiles)) throw new Error('Conversation release file set changed.');
for (const [name, sha256] of Object.entries(lock.files)) {
  if (digest(await readFile(path.join(directory, name))) !== sha256) throw new Error(`Conversation release digest mismatch: ${name}`);
}
console.log(`Verified ${Object.keys(lock.files).length} exact ${lock.tag} files at ${lock.commit}.`);
