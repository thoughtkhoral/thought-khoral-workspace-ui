import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAgentConversation } from './useAgentConversation';
import { CODEX_AGENT_ID, createConversationApi } from './conversationApi';
import ready from './__fixtures__/ready-view.json';
import catalog from './__fixtures__/catalog.json';
import reserved from './__fixtures__/reserved-task.json';
import completed from './__fixtures__/completed-task.json';
import accepted from './__fixtures__/accepted-turn.json';
import defaults from './__fixtures__/resolved-settings.json';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const api = createConversationApi(); const getAccessToken = async () => 'synthetic-token';
const options = { roomId: ready.roomId, agentId: CODEX_AGENT_ID, enabled: true, getAccessToken, api };
it('restores another human shared session and paginates the model catalog', async () => {
  const urls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(url);
    return new Response(JSON.stringify(url.includes('/models') ? url.includes('cursor=') ? { ...catalog, data: [], nextCursor: null } : { ...catalog, nextCursor: 'opaque-browser-page' } : ready));
  }));
  const { result } = renderHook(() => useAgentConversation(options));
  await waitFor(() => expect(result.current.view?.conversation?.state).toBe('ready'));
  await waitFor(() => expect(result.current.catalog?.data).toHaveLength(1));
  expect(urls.some(url => url.includes('cursor=opaque-browser-page'))).toBe(true);
  expect(result.current.view?.conversation?.generation).toBe(1);
});
it('polls once per second for active tasks then stops on terminal and exposes no second reply bubble', async () => {
  let reads = 0;
  let terminal = false;
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/models')) return new Response(JSON.stringify(catalog));
    if (url.includes('/tasks/')) {
      reads++;
      terminal = true;
      return new Response(JSON.stringify(completed));
    }
    return new Response(JSON.stringify(terminal ? ready : { ...ready, conversation: { ...ready.conversation, state: 'running', activeTaskId: reserved.taskId } }));
  }));
  const { result, unmount } = renderHook(() => useAgentConversation(options));
  await act(async () => {
    for (let index = 0; index < 30; index++) await Promise.resolve();
  });
  expect(result.current.view?.conversation?.state).toBe('running');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(reads).toBe(1);
  expect(result.current.task?.state).toBe('completed');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4000);
  });
  expect(reads).toBe(1);
  unmount();
});
it('ignores a delayed prior room response on Leave and stops on authentication loss', async () => {
  let resolveView!: (value: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => {
    resolveView = resolve;
  })));
  const { result, rerender } = renderHook(({ enabled }) => useAgentConversation({ ...options, enabled }), { initialProps: { enabled: true } });
  await act(async () => {
    await Promise.resolve();
  });
  rerender({ enabled: false });
  await act(async () => {
    resolveView(new Response(JSON.stringify(ready)));
  });
  expect(result.current.view).toBeNull();
  expect(result.current.task).toBeNull();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
  rerender({ enabled: true });
  await waitFor(() => expect(result.current.error?.code).toBe('authentication_required'));
  expect(result.current.isAvailable).toBe(false);
});
it('fetches current server generation before continuing and creates a fresh thread only explicitly', async () => {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.body) {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify(accepted), { status: 202 });
    }
    return new Response(JSON.stringify(url.includes('/models') ? catalog : ready));
  }));
  const { result } = renderHook(() => useAgentConversation(options));
  await waitFor(() => expect(result.current.isAvailable).toBe(true));
  await act(async () => {
    await result.current.submit({
      text: '@codex-agent hello',
      mentions: [{ type: 'participant', id: CODEX_AGENT_ID, token: 'codex-agent' }],
      delivery: 'room'
    });
  });
  expect(bodies[0]!.conversation).toEqual({ mode: 'continue', id: '00000005-1111-4111-8111-000000000005', generation: 1 });
});
it('ignores an out-of-order task response after reconnect restores a newer generation', async () => {
  vi.useFakeTimers();
  let resolveTask!: (value: Response) => void;
  let newer = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/models')) return new Response(JSON.stringify(catalog));
    if (url.includes('/tasks/')) return new Promise<Response>(resolve => {
      resolveTask = resolve;
    });
    return new Response(JSON.stringify(newer ? { ...ready, conversation: { ...ready.conversation, generation: 2 } } : { ...ready, conversation: { ...ready.conversation, state: 'running', activeTaskId: accepted.taskId } }));
  }));
  const { result, rerender } = renderHook(({ enabled }) => useAgentConversation({ ...options, enabled }), { initialProps: { enabled: true } });
  await act(async () => {
    for (let index = 0; index < 30; index++) await Promise.resolve();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(resolveTask).toBeTypeOf('function');
  rerender({ enabled: false });
  newer = true;
  rerender({ enabled: true });
  await act(async () => {
    for (let index = 0; index < 30; index++) await Promise.resolve();
  });
  await act(async () => {
    resolveTask(new Response(JSON.stringify(completed)));
  });
  expect(result.current.view?.conversation?.generation).toBe(2);
  expect(result.current.task).toBeNull();
});
it('restores confirmed state after browser reload without retaining an unsent choice', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/models') ? catalog : ready))));
  const first = renderHook(() => useAgentConversation(options));
  await waitFor(() => expect(first.result.current.catalog).not.toBeNull());
  act(() => first.result.current.selectModel('model-a'));
  expect(first.result.current.draftSettings?.model).toBe('model-a');
  first.unmount();
  const second = renderHook(() => useAgentConversation(options));
  await waitFor(() => expect(second.result.current.view?.conversation?.state).toBe('ready'));
  expect(second.result.current.draftSettings).toBeNull();
  expect(second.result.current.view?.conversation?.effectiveSettings?.confirmation).toBe('confirmed');
});

