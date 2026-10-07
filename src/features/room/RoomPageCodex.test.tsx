import { Suspense } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { RoomPage } from './RoomPage';
import { CONTRACT_VERSION } from '../../api';
import { CODEX_AGENT_ID, PROFILE_VERSION } from './conversationApi';
import type { RoomWebSocket } from './useRoomSocket';
import ready from './__fixtures__/ready-view.json';
import catalog from './__fixtures__/catalog.json';
import accepted from './__fixtures__/accepted-turn.json';
import completed from './__fixtures__/completed-task.json';
import defaults from './__fixtures__/resolved-settings.json';
import message from '../../../contracts/agent-conversation-v1/fixtures/valid/ordinary-codex-message.json';
// Exercise the real chat component without making admission checks depend on
// how quickly its lazy module loads under parallel test workers.
beforeAll(async () => {
  await import('./ChatStream');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const admission = {
  profileVersion: PROFILE_VERSION,
  agentId: CODEX_AGENT_ID,
  conversationScope: 'room',
  invocation: 'explicitly-addressed',
  delivery: 'room',
  roomHistory: 'baseline-and-delta',
  modelSelection: true,
  reasoningEffort: true,
  usageReporting: true
};
class Socket extends EventTarget implements RoomWebSocket {
  readyState = 0; sent: string[] = [];
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
  }
  receive(data: unknown) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) }));
  }
}
const getAccessToken = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
  return 'synthetic-token';
};
async function enter(declaration?: unknown, role: 'human' | 'agent' = 'human') {
  const socket = new Socket();
  const createSocket = vi.fn(() => socket);
  render(<Suspense fallback={null}>
    <RoomPage
      roomId={ready.roomId}
      participantRole={role}
      getAccessToken={getAccessToken}
      createSocket={createSocket}
      conversationAdmission={declaration} />
  </Suspense>);
  fireEvent.click(screen.getByRole('button', { name: 'Enter room' }));
  await waitFor(() => expect(createSocket).toHaveBeenCalledOnce());
  act(() => socket.open());
  act(() => socket.receive({
    jsonrpc: '2.0',
    method: 'room.participants.updated',
    params: {
      contractVersion: CONTRACT_VERSION,
      roomId: ready.roomId,
      participants: [{ id: CODEX_AGENT_ID, role: 'agent', displayName: 'Codex Agent', online: true }]
    }
  }));
  await screen.findByRole('combobox', { name: 'Message' });
  return socket;
}
it('requires a closed trusted host admission declaration and human participation', async () => {
  const http = vi.fn();
  vi.stubGlobal('fetch', http);
  for (const declaration of [undefined, { ...admission, workerEndpoint: 'private' }, { ...admission, toString: false }, { ...admission, roomHistory: 'unknown' }, { ...admission, profileVersion: 'unknown' }]) {
    await enter(declaration);
    expect(screen.queryByRole('button', { name: 'New session' })).toBeNull();
    cleanup();
  }
  await enter(admission, 'agent');
  expect(screen.queryByRole('button', { name: 'New session' })).toBeNull();
  expect(http).not.toHaveBeenCalled();
});
it('uses the profile once, renders the persisted reply once, and clears conversation state on Leave', async () => {
  let done = false;
  const bodies: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.body) {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify(accepted), { status: 202 });
    }
    if (url.includes('/models')) return new Response(JSON.stringify(catalog));
    if (url.includes('/tasks/')) {
      done = true;
      return new Response(JSON.stringify(completed));
    }
    return new Response(JSON.stringify(ready));
  }));
  const socket = await enter(admission);
  await screen.findByRole('combobox', { name: 'Model' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Message' }), { target: { value: '@codex-agent hello' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(bodies).toHaveLength(1));
  expect(socket.sent.map(item => JSON.parse(item).method).filter(method => method === 'chat.send')).toHaveLength(0);
  act(() => socket.receive({ ...message, roomId: ready.roomId }));
  await waitFor(() => expect(done).toBe(true), { timeout: 2000 });
  // PatternFly also announces the latest text in a visually hidden live region.
  expect(document.querySelectorAll(`[id="${message.eventId}"]`)).toHaveLength(1);
  expect(document.getElementById(message.eventId)?.textContent).toContain('Maya proposed blue; Leo corrected it to green.');
  expect(screen.getByText('Codex turn: completed').parentElement?.textContent).not.toContain('Maya proposed blue');
  fireEvent.click(screen.getByRole('button', { name: 'Leave room' }));
  expect(screen.queryByRole('button', { name: 'New session' })).toBeNull();
  expect(screen.queryByText('Maya proposed blue; Leo corrected it to green.')).toBeNull();
});

