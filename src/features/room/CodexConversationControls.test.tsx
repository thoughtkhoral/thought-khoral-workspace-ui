import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CodexConversationControls } from './CodexConversationControls';
import { MentionComposer } from './MentionComposer';
import { useAgentConversation } from './useAgentConversation';
import { CODEX_AGENT_ID, createConversationApi } from './conversationApi';
import ready from './__fixtures__/ready-view.json';
import catalog from './__fixtures__/catalog.json';
import accepted from './__fixtures__/accepted-turn.json';
import reserved from './__fixtures__/reserved-task.json';
import completed from './__fixtures__/completed-task.json';
import defaults from './__fixtures__/resolved-settings.json';
import failed from '../../../contracts/agent-conversation-v1/fixtures/valid/failed-task.json';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const participants = [{
  id: '00000004-1111-4111-8111-000000000004',
  role: 'human' as const,
  displayName: 'Maya',
  online: true
}, { id: CODEX_AGENT_ID, role: 'agent' as const, displayName: 'Codex Agent', online: true }];
function Harness({ onChat = vi.fn(), capabilities, roster = participants }: {
  onChat?: (values: import('../../api').ChatSendValues) => void;
  roster?: typeof participants;
  capabilities?: {
    modelSelection: boolean;
    reasoningEffort: boolean;
    usage: boolean;
  };
}) {
  const conversation = useAgentConversation({
    roomId: ready.roomId,
    agentId: CODEX_AGENT_ID,
    enabled: true,
    getAccessToken: async () => 'synthetic-token',
    api: api,
    modelSelection: capabilities?.modelSelection ?? true,
    reasoningEffort: capabilities?.reasoningEffort ?? true
  });
  return <><CodexConversationControls conversation={conversation} capabilities={capabilities} /><MentionComposer
    participants={roster}
    isConnected
    onSend={onChat}
    conversation={conversation} /></>;
}
const api = createConversationApi();
function boundary(options: {
  busy?: boolean;
  extraModel?: boolean;
  view?: unknown;
} = {}) {
  const requests: {
    url: string;
    body?: Record<string, unknown>;
  }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.endsWith('/turns')) return new Response(JSON.stringify(options.busy ? {
      profileVersion: ready.profileVersion,
      code: 'conversation_busy',
      message: 'secret',
      requestId: null
        } : { ...accepted, roomId: ready.roomId, selectedSettings: requests.at(-1)?.body?.settings ?? accepted.selectedSettings }), { status: options.busy ? 409 : 202 });
    if (url.endsWith('/defaults')) return new Response(JSON.stringify({ ...defaults, selectedSettings: catalog.data[0] ? { model: 'model-a', reasoningEffort: 'effort-medium', catalogRevision: catalog.catalogRevision } : defaults.selectedSettings }));
    if (url.includes('/models')) return new Response(JSON.stringify(options.extraModel ? {
      ...catalog, data: [...catalog.data, {
        id: 'model-b',
        displayName: 'Second model',
        defaultReasoningEffort: 'low',
        supportedReasoningEfforts: [{ id: 'low', description: 'Low' }]
      }]
    } : catalog));
    return new Response(JSON.stringify(options.view ?? ready));
  }));
  return requests;
}
it('directly addressing Codex sends one profile request and no ordinary chat request', async () => {
  const requests = boundary();
  const chat = vi.fn();
  render(<Harness onChat={chat} />);
  await screen.findByRole('button', { name: 'New session' });
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Model' })).toBeTruthy());
  fireEvent.change(screen.getByRole('combobox', { name: 'Message' }), { target: { value: '@codex-agent hello' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(requests.filter(r => r.body)).toHaveLength(1));
  expect(requests.find(r => r.body)!.body!.conversation).toEqual({ mode: 'continue', id: ready.conversation.id, generation: 1 });
  expect(chat).not.toHaveBeenCalled();
});
it('keeps the admitted canonical Codex token when another participant has the same display name', async () => {
  const requests = boundary();
  render(<Harness roster={[{ ...participants[0]!, displayName: 'Codex Agent' }, participants[1]!]} />);
  await screen.findByRole('combobox', { name: 'Model' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Message' }), { target: { value: '@codex-agent hello' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(requests.filter(request => request.body)).toHaveLength(1));
  expect(requests.find(request => request.body)!.body!.mentions).toEqual([{ type: 'participant', id: CODEX_AGENT_ID, token: 'codex-agent' }]);
});
it('selected target adds a canonical typed mention; aliases and quoted mentions stay chat', async () => {
  const requests = boundary();
  const chat = vi.fn();
  render(<Harness onChat={chat} />);
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Model' })).toBeTruthy());
  for (const text of ['@allagents hello', '> @codex-agent quoted', '`@codex-agent` code', '"@codex-agent" quote']) {
    fireEvent.change(screen.getByRole('combobox', { name: 'Message' }), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect((screen.getByRole('combobox', { name: 'Message' }) as HTMLTextAreaElement).value).toBe(''));
  }
  expect(chat).toHaveBeenCalledTimes(4);
  fireEvent.change(screen.getByRole('combobox', { name: 'Conversation target' }), { target: { value: CODEX_AGENT_ID } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Message' }), { target: { value: 'hello' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(requests.filter(r => r.body)).toHaveLength(1));
  expect(requests.find(r => r.body)!.body!.text).toBe('@codex-agent hello');
});
it('keeps delimiter-run code spans and fenced code in ordinary chat unless the target is selected', async () => {
  const requests = boundary();
  const chat = vi.fn();
  render(<Harness onChat={chat} />);
  await screen.findByRole('combobox', { name: 'Model' });
  const codeDrafts = [
    '``@codex-agent`` code',
    '``code with ` @codex-agent ` inside``',
    '~~~javascript\n@codex-agent\n~~~',
    '````text\n@codex-agent\n```\n@codex-agent\n````'
  ];
  for (const text of codeDrafts) {
    fireEvent.change(screen.getByRole('combobox', { name: 'Message' }), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect((screen.getByRole('combobox', { name: 'Message' }) as HTMLTextAreaElement).value).toBe(''));
  }
  expect(chat.mock.calls.map(([values]) => values.text)).toEqual(codeDrafts);
  expect(requests.filter(request => request.body)).toHaveLength(0);
  fireEvent.change(screen.getByRole('combobox', { name: 'Conversation target' }), { target: { value: CODEX_AGENT_ID } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Message' }), { target: { value: codeDrafts[0] } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(requests.filter(request => request.body)).toHaveLength(1));
  expect(requests.find(request => request.body)!.body!.text).toBe(`@codex-agent ${codeDrafts[0]}`);
  expect(requests.find(request => request.body)!.body!.mentions).toEqual([
    { type: 'participant', id: CODEX_AGENT_ID, token: 'codex-agent' }
  ]);
});
it('rejects targeted Codex delivery and preserves drafts on busy rejection', async () => {
  const requests = boundary({ busy: true });
  render(<Harness />);
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Model' })).toBeTruthy());
  fireEvent.change(screen.getByRole('combobox', { name: 'Message' }), { target: { value: '@codex-agent keep this' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Message delivery' }), { target: { value: 'mentioned' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  expect(requests.filter(r => r.body)).toHaveLength(0);
  expect(screen.getByRole('alert').textContent).toContain('room');
  fireEvent.change(screen.getByRole('combobox', { name: 'Message delivery' }), { target: { value: 'room' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await screen.findByText(/busy/);
  expect((screen.getByRole('combobox', { name: 'Message' }) as HTMLTextAreaElement).value).toBe('@codex-agent keep this');
});
it('discloses shared reset and requires acknowledging a model effort default; unsent choices remain local', async () => {
  const requests = boundary({ extraModel: true });
  render(<Harness />);
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Model' })).toBeTruthy());
  expect(screen.getByText(/120.*1,000/)).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), { target: { value: 'model-b' } });
  expect(requests.filter(r => r.body)).toHaveLength(0);
  expect(screen.getByText(/Active.*model-a/)).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: /acknowledge/i })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'New session' }));
  expect(screen.getByRole('checkbox', { name: /shared thread/i })).toBeTruthy();
  expect(screen.getByText(/room history.*retain/i)).toBeTruthy();
});
it('hides unavailable optional controls', async () => {
  boundary();
  render(<Harness capabilities={{ modelSelection: false, reasoningEffort: false, usage: false }} />);
  await screen.findByRole('button', { name: 'New session' });
  expect(screen.queryByRole('combobox', { name: 'Model' })).toBeNull();
  expect(screen.queryByRole('combobox', { name: 'Reasoning effort' })).toBeNull();
});
it('acknowledges shared reset then requests a fresh thread and disables controls while busy', async () => {
  const requests = boundary();
  render(<Harness />);
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Model' })).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'New session' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Message' }), { target: { value: '@codex-agent fresh' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  expect(requests.filter(r => r.body)).toHaveLength(0);
  await waitFor(() => expect((screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('checkbox', { name: /shared thread/i }));
  await screen.findByText(/Selected for next turn: model-a \/ effort-medium/);
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(requests.filter(r => r.body)).toHaveLength(1));
  expect(requests.find(r => r.body)!.body!.conversation).toEqual({ mode: 'new' });
  expect((screen.getByRole('button', { name: 'New session' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('combobox', { name: 'Model' }) as HTMLSelectElement).disabled).toBe(true);
});
it('requires the effort acknowledgement before sending the local model choice', async () => {
  const requests = boundary({ extraModel: true });
  render(<Harness />);
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Model' })).toBeTruthy());
  fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), { target: { value: 'model-b' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Message' }), { target: { value: '@codex-agent selected' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  expect(requests.filter(r => r.body)).toHaveLength(0);
  await waitFor(() => expect((screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('checkbox', { name: /acknowledge/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(requests.filter(r => r.body)).toHaveLength(1));
  expect(requests.find(r => r.body)!.body!.settings).toEqual({ model: 'model-b', reasoningEffort: 'low', catalogRevision: 'catalog-1' });
  await screen.findByText(/Selected for next turn: model-b \/ low$/);
  expect(screen.getByText(/Active settings/).textContent).toContain('unconfirmed');
});
it('shows zero usage, stale usage and unavailable metadata with their freshness', async () => {
  for (const [usage, expected] of [[{ ...ready.conversation.usage, lastTotalTokens: 0 }, /0.*1,000.*fresh/], [{ ...ready.conversation.usage, freshness: 'stale' }, /120.*stale/], [null, /estimate unavailable/]] as const) {
    boundary({ view: { ...ready, conversation: { ...ready.conversation, usage } } });
    render(<Harness />);
    await screen.findByText(expected);
    cleanup();
  }
});
async function flushBoundary() {
  await act(async () => {
    for (let index = 0; index < 30; index++) await Promise.resolve();
  });
}

it.each([
  ['timeout', /turn timed out/],
  ['conversation_interrupted', /turn was interrupted/]
] as const)('shows safe %s failure and permits explicit new-session recovery', async (code, expected) => {
  vi.useFakeTimers();
  let terminal = false;
  const requests: Record<string, unknown>[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.body) {
      requests.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ ...accepted, generation: 2 }), { status: 202 });
    }
    if (url.endsWith('/defaults')) return new Response(JSON.stringify({ ...defaults, selectedSettings: ready.conversation.selectedSettings }));
    if (url.includes('/models')) return new Response(JSON.stringify(catalog));
    if (url.includes('/tasks/')) {
      terminal = true;
      return new Response(JSON.stringify({
        ...failed,
        updates: [{ ...failed.updates[0], data: { code } }],
        failure: { code, message: 'synthetic private provider trace' }
      }));
    }
    return new Response(JSON.stringify({
      ...ready,
      conversation: {
        ...ready.conversation,
        state: terminal ? 'unusable' : 'running',
        activeTaskId: terminal ? null : failed.taskId
      }
    }));
  }));
  render(<Harness />);
  await flushBoundary();
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(screen.getByRole('alert').textContent).toMatch(expected);
  expect(screen.queryByText(/synthetic private provider trace/)).toBeNull();
  expect(screen.getByRole('status').textContent).toBe('Codex turn: failed');
  expect((screen.getByRole('button', { name: 'New session' }) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.queryByRole('button', { name: 'Continue session' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'New session' }));
  fireEvent.click(screen.getByRole('checkbox', { name: /shared thread/i }));
  await flushBoundary();
  fireEvent.change(screen.getByRole('combobox', { name: 'Message' }), { target: { value: '@codex-agent recover' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await flushBoundary();
  expect(requests).toHaveLength(1);
  expect(requests[0]!.conversation).toEqual({ mode: 'new' });
});

it('keeps a new model unconfirmed and usage unavailable until that task supplies its metadata', async () => {
  vi.useFakeTimers();
  let confirmed = false;
  const settings = { model: 'model-b', reasoningEffort: 'low', catalogRevision: catalog.catalogRevision };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.body) return new Response(JSON.stringify({ ...accepted, selectedSettings: settings }), { status: 202 });
    if (url.includes('/models')) return new Response(JSON.stringify({
      ...catalog,
      data: [...catalog.data, {
        id: 'model-b',
        displayName: 'Second model',
        defaultReasoningEffort: 'low',
        supportedReasoningEfforts: [{ id: 'low', description: 'Low' }]
      }]
    }));
    if (url.includes('/tasks/')) return new Response(JSON.stringify({
      ...reserved,
      state: 'running',
      selectedSettings: settings,
      effectiveSettings: confirmed ? {
        model: 'model-b', reasoningEffort: 'low', confirmation: 'confirmed', reroutedModel: null
      } : null,
      usage: confirmed ? { ...reserved.usage, model: 'model-b', lastTotalTokens: 240 } : null
    }));
    return new Response(JSON.stringify(ready));
  }));
  render(<Harness />);
  await flushBoundary();
  expect(screen.getByText(/Active settings/).textContent).toContain('model-a / effort-medium (confirmed)');
  expect(screen.getByText(/context estimate:/).textContent).toContain('120 / 1,000');
  fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), { target: { value: 'model-b' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /acknowledge/i }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Message' }), { target: { value: '@codex-agent change model' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await flushBoundary();
  expect(screen.getByText(/Active settings/).textContent).toBe('Active settings: unconfirmed or unavailable');
  expect(screen.getByText(/context estimate/).textContent).toBe('Last-request context estimate unavailable.');
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(screen.getByRole('status').textContent).toBe('Codex turn: running');
  expect(screen.getByText(/Selected for next turn/).textContent).toBe('Selected for next turn: model-b / low');
  expect(screen.getByText(/Active settings/).textContent).toBe('Active settings: unconfirmed or unavailable');
  expect(screen.getByText(/context estimate/).textContent).toBe('Last-request context estimate unavailable.');
  confirmed = true;
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(screen.getByText(/Active settings/).textContent).toBe('Active settings: model-b / low (confirmed)');
  expect(screen.getByText(/context estimate/).textContent).toContain('240 / 1,000 tokens (24%; fresh; model-b;');
});


it.each(['initial', 'reset'] as const)('displays resolved fresh settings for %s and retains explicit reset acknowledgement', async mode => {
  const requests = boundary({ view: mode === 'initial' ? { ...ready, conversation: null } : ready });
  render(<Harness />);
  await screen.findByText(/Selected for next turn: model-a \/ effort-medium/);
  if (mode === 'reset') {
    fireEvent.click(screen.getByRole('button', { name: 'New session' }));
    await screen.findByText(/Selected for next turn: model-a \/ effort-medium/);
    fireEvent.change(screen.getByRole('combobox', { name: 'Message' }), { target: { value: '@codex-agent resolved pair' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' })); await flushBoundary();
    expect(requests.filter(request => request.body)).toHaveLength(0);
    fireEvent.click(screen.getByRole('checkbox', { name: /shared thread/i }));
  }
  fireEvent.change(screen.getByRole('combobox', { name: 'Message' }), { target: { value: '@codex-agent resolved pair' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(requests.filter(request => request.body)).toHaveLength(1));
  expect(requests.find(request => request.body)!.body!.settings).toEqual(ready.conversation.selectedSettings);
  expect(requests.find(request => request.body)!.body!.conversation).toEqual({ mode: 'new' });
});

it('permits initial invocation for a capability without settings controls', async () => {
  const requests = boundary({ view: { ...ready, conversation: null } });
  render(<Harness capabilities={{ modelSelection: false, reasoningEffort: false, usage: false }} />);
  await flushBoundary();
  expect(screen.queryByRole('combobox', { name: 'Model' })).toBeNull();
  fireEvent.change(screen.getByRole('combobox', { name: 'Message' }), { target: { value: '@codex-agent capability' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(requests.filter(request => request.body)).toHaveLength(1));
  expect(requests.find(request => request.body)!.body!.settings).toBeUndefined();
});

it('retains the prompt on stale catalog rejection and requires explicit Refresh settings', async () => {
  const requests = boundary();
  const http = fetch as ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;
  const original = http.getMockImplementation()!;
  http.mockImplementation(async (url: string, init?: RequestInit) => url.endsWith('/turns') ? new Response(JSON.stringify({ profileVersion: ready.profileVersion, code: 'conversation_stale', requestId: null, message: 'private' }), { status: 409 }) : original(url, init));
  render(<Harness />); await screen.findByText(/Selected for next turn: model-a/);
  fireEvent.change(screen.getByRole('combobox', { name: 'Message' }), { target: { value: '@codex-agent retained' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await screen.findByRole('button', { name: 'Refresh settings' });
  expect((screen.getByRole('combobox', { name: 'Message' }) as HTMLTextAreaElement).value).toBe('@codex-agent retained');
  expect(screen.getByText(/Selected for next turn/).textContent).not.toContain('model-a');
  const priorReads = requests.length;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh settings' })); await screen.findByText(/Selected for next turn: model-a/);
  expect(requests.length).toBeGreaterThan(priorReads); expect((screen.getByRole('combobox', { name: 'Message' }) as HTMLTextAreaElement).value).toBe('@codex-agent retained');
});

it('reveals Refresh settings after a busy restored task completes despite failed catalog acquisition', async () => {
  vi.useFakeTimers(); let terminal = false; let catalogRecovered = false; let submits = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.body) { submits++; return new Response(JSON.stringify(accepted), { status: 202 }); }
    if (url.includes('/models')) return catalogRecovered ? new Response(JSON.stringify(catalog)) : new Response('{}', { status: 503 });
    if (url.includes('/tasks/')) { terminal = true; return new Response(JSON.stringify(completed)); }
    return new Response(JSON.stringify(terminal ? ready : { ...ready, conversation: { ...ready.conversation, state: 'running', activeTaskId: completed.taskId } }));
  }));
  render(<Harness />); await flushBoundary();
  expect(screen.getByText(/Session: busy/)).toBeTruthy(); expect(screen.queryByRole('button', { name: 'Refresh settings' })).toBeNull();
  fireEvent.change(screen.getByRole('combobox', { name: 'Message' }), { target: { value: '@codex-agent preserve while busy' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' })); await flushBoundary(); expect(submits).toBe(0);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(screen.getByRole('button', { name: 'Refresh settings' })).toBeTruthy();
  expect(screen.getByRole('status').textContent).toBe('Codex turn: completed');
  catalogRecovered = true; fireEvent.click(screen.getByRole('button', { name: 'Refresh settings' })); await flushBoundary();
  expect(screen.getByText(/Selected for next turn: model-a \/ effort-medium/)).toBeTruthy();
  expect((screen.getByRole('combobox', { name: 'Message' }) as HTMLTextAreaElement).value).toBe('@codex-agent preserve while busy'); expect(submits).toBe(0);
});