const capabilityRows = [true, false].flatMap(modelSelection => [true, false].flatMap(reasoningEffort =>
  ['initial', 'restored', 'new'].map(phase => ({ modelSelection, reasoningEffort, phase }))));
const twoModels = { ...catalog, data: [...catalog.data, { id: 'model-b', displayName: 'Second model',
  defaultReasoningEffort: 'effort-high', supportedReasoningEfforts: [{ id: 'effort-high', description: 'High' }, { id: 'effort-low', description: 'Low' }] }] };

it.each(capabilityRows)('concrete settings model=$modelSelection effort=$reasoningEffort phase=$phase', async ({ modelSelection, reasoningEffort, phase }) => {
  const reads: string[] = []; const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    reads.push(url);
    if (init?.body) { const body = JSON.parse(String(init.body)); bodies.push(body); return new Response(JSON.stringify({ ...accepted, selectedSettings: body.settings ?? accepted.selectedSettings }), { status: 202 }); }
    return new Response(JSON.stringify(url.endsWith('/defaults') ? defaults : url.includes('/models') ? twoModels : phase === 'initial' ? { ...ready, conversation: null } : ready));
  }));
  const { result } = renderHook(() => useAgentConversation({ ...options, modelSelection, reasoningEffort }));
  await waitFor(() => expect(result.current.isAvailable).toBe(true));
  if (phase === 'new') { act(() => result.current.chooseNewSession()); await waitFor(() => expect(result.current.settingsLoading).toBe(false)); act(() => result.current.acknowledgeReset(true)); }
  const supports = modelSelection || reasoningEffort;
  expect(result.current.selectedSettings).toEqual(supports ? phase === 'restored' ? ready.conversation.selectedSettings : defaults.selectedSettings : null);
  expect(result.current.needsSettingsSelection).toBe(false);
  expect(reads.filter(url => url.endsWith('/defaults'))).toHaveLength(supports && phase !== 'restored' ? 1 : 0);
  expect(reads.filter(url => url.includes('/models'))).toHaveLength(supports ? phase === 'new' ? 2 : 1 : 0);
  await act(async () => { expect(await result.current.submit({ text: '@codex-agent pair', mentions: [{ type: 'participant', id: CODEX_AGENT_ID, token: 'codex-agent' }], delivery: 'room' })).toBe(true); });
  expect(bodies[0]!.settings).toEqual(supports ? phase === 'restored' ? ready.conversation.selectedSettings : defaults.selectedSettings : undefined);
});