const capabilityRows = [true, false].flatMap(modelSelection => [true, false].flatMap(reasoningEffort =>
  ['initial', 'restored', 'new'].map(phase => ({ modelSelection, reasoningEffort, phase }))));
const twoModels = { ...catalog, data: [...catalog.data, { id: 'model-b', displayName: 'Second model',
  defaultReasoningEffort: 'effort-high', supportedReasoningEfforts: [{ id: 'effort-high', description: 'High' }, { id: 'effort-low', description: 'Low' }] }] };

it.each(capabilityRows)('RoomPage exact settings model=$modelSelection effort=$reasoningEffort phase=$phase', async ({ modelSelection, reasoningEffort, phase }) => {
  const reads: string[] = []; const bodies: Record<string, any>[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    reads.push(url);
    if (init?.body) { const body = JSON.parse(String(init.body)); bodies.push(body); return new Response(JSON.stringify({ ...accepted, selectedSettings: body.settings ?? accepted.selectedSettings }), { status: 202 }); }
    return new Response(JSON.stringify(url.endsWith('/defaults') ? defaults : url.includes('/models') ? twoModels : phase === 'initial' ? { ...ready, conversation: null } : ready));
  }));
  const socket = await enter({ ...admission, modelSelection, reasoningEffort });
  const supports = modelSelection || reasoningEffort;
  if (supports) await screen.findByText(/Selected for next turn: model-/);
  else await screen.findByRole('button', { name: 'New session' });
  if (phase === 'new') { fireEvent.click(screen.getByRole('button', { name: 'New session' })); fireEvent.click(screen.getByRole('checkbox', { name: /shared thread/i })); if (supports) await screen.findByText(/Selected for next turn: model-b \/ effort-high/); }
  if (supports) {
    const pair = phase === 'restored' ? ready.conversation.selectedSettings : defaults.selectedSettings;
    expect(screen.getByText(/Selected for next turn/).textContent).toContain(`${pair.model} / ${pair.reasoningEffort}`);
    expect(Boolean(screen.queryByRole('combobox', { name: 'Model' }))).toBe(modelSelection);
    expect(Boolean(screen.queryByRole('combobox', { name: 'Reasoning effort' }))).toBe(reasoningEffort);
    if (!modelSelection) expect(screen.getByLabelText('Model (read only)').textContent).toContain(pair.model);
    if (!reasoningEffort) expect(screen.getByLabelText('Reasoning effort (read only)').textContent).toContain(pair.reasoningEffort);
    // F1: the sole editable effort is enabled, supported edits work on initial/New.
    if (!modelSelection && reasoningEffort && phase !== 'restored') {
      const control = screen.getByRole('combobox', { name: 'Reasoning effort' }) as HTMLSelectElement;
      expect(control.disabled).toBe(false); fireEvent.change(control, { target: { value: 'effort-low' } });
    }
  } else { expect(screen.queryByText(/Selected for next turn/)).toBeNull(); }
  expect(reads.filter(url => url.endsWith('/defaults'))).toHaveLength(supports && phase !== 'restored' ? 1 : 0);
  expect(reads.filter(url => url.includes('/models'))).toHaveLength(supports ? phase === 'new' ? 2 : 1 : 0);
  fireEvent.change(screen.getByRole('combobox', { name: 'Message' }), { target: { value: '@codex-agent shown pair' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(bodies).toHaveLength(1));
  const expected = supports ? phase === 'restored' ? ready.conversation.selectedSettings : { ...defaults.selectedSettings, ...(!modelSelection && reasoningEffort ? { reasoningEffort: 'effort-low' } : {}) } : undefined;
  expect(bodies[0]!.settings).toEqual(expected);
  expect(socket.sent.map(item => JSON.parse(item).method).filter(method => method === 'chat.send')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Leave room' }));
});
