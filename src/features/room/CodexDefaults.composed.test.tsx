import { Suspense } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { RoomPage } from './RoomPage';
import { CONTRACT_VERSION } from '../../api';
import { CODEX_AGENT_ID, PROFILE_VERSION, type AcceptedTurn, type SelectedSettings, type TurnRequest } from './conversationApi';
import ready from './__fixtures__/ready-view.json';
import catalog from './__fixtures__/catalog.json';
import acceptedFixture from './__fixtures__/accepted-turn.json';
import type { RoomWebSocket } from './useRoomSocket';

class SyntheticSocket extends EventTarget implements RoomWebSocket {
  readyState = 0;
  sent: string[] = [];
  send(value: string) { this.sent.push(value); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.dispatchEvent(new Event('open')); }
  receive(data: unknown) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) })); }
}
const environment = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
// The hook exists only to pause the real filesystem publication boundary in tests.
async function publishHandshake(path: string, data: string, afterOpen = async () => {}) {
  const fsModule = 'node:fs/promises';
  const fs = await import(fsModule) as {
    open: (path: string, flag: string) => Promise<{ writeFile: (data: string) => Promise<void>; close: () => Promise<void> }>;
    link: (existing: string, target: string) => Promise<void>; unlink: (path: string) => Promise<void>;
  };
  const staging = `${path}.staging-${crypto.randomUUID()}`;
  const file = await fs.open(staging, 'wx');
  let closed = false;
  try {
    await afterOpen(); await file.writeFile(data); await file.close(); closed = true;
    // Same-directory hard-link publication is atomic and refuses an existing target.
    await fs.link(staging, path);
  } finally {
    try { if (!closed) await file.close(); } finally { await fs.unlink(staging); }
  }
}
// Test-only filesystem handshake: fresh files in the fixture-owned evidence directory.
async function displayBarrier(env: Record<string, string | undefined>, display: unknown, timeout = 10000, afterDisplayOpen = async () => {}) {
  const displayFile = env.CODEX_DEFAULTS_DISPLAY_EVIDENCE_FILE;
  const releaseFile = env.CODEX_DEFAULTS_SEND_RELEASE_FILE;
  if (!displayFile && !releaseFile) return;
  if (!displayFile || !releaseFile || displayFile === releaseFile) throw new Error('Incomplete display/send barrier');
  const fsModule = 'node:fs/promises'; const pathModule = 'node:path';
  const fs = await import(fsModule) as { access: (path: string) => Promise<void>; writeFile: (path: string, data: string, options: { flag: string }) => Promise<void>; readFile: (path: string, encoding: string) => Promise<string> };
  const { dirname, isAbsolute } = await import(pathModule) as { dirname: (path: string) => string; isAbsolute: (path: string) => boolean };
  if (![displayFile, releaseFile].every(path => isAbsolute(path) && dirname(path) === dirname(env.CODEX_DEFAULTS_EVIDENCE_FILE ?? ''))) throw new Error('Barrier must share owned evidence directory');
  try { await fs.access(releaseFile); throw new Error('Send release already exists'); }
  catch (error) { if ((error as { code?: string }).code !== 'ENOENT') throw error; }
  await publishHandshake(displayFile, `${JSON.stringify(display)}\n`, afterDisplayOpen);
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const release = await fs.readFile(releaseFile, 'utf8');
      if (release !== '{"release":true}\n') throw new Error('Invalid send release');
      return;
    } catch (error) { if ((error as { code?: string }).code !== 'ENOENT') throw error; }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Display/send barrier timed out');
}
// Task 4 launches one fresh process with generated synthetic credentials and room.
async function captureComposedEvidence(env: Record<string, string | undefined>) {
  const origin = env.CODEX_DEFAULTS_BROKER_ORIGIN;
  const roomId = env.CODEX_DEFAULTS_ROOM_ID;
  const token = env.CODEX_DEFAULTS_TOKEN;
  const phase = env.CODEX_DEFAULTS_PHASE;
  const evidenceFile = env.CODEX_DEFAULTS_EVIDENCE_FILE;
  const boolean = (name: string) => {
    const value = env[name];
    if (value !== 'true' && value !== 'false') throw new Error(`Missing synthetic boolean ${name}`);
    return value === 'true';
  };
  if (!origin || !roomId || !token || !evidenceFile || !['initial', 'restored', 'new'].includes(phase ?? '')) throw new Error('Incomplete composed synthetic environment');
  const modelSelection = boolean('CODEX_DEFAULTS_MODEL_SELECTION');
  const reasoningEffort = boolean('CODEX_DEFAULTS_REASONING_EFFORT');
  const capabilities = { modelSelection, reasoningEffort };
  const realFetch = globalThis.fetch;
  let defaultsReads = 0; let catalogReads = 0;
  let submitted: TurnRequest | null = null; let acceptedTurn: AcceptedTurn | null = null;
  let rejection: { status: number; profileError: { profileVersion: string; requestId: string | null; code: string; message: string } } | null = null;
  let submissions = 0;
  const expectedRejection = env.CODEX_DEFAULTS_EXPECT_REJECTION;
  if (expectedRejection && !['invalid_task_input', 'conversation_stale'].includes(expectedRejection)) throw new Error('Unexpected synthetic rejection code');
  vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
    const pathname = new URL(String(url)).pathname;
    if (pathname.endsWith('/defaults')) defaultsReads++;
    if (pathname.endsWith('/models')) catalogReads++;
    if (pathname.endsWith('/turns') && init?.body) { submitted = JSON.parse(String(init.body)); submissions++; }
    const response = await realFetch(url, init);
    if (pathname.endsWith('/turns') && response.status === 202) acceptedTurn = await response.clone().json();
    else if (pathname.endsWith('/turns')) rejection = { status: response.status, profileError: await response.clone().json() };
    return response;
  });
  const socket = new SyntheticSocket();
  const createSocket = vi.fn(() => socket);
  try {
    await import('./ChatStream');
    render(<Suspense fallback={null}><RoomPage roomId={roomId} participantRole="human" socketUrl={`${origin}/ws`}
      getAccessToken={async () => token} createSocket={createSocket} conversationAdmission={{
        profileVersion: PROFILE_VERSION, agentId: CODEX_AGENT_ID, conversationScope: 'room', invocation: 'explicitly-addressed',
        delivery: 'room', roomHistory: 'baseline-and-delta', ...capabilities
      }} /></Suspense>);
    fireEvent.click(screen.getByRole('button', { name: 'Enter room' }));
    await waitFor(() => expect(createSocket).toHaveBeenCalledOnce());
    act(() => socket.open());
    act(() => socket.receive({ jsonrpc: '2.0', method: 'room.participants.updated', params: {
      contractVersion: CONTRACT_VERSION, roomId, participants: [{ id: CODEX_AGENT_ID, role: 'agent', displayName: 'Codex Agent', online: true }]
    }}));
    await screen.findByRole('combobox', { name: 'Message' });
    const supports = modelSelection || reasoningEffort;
    if (supports) await screen.findByText(/Selected for next turn: model-/, {}, { timeout: 10000 });
    // A neither-capability restored read still has to complete before invocation.
    await waitFor(() => expect((screen.getByRole('button', { name: 'New session' }) as HTMLButtonElement).disabled).toBe(false), { timeout: 10000 });
    if (phase === 'new') {
      fireEvent.click(screen.getByRole('button', { name: 'New session' }));
      fireEvent.click(screen.getByRole('checkbox', { name: /shared thread/i }));
      if (supports) await screen.findByText(/Selected for next turn: model-/, {}, { timeout: 10000 });
    }
    let displayedSettings: SelectedSettings | null = null;
    if (supports) {
      const selectedElement = screen.getByText(/Selected for next turn:/);
      const text = selectedElement.textContent ?? '';
      const match = /^Selected for next turn: (\S+) \/ (\S+)/.exec(text);
      expect(match).not.toBeNull();
      displayedSettings = { model: match![1]!, reasoningEffort: match![2]!, catalogRevision: selectedElement.dataset.catalogRevision ?? '' };
      expect(displayedSettings.catalogRevision).not.toBe('');
      if (!modelSelection) expect(screen.getByLabelText('Model (read only)').textContent).toContain(displayedSettings.model);
      if (!reasoningEffort) expect(screen.getByLabelText('Reasoning effort (read only)').textContent).toContain(displayedSettings.reasoningEffort);
    } else expect(screen.queryByText(/Selected for next turn:/)).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Message' }), { target: { value: '@codex-agent synthetic defaults evidence' } });
    await displayBarrier(env, { phase, capabilities, displayedSettings, prompt: '@codex-agent synthetic defaults evidence' });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    // A raw 202 clone is not evidence of UI acceptance. The composer clears only
    // after strict schema/binding validation and the hook's successful acceptance.
    await waitFor(() => {
      const prompt = screen.getByRole('combobox', { name: 'Message' }) as HTMLTextAreaElement;
      expect(prompt.value === '' || Boolean(screen.queryByRole('alert'))).toBe(true);
    }, { timeout: 10000 });
    const prompt = screen.getByRole('combobox', { name: 'Message' }) as HTMLTextAreaElement;
    if (expectedRejection) {
      await screen.findByRole('button', { name: 'Refresh settings' });
      expect(prompt.value).toBe('@codex-agent synthetic defaults evidence');
      // Invocation is blocked by the real submission guard; the shared room
      // composer still has an enabled button for ordinary room messages.
      const beforeRepeat = submissions;
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send message' })); });
      const sendBlocked = submissions === beforeRepeat;
      expect(sendBlocked).toBe(true); expect(submissions).toBe(1);
      expect(prompt.value).toBe('@codex-agent synthetic defaults evidence');
      expect(screen.getByRole('button', { name: 'Refresh settings' })).toBeTruthy();
      const unavailableSelection = screen.getByText(/Selected for next turn:/);
      expect(unavailableSelection.textContent).toBe('Selected for next turn: choose a model and reasoning effort');
      expect(unavailableSelection.dataset.catalogRevision).toBeUndefined();
      expect(socket.sent.map(value => JSON.parse(value).method).filter(method => method === 'chat.send')).toHaveLength(0);
      expect(acceptedTurn).toBeNull(); expect(submissions).toBe(1);
      const refused = rejection as { status: number; profileError: { profileVersion: string; requestId: string | null; code: string; message: string } } | null;
      expect(refused).not.toBeNull(); expect(refused!.status).toBeGreaterThanOrEqual(400); expect(refused!.status).toBeLessThan(500);
      expect(Object.keys(refused!.profileError).sort()).toEqual(['code', 'message', 'profileVersion', 'requestId']);
      expect(refused!.profileError.profileVersion).toBe(PROFILE_VERSION); expect(refused!.profileError.code).toBe(expectedRejection);
      expect((submitted as TurnRequest | null)?.settings).toEqual(displayedSettings);
      expect(defaultsReads).toBe(phase === 'restored' ? 0 : 1); expect(catalogReads).toBe(1);
      // Closed safe protocol error from actual HTTP; contains no transport headers.
      const fileSystemModule = 'node:fs/promises';
      const { writeFile } = await import(fileSystemModule) as { writeFile: (path: string, data: string, options: { flag: string }) => Promise<void> };
      await writeFile(evidenceFile, `${JSON.stringify({ phase, capabilities, displayedSettings, submittedSettings: (submitted as TurnRequest | null)?.settings, rejection: refused,
        promptRetained: true, refreshRequired: true, sendBlocked, defaultsReads, catalogReads })}\n`, { flag: 'wx' });
      fireEvent.click(screen.getByRole('button', { name: 'Leave room' }));
      return;
    }
    if (prompt.value !== '') throw new Error('Real UI rejected composed submission');
    expect((screen.getByRole('button', { name: 'New session' }) as HTMLButtonElement).disabled).toBe(true);
    expect(acceptedTurn).not.toBeNull();
    const request = submitted as TurnRequest | null;
    const accepted = acceptedTurn as AcceptedTurn | null;
    const submittedSettings = request?.settings ?? null;
    if (displayedSettings) {
      expect(submittedSettings?.model).toBe(displayedSettings.model); expect(submittedSettings?.reasoningEffort).toBe(displayedSettings.reasoningEffort);
      expect(submittedSettings).toEqual(displayedSettings);
      expect(accepted!.selectedSettings).toEqual(submittedSettings);
    } else { expect(submittedSettings).toBeNull(); expect(defaultsReads).toBe(0); expect(catalogReads).toBe(0); }
    expect(socket.sent.map(value => JSON.parse(value).method).filter(method => method === 'chat.send')).toHaveLength(0);
    // Only the opt-in Node test imports filesystem APIs; no browser bundle or Node typings dependency.
    const fileSystemModule = 'node:fs/promises';
    const { writeFile } = await import(fileSystemModule) as { writeFile: (path: string, data: string, options: { flag: string }) => Promise<void> };
    await writeFile(evidenceFile, `${JSON.stringify({ phase, capabilities, displayedSettings, submittedSettings, acceptedTurn: accepted, defaultsReads, catalogReads })}\n`, { flag: 'wx' });
    fireEvent.click(screen.getByRole('button', { name: 'Leave room' }));
  } finally { cleanup(); vi.unstubAllGlobals(); socket.close(); }
}
it.skipIf(environment.RUN_CODEX_DEFAULTS_COMPOSED !== '1')('captures a visible real-HTTP RoomPage defaults submission', async () => {
  await captureComposedEvidence(environment);
}, 20000);

