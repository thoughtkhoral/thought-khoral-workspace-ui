import { createHash } from 'node:crypto';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const directory = path.resolve(process.argv[2] ?? fileURLToPath(new URL('../contracts/agent-conversation-v1.1-candidate', import.meta.url)));
const released = fileURLToPath(new URL('../contracts/agent-conversation-v1', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
if ((await lstat(directory)).isSymbolicLink()) throw new Error('Candidate directory symlink');
const lockedBytes = await readFile(path.join(directory, 'lock.json'));
if (digest(lockedBytes) !== '7914d32eae2487879a68405b5095a6b9aa91355f87529c43f4055844821902a9') throw new Error('Candidate lock changed');
const lock = JSON.parse(lockedBytes);
if (lock.status !== 'unreleased-local-candidate' || lock.proposedTag !== 'thought-khoral-agent-conversation-v1.1.0' || lock.commit !== '1ea828f28725ddaaefa21d083473f9abbd777975' || lock.archiveSha256 !== 'fab59a486f6498b843467202debcb0768403bd57ba7dda41be2a01e5f23fdda8') throw new Error('Candidate provenance changed');
const actual = [];
async function walk(prefix = '') {
  for (const entry of await readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const name = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) await walk(name);
    else if (entry.isFile()) actual.push(name);
    else throw new Error(`Unsupported candidate file: ${name}`);
  }
}
await walk();
if (JSON.stringify(actual.sort()) !== JSON.stringify(['lock.json', ...Object.keys(lock.files)].sort())) throw new Error('Candidate file set changed');
for (const [name, sha] of Object.entries(lock.files)) if (digest(await readFile(path.join(directory, name))) !== sha) throw new Error(`Candidate digest mismatch: ${name}`);
const baseLock = JSON.parse(await readFile(path.join(released, 'lock.json')));
for (const [name, sha] of Object.entries(baseLock.files)) {
  const candidateName = name.replace(/^schemas\//, 'schemas/agent-conversation-v1/').replace(/^fixtures\//, 'fixtures/agent-conversation-v1/');
  if (lock.files[candidateName] !== sha || digest(await readFile(path.join(released, name))) !== sha) throw new Error(`Published v1 bytes differ: ${name}`);
}
console.log(`Verified ${Object.keys(lock.files).length} unreleased candidate files and ${Object.keys(baseLock.files).length} unchanged released files at ${lock.commit}.`);
