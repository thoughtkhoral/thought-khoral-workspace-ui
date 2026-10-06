import { Suspense } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RoomPage } from './RoomPage';
import { CONTRACT_VERSION } from '../../api';
import { CODEX_AGENT_ID, PROFILE_VERSION } from './conversationApi';
import type { RoomWebSocket } from './useRoomSocket';
import ready from './__fixtures__/ready-view.json';
import catalog from './__fixtures__/catalog.json';
import accepted from './__fixtures__/accepted-turn.json';
import completed from './__fixtures__/completed-task.json';
import message from '../../../contracts/agent-conversation-v1/fixtures/valid/ordinary-codex-message.json';
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
const getAccessToken = async () => 'synthetic-token';
async function enter(declaration?: unknown, role: 'human' | 'agent' = 'human') {
  const socket = new Socket();
  render(<Suspense fallback={null}>
    <RoomPage
      roomId={ready.roomId}
      participantRole={role}
      getAccessToken={getAccessToken}
      createSocket={() => socket}
      conversationAdmission={declaration} />
  </Suspense>);
  fireEvent.click(screen.getByRole('button', { name: 'Enter room' }));
  await act(async () => {
    await Promise.resolve();
    socket.open();
  });
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