it.each(['wrong room', 'unknown private field'] as const)('writes no composed evidence for rejected 202 with %s', async invalid => {
  const moduleName = 'node:fs/promises';
  const { mkdtemp, access, rm } = await import(moduleName) as {
    mkdtemp: (prefix: string) => Promise<string>; access: (path: string) => Promise<void>;
    rm: (path: string, options: { recursive: boolean; force: boolean }) => Promise<void>;
  };
  const osModule = 'node:os'; const pathModule = 'node:path';
  const { tmpdir } = await import(osModule) as { tmpdir: () => string };
  const { join } = await import(pathModule) as { join: (...parts: string[]) => string };
  const temporary = await mkdtemp(join(tmpdir(), 'codex-defaults-invalid-')); const evidenceFile = join(temporary, 'evidence.json');
  const http = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (init?.body) return new Response(JSON.stringify({ ...acceptedFixture, ...(invalid === 'wrong room' ? { roomId: '00000001-1111-4111-8111-000000000001' } : { nativeThreadId: 'synthetic-private' }) }), { status: 202 });
    return new Response(JSON.stringify(String(url).includes('/models') ? catalog : ready));
  });
  vi.stubGlobal('fetch', http);
  try {
    expect(temporary.startsWith(join(tmpdir(), 'codex-defaults-invalid-'))).toBe(true);
    await expect(captureComposedEvidence({ CODEX_DEFAULTS_BROKER_ORIGIN: 'http://broker.example.test', CODEX_DEFAULTS_ROOM_ID: ready.roomId,
      CODEX_DEFAULTS_TOKEN: 'synthetic-token', CODEX_DEFAULTS_PHASE: 'restored', CODEX_DEFAULTS_MODEL_SELECTION: 'true',
      CODEX_DEFAULTS_REASONING_EFFORT: 'true', CODEX_DEFAULTS_EVIDENCE_FILE: evidenceFile })).rejects.toThrow('Real UI rejected composed submission');
    expect(http.mock.calls.some(([, init]) => Boolean(init?.body))).toBe(true);
    await expect(access(evidenceFile)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally { cleanup(); vi.unstubAllGlobals(); await rm(temporary, { recursive: true, force: true }); }
}, 15000);

