// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const directory = path.resolve(process.argv[2] ?? fileURLToPath(new URL('../contracts/agent-conversation-v1.1', import.meta.url)));
const candidate = fileURLToPath(new URL('../contracts/agent-conversation-v1.1-candidate', import.meta.url));
const base = fileURLToPath(new URL('../contracts/agent-conversation-v1', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
if (!(await lstat(directory)).isDirectory()) throw new Error('Release root must be a regular directory');
const raw = await readFile(path.join(directory, 'lock.json'));
if (digest(raw) !== 'b7f3ad928c5c17be7e936da4959b7e7e8555bb4ed3602fa62f71a8721f042d8f') throw new Error('Release lock anchor mismatch');
const lock = JSON.parse(raw);
const metadata = {
  profile: 'thought-khoral.agent-conversation.v1',
  repository: 'https://github.com/thoughtkhoral/thought-khoral-contracts',
  tag: 'thought-khoral-agent-conversation-v1.1.0',
  commit: 'f1c8621810c8c121c1aafc8e5a342d6626c4b843',
  archiveFile: 'thought-khoral-agent-conversation-v1.1.0.tar',
  archivePrefix: 'thought-khoral-contracts/',
  archiveUrl: 'https://github.com/thoughtkhoral/thought-khoral-contracts/releases/download/thought-khoral-agent-conversation-v1.1.0/thought-khoral-agent-conversation-v1.1.0.tar',
  archiveSha256: 'b0370e43627ce6044852df75bfbc4b749d904aa9cedcfc558c61bb4e07dc95ff',
};
if (JSON.stringify(Object.keys(lock).sort()) !== JSON.stringify([...Object.keys(metadata), 'files'].sort())
    || Object.entries(metadata).some(([key, value]) => lock[key] !== value)) throw new Error('Release provenance mismatch');
const expectedFiles = new Set(['lock.json', ...Object.keys(lock.files)]);
const expectedDirectories = new Set();
for (const file of expectedFiles) {
  for (let parent = path.posix.dirname(file); parent !== '.'; parent = path.posix.dirname(parent)) expectedDirectories.add(parent);
}
const actual = [];
async function walk(prefix = '') {
  for (const entry of await readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const name = path.posix.join(prefix, entry.name);
    if (entry.isDirectory() && expectedDirectories.has(name)) await walk(name);
    else if (entry.isFile() && expectedFiles.has(name)) actual.push(name);
    else throw new Error(`Unsupported or unexpected release entry: ${name}`);
  }
}
await walk();
if (JSON.stringify(actual.sort()) !== JSON.stringify([...expectedFiles].sort())) throw new Error('Release file set mismatch');
for (const [name, hash] of Object.entries(lock.files)) {
  if (digest(await readFile(path.join(directory, name))) !== hash) throw new Error(`Release payload mismatch: ${name}`);
  if (digest(await readFile(path.join(candidate, name))) !== hash) throw new Error(`Candidate compatibility mismatch: ${name}`);
}
const baseLock = JSON.parse(await readFile(path.join(base, 'lock.json')));
for (const [name, hash] of Object.entries(baseLock.files)) {
  const translated = name.replace(/^schemas\//, 'schemas/agent-conversation-v1/').replace(/^fixtures\//, 'fixtures/agent-conversation-v1/');
  if (lock.files[translated] !== hash || digest(await readFile(path.join(base, name))) !== hash) throw new Error(`Published v1 compatibility mismatch: ${name}`);
}
console.log(`Verified ${Object.keys(lock.files).length} released defaults files at ${lock.commit}; candidate and published v1 payloads preserved.`);
