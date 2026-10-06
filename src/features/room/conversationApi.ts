import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import turnSchema from '../../../contracts/agent-conversation-v1/schemas/turn.schema.json';
import viewSchema from '../../../contracts/agent-conversation-v1/schemas/view.schema.json';
import catalogSchema from '../../../contracts/agent-conversation-v1/schemas/catalog.schema.json';
import errorSchema from '../../../contracts/agent-conversation-v1/schemas/error.schema.json';
import type { ChatMention } from '../../api';
import { mentionTokens } from './mentions';
export const PROFILE_VERSION = 'thought-khoral.agent-conversation.v1' as const;
export const CODEX_AGENT_ID = '74686f75-6768-746b-686f-72616c000004' as const;
export function isDirectCodexMention(text: string, mentions: readonly ChatMention[]): boolean {
  if (!mentions.some(mention => mention.type === 'participant' && mention.id === CODEX_AGENT_ID && mention.token === 'codex-agent')) return false;
  let quote = '';
  let codeDelimiter = 0;
  let fence: { character: string; length: number } | null = null;
  let visible = '';
  for (const line of text.split('\n')) {
    if (fence) {
      const closing = /^ {0,3}(`+|~+)[ \t]*$/.exec(line)?.[1];
      if (closing && closing[0] === fence.character && closing.length >= fence.length) fence = null;
      visible += '\n';
      continue;
    }
    if (/^\s*>/.test(line)) {
      visible += '\n';
      continue;
    }
    const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (!quote && !codeDelimiter && opening && (opening[1]![0] === '~' || !opening[2]!.includes('`'))) {
      fence = { character: opening[1]![0]!, length: opening[1]!.length };
      visible += '\n';
      continue;
    }
    for (let at = 0; at < line.length; at++) {
      const char = line[at]!;
      if (quote) {
        if (char === quote && line[at - 1] !== '\\') quote = '';
        visible += ' ';
      }
      else if (char === '`') {
        let end = at + 1;
        while (line[end] === '`') end++;
        const length = end - at;
        if (codeDelimiter === length) codeDelimiter = 0;
        else if (!codeDelimiter) codeDelimiter = length;
        visible += ' '.repeat(length);
        at = end - 1;
      }
      else if (codeDelimiter) visible += ' ';
      else if ((char === '"' || char === "'") && (at === 0 || /[\s([{=:]/.test(line[at - 1]!))) {
        quote = char;
        visible += ' ';
      }
      else visible += char;
    }
    visible += '\n';
  }
  return mentionTokens(visible).some(mention => mention.token === 'codex-agent');
}
export interface ConversationAdmission {
  profileVersion: typeof PROFILE_VERSION;
  agentId: typeof CODEX_AGENT_ID;
  conversationScope: 'room';
  invocation: 'explicitly-addressed';
  delivery: 'room';
  roomHistory: 'baseline-and-delta';
  modelSelection?: boolean;
  reasoningEffort?: boolean;
  usageReporting?: boolean;
}
export function readConversationAdmission(value: unknown): ConversationAdmission | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const admission = value as Record<string, unknown>;
  const required = {
    profileVersion: PROFILE_VERSION,
    agentId: CODEX_AGENT_ID,
    conversationScope: 'room',
    invocation: 'explicitly-addressed',
    delivery: 'room',
    roomHistory: 'baseline-and-delta'
  };
  const optional = ['modelSelection', 'reasoningEffort', 'usageReporting'];
  const requiredMismatch = Object.entries(required).some(([key, expected]) => admission[key] !== expected);
  const unknownField = Object.keys(admission).some(key => !Object.hasOwn(required, key) && !optional.includes(key));
  const invalidCapability = optional.some(key => Object.hasOwn(admission, key) && typeof admission[key] !== 'boolean');
  if (requiredMismatch || unknownField || invalidCapability) return null;
  return value as ConversationAdmission;
}
export interface SelectedSettings {
  model: string;
  reasoningEffort: string;
  catalogRevision: string;
}
export interface EffectiveSettings {
  model: string | null;
  reasoningEffort: string | null;
  confirmation: 'confirmed' | 'unconfirmed';
  reroutedModel: string | null;
}
export interface Usage {
  lastTotalTokens: number;
  modelContextWindow: number | null;
  reportedAt: string;
  model: string | null;
  freshness: 'fresh' | 'stale' | 'unavailable';
}
export interface TurnRequest {
  profileVersion: typeof PROFILE_VERSION;
  requestId: string;
  roomId: string;
  agentId: string;
  occurredAt: string;
  text: string;
  mentions: ChatMention[];
  conversation?: {
    mode: 'new';
  } | {
    mode: 'continue';
    id: string;
    generation: number;
  };
  settings?: SelectedSettings;
}
export interface AcceptedTurn {
  profileVersion: typeof PROFILE_VERSION;
  roomId: string;
  taskId: string;
  conversationId: string;
  generation: number;
  triggerEventId: string;
  contextRevision: number;
  selectedSettings: SelectedSettings | null;
}
export interface ConversationView {
  profileVersion: typeof PROFILE_VERSION;
  roomId: string;
  agentId: string;
  conversation: {
    id: string;
    generation: number;
    state: 'reserved' | 'running' | 'ready' | 'unusable';
    activeTaskId: string | null;
    consumedRevision: number;
    policyRevision: string;
    guidanceRevision: string;
    selectedSettings: SelectedSettings | null;
    effectiveSettings: EffectiveSettings | null;
    usage: Usage | null;
  } | null;
}
export interface CatalogPage {
  profileVersion: typeof PROFILE_VERSION;
  catalogRevision: string;
  data: {
    id: string;
    displayName: string;
    defaultReasoningEffort: string | null;
    supportedReasoningEfforts: {
      id: string;
      description: string;
    }[];
  }[];
  nextCursor: string | null;
}
export interface ProfileReply {
  kind: 'conversation-reply.v1';
  conversationId: string;
  generation: number;
  assistantText: string;
  consumedRevision: number;
  contextDigest: string;
  citations: string[];
  effectiveSettings: EffectiveSettings | null;
  usage: Usage | null;
}
export type FailureCode = (typeof errorSchema.properties.code.enum)[number];
export interface ProfileFailure {
  code: FailureCode;
  message: string;
}
interface TaskUpdateBase {
  updateId: string;
  ordinal: number;
  occurredAt: string;
}
export type TaskUpdate = TaskUpdateBase & (
  { kind: 'progress'; data: { phase: string; text: string; percent?: number } } |
  { kind: 'settings'; data: EffectiveSettings } |
  { kind: 'usage'; data: Usage } |
  { kind: 'completed'; data: ProfileReply } |
  { kind: 'failed'; data: Pick<ProfileFailure, 'code'> }
);
export interface TaskView {
  profileVersion: typeof PROFILE_VERSION;
  roomId: string;
  taskId: string;
  conversationId: string;
  generation: number;
  requesterId: string;
  state: 'reserved' | 'running' | 'completed' | 'failed';
  selectedSettings: SelectedSettings | null;
  effectiveSettings: EffectiveSettings | null;
  usage: Usage | null;
  updates: TaskUpdate[];
  result: ProfileReply | null;
  replyEventId: string | null;
  failure: ProfileFailure | null;
}
const messages: Record<string, string> = {
  invalid_task_input: 'The conversation request is invalid.',
  forbidden: 'You are not allowed to use this conversation.',
  conversation_busy: 'The shared conversation is busy. Your draft is retained.',
  conversation_stale: 'The shared session changed. Review its current state and try again.',
  context_mismatch: 'The room context changed. Refresh the conversation state.',
  context_too_large: 'The room context exceeds the supported limit.',
  runtime_unavailable: 'Codex is currently unavailable.',
  authentication_required: 'Sign in again to use Codex.',
  session_unavailable: 'The shared session is unavailable. Start a new session.',
  timeout: 'The turn timed out. Review the session before starting a new turn.',
  conversation_interrupted: 'The turn was interrupted. Start a new session.',
  execution_failed: 'The turn failed. Review the session before trying again.',
  duplicate_conflict: 'The request conflicts with an earlier submission.',
};
export class ConversationError extends Error {
  constructor(public readonly code: string) {
    super(messages[code] ?? 'The gateway returned an unexpected conversation response.');
  }
}
export function safeConversationError(error: unknown): ConversationError {
  return error instanceof ConversationError ? error : new ConversationError('unexpected');
}
const ajv = new Ajv2020({ strict: true, strictRequired: false });
addFormats(ajv);
for (const schema of [turnSchema, viewSchema, catalogSchema, errorSchema]) ajv.addSchema(schema);
const validators = {
  turn: ajv.getSchema(turnSchema.$id)!,
  view: ajv.getSchema(viewSchema.$id)!,
  catalog: ajv.getSchema(catalogSchema.$id)!,
  error: ajv.getSchema(errorSchema.$id)!,
  accepted: ajv.compile({ $ref: `${turnSchema.$id}#/$defs/acceptedTurn` }),
  task: ajv.compile({ $ref: `${turnSchema.$id}#/$defs/taskView` }),
};
function validate<T>(kind: keyof typeof validators, value: unknown): T {
  if (!validators[kind](value)) throw new ConversationError('unexpected');
  parseProfileJson(JSON.stringify(value));
  if (kind === 'turn') {
    const turn = value as TurnRequest;
    const keys = turn.mentions.map(mention => mention.type === 'participant' ? `participant:${mention.id}` : `alias:${mention.alias}`);
    if (
      turn.agentId !== CODEX_AGENT_ID || new Set(keys).size !== keys.length ||
      !isDirectCodexMention(turn.text, turn.mentions)
    ) throw new ConversationError('invalid_task_input');
  }
  if (kind === 'catalog') {
    const catalog = value as CatalogPage;
    const duplicateModel = new Set(catalog.data.map(model => model.id)).size !== catalog.data.length;
    const invalidEfforts = catalog.data.some(model =>
      new Set(model.supportedReasoningEfforts.map(effort => effort.id)).size !== model.supportedReasoningEfforts.length ||
      (model.defaultReasoningEffort !== null && !model.supportedReasoningEfforts.some(effort => effort.id === model.defaultReasoningEffort)),
    );
    if (duplicateModel || invalidEfforts) throw new ConversationError('unexpected');
  }
  if (kind === 'view') {
    const state = (value as ConversationView).conversation;
    if (state && (['reserved', 'running'].includes(state.state) !== (state.activeTaskId !== null))) throw new ConversationError('unexpected');
    if (state) validateMetadata(state);
  }
  if (kind === 'task') {
    const task = value as TaskView;
    const ids = new Set<string>();
    let ordinal = 0;
    validateMetadata(task);
    for (const update of task.updates) {
      if (update.ordinal <= ordinal || ids.has(update.updateId)) throw new ConversationError('unexpected');
      ordinal = update.ordinal;
      ids.add(update.updateId);
    }
    if (task.result && (
      task.result.conversationId !== task.conversationId || task.result.generation !== task.generation ||
      new TextEncoder().encode(task.result.assistantText).length > 65536
    )) throw new ConversationError('unexpected');
    if (task.result) validateMetadata(task.result);
    const terminal = task.updates.filter(update => update.kind === 'completed' || update.kind === 'failed');
    const terminalMismatch = terminal.length && (
      terminal[0]!.kind !== task.state || terminal[0] !== task.updates.at(-1)
    );
    if (terminal.length > 1 || terminalMismatch) throw new ConversationError('unexpected');
    const last = terminal[0];
    if (task.state === 'completed' && (
      last?.kind !== 'completed' || !equivalent(last.data, task.result)
    )) throw new ConversationError('unexpected');
    if (task.state === 'failed' && (
      last?.kind !== 'failed' || last.data.code !== task.failure?.code
    )) throw new ConversationError('unexpected');
  }
  return value as T;
}
function validateMetadata(value: {
  effectiveSettings: EffectiveSettings | null;
  usage: Usage | null;
}): void {
  const effective = value.effectiveSettings;
  if (effective?.confirmation === 'confirmed' && (!effective.model || !effective.reasoningEffort)) throw new ConversationError('unexpected');
  if (value.usage?.modelContextWindow === null && value.usage.freshness !== 'unavailable') throw new ConversationError('unexpected');
  if (value.usage?.freshness === 'fresh' && (!value.usage.modelContextWindow || !value.usage.model)) throw new ConversationError('unexpected');
}
function equivalent(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((entry, index) => equivalent(entry, right[index]));
  }
  const first = left as Record<string, unknown>;
  const second = right as Record<string, unknown>;
  return Object.keys(first).length === Object.keys(second).length && Object.keys(first).every(key => Object.hasOwn(second, key) && equivalent(first[key], second[key]));
}
// JSON.parse alone discards duplicate keys and accepts unsafe numerical spellings.
// Walk the bounded JSON grammar first, including escaped keys and scalar validity.
export function parseProfileJson(source: string): unknown {
  let at = 0;
  const invalid = () => {
    throw new ConversationError('unexpected');
  };
  const space = () => {
    while (/[\t\n\r ]/.test(source[at] ?? '\0')) at++;
  };
  const string = (): string => {
    const start = at++;
    while (at < source.length) {
      if (source[at] === '\\') {
        at += 2;
        continue;
      }
      if (source[at++] === '"') {
        const value: string = JSON.parse(source.slice(start, at));
        if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) invalid();
        return value;
      }
    }
    return invalid();
  };
  const value = (depth: number): void => {
    if (depth > 64) invalid();
    space();
    if (source[at] === '"') {
      string();
      return;
    }
    if (source[at] === '{' || source[at] === '[') {
      const object = source[at++] === '{';
      const close = object ? '}' : ']';
      const keys = new Set<string>();
      space();
      if (source[at] === close) {
        at++;
        return;
      }
      for (;;) {
        space();
        if (object) {
          if (source[at] !== '"') invalid();
          const key = string();
          if (keys.has(key)) invalid();
          keys.add(key);
          space();
          if (source[at++] !== ':') invalid();
        }
        value(depth + 1);
        space();
        if (source[at] === close) {
          at++;
          return;
        }
        if (source[at++] !== ',') invalid();
      }
    }
    const literal = /^(?:true|false|null|\d+)/.exec(source.slice(at));
    if (!literal) invalid();
    const token = literal![0];
    if (/^\d/.test(token) && (!/^(?:0|[1-9]\d*)$/.test(token) || !Number.isSafeInteger(Number(token)))) invalid();
    at += token.length;
  };
  try {
    value(0);
    space();
    if (at !== source.length) invalid();
    return JSON.parse(source);
  } catch {
    return invalid();
  }
}
async function readResponse(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new ConversationError('unexpected');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 4 * 1024 * 1024) {
        await reader.cancel();
        throw new ConversationError('unexpected');
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return parseProfileJson(text + decoder.decode());
  } finally {
    reader.releaseLock();
  }
}
export function createConversationApi(socketUrl?: string) {
  const gateway = new URL(socketUrl ?? `${window.location.origin}/ws`, window.location.origin);
  if (
    gateway.username || gateway.password || gateway.search || gateway.hash ||
    !['http:', 'https:', 'ws:', 'wss:'].includes(gateway.protocol)
  ) throw new ConversationError('unexpected');
  gateway.protocol = ['https:', 'wss:'].includes(gateway.protocol) ? 'https:' : 'http:';
  const prefix = `${gateway.origin}/api/agent-conversations/v1`;
  const segment = (id: string) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw new ConversationError('invalid_task_input');
    return id;
  };
  const request = async <T>(token: string, path: string, kind: keyof typeof validators, body?: unknown): Promise<T> => {
    try {
      const response = await fetch(`${prefix}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store'
      });
      if (response.status === 401) throw new ConversationError('authentication_required');
      const received = await readResponse(response);
      if (!response.ok) {
        const error = validate<{
          code: string;
        }>('error', received);
        throw new ConversationError(error.code);
      }
      if (response.status !== (body ? 202 : 200)) throw new ConversationError('unexpected');
      return validate<T>(kind, received);
    } catch (error) {
      throw safeConversationError(error);
    }
  };
  return {
    async sendTurn(token: string, body: TurnRequest | unknown): Promise<AcceptedTurn> {
      const turn = validate<TurnRequest>('turn', body);
      const accepted = await request<AcceptedTurn>(token, '/turns', 'accepted', turn);
      if (accepted.roomId !== turn.roomId || (turn.conversation?.mode === 'continue' && (
        accepted.conversationId !== turn.conversation.id || accepted.generation !== turn.conversation.generation
      ))) throw new ConversationError('unexpected');
      return accepted;
    },
    async getConversation(token: string, roomId: string, agentId: string): Promise<ConversationView> {
      const view = await request<ConversationView>(token, `/rooms/${segment(roomId)}/agents/${segment(agentId)}`, 'view');
      if (view.roomId !== roomId || view.agentId !== agentId) throw new ConversationError('unexpected');
      return view;
    },
    listModels(token: string, roomId: string, agentId: string, cursor?: string): Promise<CatalogPage> {
      if (cursor !== undefined && (cursor.length === 0 || cursor.length > 256)) throw new ConversationError('invalid_task_input');
      return request(token, `/rooms/${segment(roomId)}/agents/${segment(agentId)}/models${cursor ? `?${new URLSearchParams({ cursor })}` : ''}`, 'catalog');
    },
    async getTask(token: string, roomId: string, taskId: string): Promise<TaskView> {
      const task = await request<TaskView>(token, `/rooms/${segment(roomId)}/tasks/${segment(taskId)}`, 'task');
      if (task.roomId !== roomId || task.taskId !== taskId) throw new ConversationError('unexpected');
      return task;
    },
  };
}
export type ConversationApi = ReturnType<typeof createConversationApi>;