const values = { text: '@codex-agent retained prompt', mentions: [{ type: 'participant' as const, id: CODEX_AGENT_ID, token: 'codex-agent' }], delivery: 'room' as const };
function settingsBoundary({ absent = true, defaultsValue = defaults, catalogValue = twoModels, reject = '', cursor = '' } = {}) {
  const reads: string[] = []; const bodies: any[] = [];
  const http = vi.fn(async (url: string, init?: RequestInit) => {
    reads.push(url);
    if (init?.body) { bodies.push(JSON.parse(String(init.body))); return new Response(JSON.stringify(reject ? { profileVersion: ready.profileVersion, code: reject, requestId: null, message: 'private' } : { ...accepted, selectedSettings: bodies.at(-1).settings ?? accepted.selectedSettings }), { status: reject ? 409 : 202 }); }
    if (url.endsWith('/defaults')) return new Response(JSON.stringify(defaultsValue), { status: defaultsValue === null ? 503 : 200 });
    if (url.includes('/models')) return new Response(JSON.stringify(cursor ? { ...catalogValue, data: [], nextCursor: cursor === 'cycle' ? 'same' : `cursor-${reads.length}` } : catalogValue));
    return new Response(JSON.stringify(absent ? { ...ready, conversation: null } : ready));
  }); vi.stubGlobal('fetch', http); return { reads, bodies, http };
}
it.each(['unavailable', 'revision', 'model', 'effort'] as const)('blocks %s defaults and recovers only after human refresh', async failure => {
  const b = settingsBoundary({ defaultsValue: failure === 'unavailable' ? null as any : { ...defaults, selectedSettings: { ...defaults.selectedSettings, ...(failure === 'revision' ? { catalogRevision: 'changed' } : failure === 'model' ? { model: 'removed' } : { reasoningEffort: 'removed' }) } } });
  const { result } = renderHook(() => useAgentConversation(options));
  await waitFor(() => expect(result.current.error).not.toBeNull());
  expect(result.current.selectedSettings).toBeNull(); expect(result.current.isAvailable).toBe(false);
  await act(async () => { expect(await result.current.submit(values)).toBe(false); }); expect(b.bodies).toHaveLength(0);
  b.http.mockImplementation(async (url: string) => new Response(JSON.stringify(url.endsWith('/defaults') ? defaults : url.includes('/models') ? twoModels : { ...ready, conversation: null })));
  await act(async () => { await result.current.refreshSettings(); });
  expect(result.current.selectedSettings).toEqual(defaults.selectedSettings); expect(b.bodies).toHaveLength(0);
});
it.each(['cycle', 'bound'] as const)('bounds catalog acquisition %s', async cursor => {
  const b = settingsBoundary({ cursor }); const { result } = renderHook(() => useAgentConversation(options));
  await waitFor(() => expect(result.current.error).not.toBeNull()); expect(result.current.selectedSettings).toBeNull();
  expect(b.reads.filter(url => url.includes('/models'))).toHaveLength(cursor === 'cycle' ? 2 : 100);
  expect(b.reads.some(url => url.endsWith('/defaults'))).toBe(false);
});
it('requires review of a stored revision and never replaces it with deployment defaults', async () => {
  const b = settingsBoundary({ absent: false, catalogValue: { ...twoModels, catalogRevision: 'catalog-2' } });
  const { result } = renderHook(() => useAgentConversation(options)); await waitFor(() => expect(result.current.error).not.toBeNull());
  expect(result.current.selectedSettings).toBeNull(); await act(async () => { await result.current.refreshSettings(); });
  expect(result.current.selectedSettings).toEqual({ ...ready.conversation.selectedSettings, catalogRevision: 'catalog-2' });
  expect(b.reads.some(url => url.endsWith('/defaults'))).toBe(false); expect(b.bodies).toHaveLength(0);
});
it('keeps a removed stored pair unavailable after explicit refresh', async () => {
  settingsBoundary({ absent: false, catalogValue: { ...twoModels, data: [twoModels.data[1]!] } });
  const { result } = renderHook(() => useAgentConversation(options)); await waitFor(() => expect(result.current.error).not.toBeNull());
  await act(async () => { await result.current.refreshSettings(); }); expect(result.current.selectedSettings).toBeNull(); expect(result.current.isAvailable).toBe(false);
});
it('guards edit actions independently and blocks a null model-only effort default', async () => {
  settingsBoundary({ catalogValue: { ...twoModels, data: [{ ...twoModels.data[0]!, defaultReasoningEffort: null }, twoModels.data[1]!] } as any });
  const { result } = renderHook(() => useAgentConversation({ ...options, reasoningEffort: false }));
  await waitFor(() => expect(result.current.isAvailable).toBe(true));
  act(() => result.current.selectEffort('effort-low')); expect(result.current.selectedSettings).toEqual(defaults.selectedSettings);
  act(() => result.current.selectModel('model-a')); expect(result.current.selectedSettings).toBeNull();
  await act(async () => { expect(await result.current.submit(values)).toBe(false); });
});
it('reasoning-only cannot change resolved model and can edit supported efforts', async () => {
  settingsBoundary(); const { result } = renderHook(() => useAgentConversation({ ...options, modelSelection: false }));
  await waitFor(() => expect(result.current.isAvailable).toBe(true)); act(() => result.current.selectModel('model-a'));
  expect(result.current.selectedSettings).toEqual(defaults.selectedSettings); act(() => result.current.selectEffort('effort-low'));
  expect(result.current.selectedSettings?.model).toBe('model-b'); expect(result.current.selectedSettings?.reasoningEffort).toBe('effort-low');
});
it('does not reacquire deployment defaults during submit after a policy-only change', async () => {
  const b = settingsBoundary(); const { result } = renderHook(() => useAgentConversation(options));
  await waitFor(() => expect(result.current.isAvailable).toBe(true)); const shown = { ...result.current.selectedSettings! };
  const original = b.http.getMockImplementation()!;
  b.http.mockImplementation(async (url: string, init?: RequestInit) => url.endsWith('/defaults') ? new Response(JSON.stringify({ ...defaults, selectedSettings: ready.conversation.selectedSettings })) : original(url, init));
  await act(async () => { expect(await result.current.submit(values)).toBe(true); }); expect(b.bodies[0].settings).toEqual(shown);
  expect(b.reads.filter(url => url.endsWith('/defaults'))).toHaveLength(1); expect(result.current.submittedSettings).toEqual(shown);
});
it.each(['conversation_stale', 'invalid_task_input'] as const)('invalidates rejected %s settings without replay', async reject => {
  const b = settingsBoundary({ reject }); const { result } = renderHook(() => useAgentConversation(options));
  await waitFor(() => expect(result.current.isAvailable).toBe(true)); await act(async () => { expect(await result.current.submit(values)).toBe(false); });
  expect(result.current.selectedSettings).toBeNull(); expect(result.current.isAvailable).toBe(false);
  await act(async () => { expect(await result.current.submit(values)).toBe(false); }); expect(b.bodies).toHaveLength(1);
});
it.each(['continue', 'new', 'leave', 'room', 'edit'] as const)('ignores delayed defaults after %s', async action => {
  const b = settingsBoundary({ absent: false }); const { result, rerender } = renderHook(({ enabled, roomId }) => useAgentConversation({ ...options, enabled, roomId }), { initialProps: { enabled: true, roomId: ready.roomId } });
  await waitFor(() => expect(result.current.isAvailable).toBe(true));
  let resolve!: (response: Response) => void;
  b.http.mockImplementation(async (url: string) => url.endsWith('/defaults') ? new Promise<Response>(r => { resolve = r; }) : new Response(JSON.stringify(url.includes('/models') ? twoModels : ready)));
  act(() => result.current.chooseNewSession()); await waitFor(() => expect(resolve).toBeTypeOf('function'));
  const delayed = resolve;
  if (action === 'continue') act(() => result.current.continueSession());
  if (action === 'new') { act(() => result.current.chooseNewSession()); await waitFor(() => expect(resolve).not.toBe(delayed)); await act(async () => resolve(new Response(JSON.stringify(defaults)))); }
  if (action === 'leave') rerender({ enabled: false, roomId: ready.roomId });
  if (action === 'room') { b.http.mockImplementation(async (url: string) => new Response(JSON.stringify(url.includes('/models') ? twoModels : { ...ready, roomId: '00000001-1111-4111-8111-000000000001' }))); rerender({ enabled: true, roomId: '00000001-1111-4111-8111-000000000001' }); await waitFor(() => expect(result.current.isAvailable).toBe(true)); }
  if (action === 'edit') act(() => result.current.selectModel('model-a'));
  await act(async () => delayed(new Response(JSON.stringify(defaults))));
  expect(result.current.selectedSettings).toEqual(action === 'new' ? defaults.selectedSettings : action === 'leave' ? null : ready.conversation.selectedSettings);
});
it('authentication loss during a later discovery invalidates pending responses', async () => {
  const b = settingsBoundary({ absent: false }); const { result } = renderHook(() => useAgentConversation(options)); await waitFor(() => expect(result.current.isAvailable).toBe(true));
  let resolve!: (response: Response) => void;
  b.http.mockImplementation(async (url: string) => url.endsWith('/defaults') ? new Promise<Response>(r => { resolve = r; }) : new Response(JSON.stringify(url.includes('/models') ? twoModels : ready)));
  act(() => result.current.chooseNewSession()); await waitFor(() => expect(resolve).toBeTypeOf('function'));
  const delayed = resolve; b.http.mockImplementation(async () => new Response('{}', { status: 401 }));
  await act(async () => { await result.current.refreshSettings(); }); await act(async () => delayed(new Response(JSON.stringify(defaults))));
  expect(result.current.error?.code).toBe('authentication_required'); expect(result.current.selectedSettings).toBeNull(); expect(result.current.isAvailable).toBe(false);
});

