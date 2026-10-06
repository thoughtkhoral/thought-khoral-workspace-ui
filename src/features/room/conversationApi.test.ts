import { afterEach, expect, it, vi } from 'vitest';
import { createConversationApi } from './conversationApi';
import turn from './__fixtures__/first-turn.json';
import accepted from './__fixtures__/accepted-turn.json';
import ready from './__fixtures__/ready-view.json';
import catalog from './__fixtures__/catalog.json';
import completed from './__fixtures__/completed-task.json';
import invalidReady from '../../../contracts/agent-conversation-v1/fixtures/invalid/ready-active-task.json';
import duplicateOrdinal from '../../../contracts/agent-conversation-v1/fixtures/invalid/duplicate-update-ordinal.json';
import duplicateMention from '../../../contracts/agent-conversation-v1/fixtures/invalid/duplicate-mention-id.json';
import aliasOnly from '../../../contracts/agent-conversation-v1/fixtures/invalid/alias-only.json';
afterEach(() => vi.unstubAllGlobals());
function respond(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}
it('uses only Authorization for credentials and the trusted socket gateway origin', async () => {
  const http = vi.fn().mockResolvedValue(respond({ ...accepted, roomId: turn.roomId }, 202));
  vi.stubGlobal('fetch', http);
  const persist = vi.fn();
  vi.stubGlobal('localStorage', { setItem: persist });
  const api = createConversationApi('wss://gateway.example.test/ws');
  await api.sendTurn('synthetic-token', turn);
  const [url, init] = http.mock.calls[0]!;
  expect(url).toBe('https://gateway.example.test/api/agent-conversations/v1/turns');
  expect(init.headers.Authorization).toBe('Bearer synthetic-token');
  expect(init.body).toBe(JSON.stringify(turn));
  expect(`${url}${init.body}`).not.toContain('synthetic-token');
  expect(persist).not.toHaveBeenCalled();
  expect(init.redirect).toBe('error');
});
it('parses the exact browser schemas and binds responses to the requested room and task', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(respond(ready)).mockResolvedValueOnce(respond(completed)));
  const api = createConversationApi();
  expect(await api.getConversation('t', ready.roomId, ready.agentId)).toEqual(ready);
  expect(await api.getTask('t', completed.roomId, completed.taskId)).toEqual(completed);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond({ ...ready, nativeThreadId: 'private' })));
  await expect(api.getConversation('t', ready.roomId, ready.agentId)).rejects.toThrow('unexpected');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(ready)));
  await expect(api.getConversation('t', turn.roomId, ready.agentId)).rejects.toThrow('unexpected');
});
it('paginates with browser opaque cursors, rejecting duplicate models and unsupported defaults', async () => {
  const http = vi.fn().mockResolvedValue(respond(catalog));
  vi.stubGlobal('fetch', http);
  const api = createConversationApi();
  expect(await api.listModels('t', ready.roomId, ready.agentId, 'browser cursor+')).toEqual(catalog);
  expect(String(http.mock.calls[0]![0])).toContain('cursor=browser+cursor%2B');
  http.mockResolvedValue(respond({ ...catalog, data: [catalog.data[0], catalog.data[0]] }));
  await expect(api.listModels('t', ready.roomId, ready.agentId)).rejects.toThrow('unexpected');
  http.mockResolvedValue(respond({ ...catalog, data: [{ ...catalog.data[0], defaultReasoningEffort: 'unsupported' }] }));
  await expect(api.listModels('t', ready.roomId, ready.agentId)).rejects.toThrow('unexpected');
});
it('rejects targeted/private requests before sending and displays only allowlisted errors', async () => {
  const http = vi.fn();
  vi.stubGlobal('fetch', http);
  const api = createConversationApi();
  await expect(api.sendTurn('t', { ...turn, nativeThreadId: 'private' })).rejects.toThrow();
  expect(http).not.toHaveBeenCalled();
  http.mockResolvedValue(respond({
    profileVersion: turn.profileVersion,
    code: 'conversation_busy',
    message: 'private provider trace',
    requestId: null
  }, 409));
  await expect(api.sendTurn('t', turn)).rejects.toThrow('busy');
  await expect(api.sendTurn('t', turn)).rejects.not.toThrow('private provider');
});
it('rejects duplicate JSON keys, unpaired scalars, oversized and mismatched response variants', async () => {
  const api = createConversationApi();
  const http = vi.fn();
  vi.stubGlobal('fetch', http);
  http.mockResolvedValue(new Response(JSON.stringify(ready).replace('{', '{"roomId":"duplicate",')));
  await expect(api.getConversation('t', ready.roomId, ready.agentId)).rejects.toThrow('unexpected');
  http.mockResolvedValue(respond({ ...catalog, catalogRevision: '\ud800' }));
  await expect(api.listModels('t', ready.roomId, ready.agentId)).rejects.toThrow('unexpected');
  http.mockResolvedValue(respond(accepted));
  await expect(api.getTask('t', accepted.roomId, accepted.taskId)).rejects.toThrow('unexpected');
});
it('rejects inconsistent states, duplicate ordinals and mismatched nested result bindings', async () => {
  const api = createConversationApi();
  const http = vi.fn();
  vi.stubGlobal('fetch', http);
  http.mockResolvedValue(respond(invalidReady));
  await expect(api.getConversation('t', ready.roomId, ready.agentId)).rejects.toThrow('unexpected');
  for (const task of [duplicateOrdinal, { ...completed, result: { ...completed.result, generation: 2 } }]) {
    http.mockResolvedValue(respond(task));
    await expect(api.getTask('t', completed.roomId, completed.taskId)).rejects.toThrow('unexpected');
  }
});
it('rejects alias-only, duplicate target and malformed scalar requests without contacting the gateway', async () => {
  const api = createConversationApi();
  const http = vi.fn();
  vi.stubGlobal('fetch', http);
  for (const input of [aliasOnly, duplicateMention, { ...turn, text: '\ud800' }]) await expect(api.sendTurn('t', input)).rejects.toThrow();
  expect(http).not.toHaveBeenCalled();
});
it('rejects falsely confirmed settings and fresh telemetry without a usable denominator', async () => {
  const api = createConversationApi();
  const http = vi.fn();
  vi.stubGlobal('fetch', http);
  for (const conversation of [{ ...ready.conversation, effectiveSettings: { ...ready.conversation.effectiveSettings, reasoningEffort: null } }, { ...ready.conversation, usage: { ...ready.conversation.usage, modelContextWindow: null } }]) {
    http.mockResolvedValue(respond({ ...ready, conversation }));
    await expect(api.getConversation('t', ready.roomId, ready.agentId)).rejects.toThrow('unexpected');
  }
});
it('requires the profile HTTP success status for each response variant', async () => {
  const api = createConversationApi();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond({ ...accepted, roomId: turn.roomId }, 200)));
  await expect(api.sendTurn('t', turn)).rejects.toThrow('unexpected');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(ready, 202)));
  await expect(api.getConversation('t', ready.roomId, ready.agentId)).rejects.toThrow('unexpected');
});
