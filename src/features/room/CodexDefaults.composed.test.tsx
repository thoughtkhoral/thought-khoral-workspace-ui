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
  vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
    const pathname = new URL(String(url)).pathname;
    if (pathname.endsWith('/defaults')) defaultsReads++;
    if (pathname.endsWith('/models')) catalogReads++;
    if (pathname.endsWith('/turns') && init?.body) submitted = JSON.parse(String(init.body));
    const response = await realFetch(url, init);
    if (pathname.endsWith('/turns') && response.status === 202) acceptedTurn = await response.clone().json();
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
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    // A raw 202 clone is not evidence of UI acceptance. The composer clears only
    // after strict schema/binding validation and the hook's successful acceptance.
    await waitFor(() => {
      const prompt = screen.getByRole('combobox', { name: 'Message' }) as HTMLTextAreaElement;
      expect(prompt.value === '' || Boolean(screen.queryByRole('alert'))).toBe(true);
    }, { timeout: 10000 });
    const prompt = screen.getByRole('combobox', { name: 'Message' }) as HTMLTextAreaElement;
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