it('does not resurrect a failed discovery from a cached catalog edit or Continue', async () => {
  const b = settingsBoundary({ absent: false }); const { result } = renderHook(() => useAgentConversation(options));
  await waitFor(() => expect(result.current.isAvailable).toBe(true));
  b.http.mockImplementation(async (url: string) => new Response(JSON.stringify(url.includes('/models') ? twoModels : {}), { status: url.endsWith('/defaults') ? 503 : 200 }));
  act(() => result.current.chooseNewSession()); await waitFor(() => expect(result.current.error).not.toBeNull());
  expect(result.current.selectedSettings).toBeNull();
  act(() => result.current.selectModel('model-a')); expect(result.current.selectedSettings).toBeNull();
  act(() => result.current.continueSession()); expect(result.current.isAvailable).toBe(false);
});
it('model-only edit uses the new model catalog default even when prior effort is supported', async () => {
  const withRetainedEffort = { ...twoModels, data: [{ ...twoModels.data[0]!, supportedReasoningEfforts: [...twoModels.data[0]!.supportedReasoningEfforts, { id: 'effort-high', description: 'High' }] }, twoModels.data[1]!] };
  const b = settingsBoundary({ catalogValue: withRetainedEffort }); const { result } = renderHook(() => useAgentConversation({ ...options, reasoningEffort: false }));
  await waitFor(() => expect(result.current.isAvailable).toBe(true)); act(() => result.current.selectModel('model-a'));
  expect(result.current.selectedSettings).toEqual(ready.conversation.selectedSettings); expect(result.current.needsEffortAcknowledgement).toBe(false);
  await act(async () => { expect(await result.current.submit(values)).toBe(true); }); expect(b.bodies[0].settings).toEqual(ready.conversation.selectedSettings);
});
it.each(['revision', 'duplicate'] as const)('rejects cross-page catalog %s', async failure => {
  const b = settingsBoundary();
  b.http.mockImplementation(async (url: string) => new Response(JSON.stringify(url.includes('/models') ? url.includes('cursor=') ? { ...twoModels, ...(failure === 'revision' ? { catalogRevision: 'drift', data: [] } : {}), nextCursor: null } : { ...twoModels, nextCursor: 'next' } : { ...ready, conversation: null })));
  const { result } = renderHook(() => useAgentConversation(options)); await waitFor(() => expect(result.current.error).not.toBeNull());
  expect(result.current.selectedSettings).toBeNull(); expect(result.current.isAvailable).toBe(false);
});
it.each(['revision changed', 'pair removed'] as const)('retains the immutable displayed request after %s between display and submit, and requires refresh', async change => {
  const b = settingsBoundary(); const { result } = renderHook(() => useAgentConversation(options));
  await waitFor(() => expect(result.current.isAvailable).toBe(true)); const displayed = { ...result.current.selectedSettings! };
  b.http.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.body) { b.bodies.push(JSON.parse(String(init.body))); return new Response(JSON.stringify({ profileVersion: ready.profileVersion, requestId: null, code: change === 'revision changed' ? 'conversation_stale' : 'invalid_task_input', message: 'private' }), { status: 409 }); }
    return new Response(JSON.stringify({ ...ready, conversation: null }));
  });
  await act(async () => { expect(await result.current.submit(values)).toBe(false); });
  expect(b.bodies[0].settings).toEqual(displayed); expect(result.current.selectedSettings).toBeNull();
  expect(b.bodies).toHaveLength(1); expect(result.current.isAvailable).toBe(false);
});