it('refuses incomplete, stale and timed-out display/send handshakes', async () => {
  await expect(displayBarrier({ CODEX_DEFAULTS_DISPLAY_EVIDENCE_FILE: '/missing/display' }, {})).rejects.toThrow('Incomplete display/send barrier');
  const fsModule = 'node:fs/promises'; const osModule = 'node:os'; const pathModule = 'node:path';
  const fs = await import(fsModule) as { mkdtemp: (prefix: string) => Promise<string>; writeFile: (path: string, data: string) => Promise<void>; access: (path: string) => Promise<void>; rm: (path: string, options: { recursive: boolean; force: boolean }) => Promise<void> };
  const { tmpdir } = await import(osModule) as { tmpdir: () => string }; const { join } = await import(pathModule) as { join: (...parts: string[]) => string };
  const dir = await fs.mkdtemp(join(tmpdir(), 'codex-barrier-'));
  const env = { CODEX_DEFAULTS_DISPLAY_EVIDENCE_FILE: join(dir, 'display.json'), CODEX_DEFAULTS_SEND_RELEASE_FILE: join(dir, 'release.json'), CODEX_DEFAULTS_EVIDENCE_FILE: join(dir, 'result.json') };
  try {
    await fs.writeFile(env.CODEX_DEFAULTS_SEND_RELEASE_FILE, '{"release":true}\n');
    await expect(displayBarrier(env, {}, 25)).rejects.toThrow('already exists');
    await expect(fs.access(env.CODEX_DEFAULTS_DISPLAY_EVIDENCE_FILE)).rejects.toMatchObject({ code: 'ENOENT' });
    await fs.rm(env.CODEX_DEFAULTS_SEND_RELEASE_FILE, { recursive: false, force: false });
    await expect(displayBarrier(env, {}, 25)).rejects.toThrow('timed out');
    await expect(fs.access(env.CODEX_DEFAULTS_EVIDENCE_FILE)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(displayBarrier(env, {}, 25)).rejects.toMatchObject({ code: 'EEXIST' });
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

it('publishes complete display evidence only after a paused writer finishes and rejects a completed invalid release', async () => {
  const fsModule = 'node:fs/promises'; const osModule = 'node:os'; const pathModule = 'node:path';
  const fs = await import(fsModule) as { mkdtemp: (prefix: string) => Promise<string>; access: (path: string) => Promise<void>; readFile: (path: string, encoding: string) => Promise<string>; readdir: (path: string) => Promise<string[]>; rm: (path: string, options: { recursive: boolean; force: boolean }) => Promise<void> };
  const { tmpdir } = await import(osModule) as { tmpdir: () => string }; const { join } = await import(pathModule) as { join: (...parts: string[]) => string };
  const dir = await fs.mkdtemp(join(tmpdir(), 'codex-display-atomic-'));
  const env = { CODEX_DEFAULTS_DISPLAY_EVIDENCE_FILE: join(dir, 'display.json'), CODEX_DEFAULTS_SEND_RELEASE_FILE: join(dir, 'release.json'), CODEX_DEFAULTS_EVIDENCE_FILE: join(dir, 'result.json') };
  let opened!: () => void; let resume!: () => void;
  const atOpen = new Promise<void>(resolve => { opened = resolve; }); const resumed = new Promise<void>(resolve => { resume = resolve; });
  const barrier = displayBarrier(env, { displayedSettings: 'synthetic complete display' }, 2000, async () => { opened(); await resumed; });
  const rejected = expect(barrier).rejects.toThrow('Invalid send release');
  try {
    await atOpen;
    // This observation is deliberately between exclusive open and the write.
    const visibleBeforeWrite = await fs.access(env.CODEX_DEFAULTS_DISPLAY_EVIDENCE_FILE).then(() => true, () => false);
    resume();
    await waitFor(async () => expect(await fs.readFile(env.CODEX_DEFAULTS_DISPLAY_EVIDENCE_FILE, 'utf8')).toBe('{"displayedSettings":"synthetic complete display"}\n'));
    await publishHandshake(env.CODEX_DEFAULTS_SEND_RELEASE_FILE, '{"release":false}\n');
    await rejected;
    expect(visibleBeforeWrite).toBe(false);
    expect((await fs.readdir(dir)).sort()).toEqual(['display.json', 'release.json']);
    await expect(fs.access(env.CODEX_DEFAULTS_EVIDENCE_FILE)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally { resume(); await barrier.catch(() => {}); await fs.rm(dir, { recursive: true, force: true }); }
});

it('waits across a paused release publisher and never replaces a completed handshake', async () => {
  const fsModule = 'node:fs/promises'; const osModule = 'node:os'; const pathModule = 'node:path';
  const fs = await import(fsModule) as { mkdtemp: (prefix: string) => Promise<string>; access: (path: string) => Promise<void>; readFile: (path: string, encoding: string) => Promise<string>; readdir: (path: string) => Promise<string[]>; rm: (path: string, options: { recursive: boolean; force: boolean }) => Promise<void> };
  const { tmpdir } = await import(osModule) as { tmpdir: () => string }; const { join } = await import(pathModule) as { join: (...parts: string[]) => string };
  const dir = await fs.mkdtemp(join(tmpdir(), 'codex-release-atomic-'));
  const env = { CODEX_DEFAULTS_DISPLAY_EVIDENCE_FILE: join(dir, 'display.json'), CODEX_DEFAULTS_SEND_RELEASE_FILE: join(dir, 'release.json'), CODEX_DEFAULTS_EVIDENCE_FILE: join(dir, 'result.json') };
  let opened!: () => void; let resume!: () => void;
  const atOpen = new Promise<void>(resolve => { opened = resolve; }); const resumed = new Promise<void>(resolve => { resume = resolve; });
  let outcome = 'pending';
  const barrier = displayBarrier(env, {}, 2000).then(() => { outcome = 'resolved'; }, () => { outcome = 'rejected'; });
  try {
    await waitFor(async () => { await fs.access(env.CODEX_DEFAULTS_DISPLAY_EVIDENCE_FILE); });
    const publishing = publishHandshake(env.CODEX_DEFAULTS_SEND_RELEASE_FILE, '{"release":true}\n', async () => { opened(); await resumed; });
    await atOpen;
    const visibleBeforeWrite = await fs.access(env.CODEX_DEFAULTS_SEND_RELEASE_FILE).then(() => true, () => false);
    // Allow several actual consumer polls while the publisher is held.
    await new Promise(resolve => setTimeout(resolve, 80)); const whilePaused = outcome;
    resume(); await publishing; await barrier;
    expect(visibleBeforeWrite).toBe(false); expect(whilePaused).toBe('pending'); expect(outcome).toBe('resolved');
    await expect(publishHandshake(env.CODEX_DEFAULTS_SEND_RELEASE_FILE, 'replacement')).rejects.toMatchObject({ code: 'EEXIST' });
    expect(await fs.readFile(env.CODEX_DEFAULTS_SEND_RELEASE_FILE, 'utf8')).toBe('{"release":true}\n');
    expect((await fs.readdir(dir)).sort()).toEqual(['display.json', 'release.json']);
  } finally { resume(); await barrier; await fs.rm(dir, { recursive: true, force: true }); }
});
