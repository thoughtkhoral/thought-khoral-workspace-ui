import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAgentConversation } from './useAgentConversation';
import { CODEX_AGENT_ID, createConversationApi } from './conversationApi';
import ready from './__fixtures__/ready-view.json';
import catalog from './__fixtures__/catalog.json';
import reserved from './__fixtures__/reserved-task.json';
import completed from './__fixtures__/completed-task.json';
import accepted from './__fixtures__/accepted-turn.json';
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