it.each(['catalog unavailable', 'revision mismatch'] as const)('observes restored busy task despite %s and permits reviewed recovery after completion', async failure => {
  vi.useFakeTimers(); let terminal = false; let catalogRecovered = false; let taskReads = 0; const bodies: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.body) { bodies.push(JSON.parse(String(init.body))); return new Response(JSON.stringify(accepted), { status: 202 }); }
    if (url.includes('/tasks/')) { taskReads++; terminal = true; return new Response(JSON.stringify(completed)); }
    if (url.includes('/models')) return failure === 'catalog unavailable' && !catalogRecovered ? new Response('{}', { status: 503 }) : new Response(JSON.stringify({ ...catalog, catalogRevision: !catalogRecovered ? 'changed' : 'catalog-1' }));
    return new Response(JSON.stringify(terminal ? ready : { ...ready, conversation: { ...ready.conversation, state: 'running', activeTaskId: completed.taskId } }));
  }));
  const { result } = renderHook(() => useAgentConversation(options));
  await act(async () => { for (let index = 0; index < 40; index++) await Promise.resolve(); });
  expect(result.current.busy).toBe(true); expect(result.current.isAvailable).toBe(false); expect(result.current.selectedSettings).toBeNull();
  await act(async () => { expect(await result.current.submit(values)).toBe(false); }); expect(bodies).toHaveLength(0);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(taskReads).toBe(1); expect(result.current.task?.state).toBe('completed'); expect(result.current.busy).toBe(false);
  catalogRecovered = true; await act(async () => { await result.current.refreshSettings(); });
  expect(result.current.isAvailable).toBe(true); expect(result.current.selectedSettings).toEqual(ready.conversation.selectedSettings);
  expect(bodies).toHaveLength(0);
});
