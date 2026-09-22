import { Alert } from '@patternfly/react-core';

import type { Decision, ParticipantRole } from './features/decisions/DecisionCard';

export const CONTRACT_VERSION = 'n2n.room.v1' as const;
export const REFERENCE_AGENT_ID = '74686f75-6768-746b-686f-72616c000003' as const;
export const AGENT_TASK_SKILLS = ['summarize-context', 'extract-action-items'] as const;

export type AgentTaskSkill = (typeof AGENT_TASK_SKILLS)[number];
export type AgentTaskPhase =
  | 'accepted'
  | 'retrieving-context'
  | 'working'
  | 'finalizing';

export type RoomEventType =
  | 'message.created'
  | 'decision.proposed'
  | 'decision.confirmed'
  | 'decision.edited'
  | 'decision.dismissed'
  | 'decision.deleted'
  | 'agent.task.queued'
  | 'agent.task.running'
  | 'agent.task.requested'
  | 'agent.task.progressed'
  | 'agent.task.awaiting_external_input'
  | 'agent.task.succeeded'
  | 'agent.task.failed';

export interface RoomActor {
  id: string;
  role: ParticipantRole;
  displayName?: string;
}

export interface RoomParticipant {
  id: string;
  role: ParticipantRole;
  displayName: string;
  online: boolean;
}

export type ChatDelivery = 'room' | 'mentioned';

export type ChatMention =
  | { type: 'participant'; id: string; token: string }
  | { type: 'alias'; alias: 'allhumans' | 'allagents' };

export interface ChatSendValues {
  text: string;
  mentions: ChatMention[];
  delivery: ChatDelivery;
}

export interface RoomEvent {
  contractVersion: typeof CONTRACT_VERSION;
  requestId: string;
  roomId: string;
  occurredAt: string;
  sequence: number;
  eventId: string;
  eventType: RoomEventType;
  actor: RoomActor;
  payload: Record<string, unknown>;
}

export interface RoomMessage {
  eventId: string;
  actor: RoomEvent['actor'];
  occurredAt: string;
  text: string;
  mentions: ChatMention[];
  delivery: ChatDelivery;
}

export interface ActionItem {
  text: string;
  owner?: string;
  due?: string;
}

export interface RoomAgentTask {
  id: string;
  invocationEventId?: string;
  events?: Pick<RoomEvent, 'eventId' | 'eventType' | 'occurredAt'>[];
  agent: RoomEvent['actor'];
  status:
    | 'queued'
    | 'running'
    | 'requested'
    | 'progressed'
    | 'awaiting_external_input'
    | 'succeeded'
    | 'failed';
  actionItems: ActionItem[];
  skillId?: AgentTaskSkill;
  phase?: AgentTaskPhase;
  progressText?: string;
  percent?: number;
  summary?: string;
  citations?: string[];
  handoff?: AgentTaskHandoff;
  failureCode?: string;
}

export interface AgentTaskHandoff {
  instruction: string;
  url: string;
  host: string;
  expiresAt: string;
}

export interface RoomProjection {
  messages: RoomMessage[];
  decisions: Decision[];
  tasks: RoomAgentTask[];
  participants: RoomParticipant[];
}

export interface RoomParticipantUpdate {
  jsonrpc: '2.0';
  method: 'room.participants.updated';
  params: {
    contractVersion: typeof CONTRACT_VERSION;
    roomId: string;
    participants: RoomParticipant[];
  };
}

export interface GatewayError {
  code: number;
  message: string;
}

export interface RpcRequest {
  jsonrpc: '2.0';
  id: string;
  method:
    | 'room.join'
    | 'chat.send'
    | 'decision.propose'
    | 'decision.transition'
    | 'decision.delete'
    | 'agent.task.start';
  params: Record<string, unknown> & {
    contractVersion: typeof CONTRACT_VERSION;
    requestId: string;
    roomId: string;
    occurredAt: string;
  };
}

const eventTypes = new Set<RoomEventType>([
  'message.created',
  'decision.proposed',
  'decision.confirmed',
  'decision.edited',
  'decision.dismissed',
  'decision.deleted',
  'agent.task.queued',
  'agent.task.running',
  'agent.task.requested',
  'agent.task.progressed',
  'agent.task.awaiting_external_input',
  'agent.task.succeeded',
  'agent.task.failed',
]);

const safeErrorMessages = new Map<number, string>([
  [-32600, 'The gateway rejected an invalid request.'],
  [-32601, 'The requested operation is not supported.'],
  [-32603, 'The gateway could not complete the request.'],
  [-32001, 'Your session is not authenticated. Sign in again.'],
  [-32003, 'You are not allowed to perform this action.'],
  [-32004, 'The room or decision could not be found.'],
  [-32009, 'This workspace contract version is not supported.'],
  [-32010, 'This decision can no longer make that transition.'],
  [-32011, 'The collaboration context has expired.'],
  [-32012, 'A request identifier was reused with different content.'],
  [-32013, 'The message mentions an unknown participant.'],
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const received = Object.keys(value);
  return received.length === keys.length && received.every((key) => keys.includes(key));
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value);
}

function isExternalTaskCore(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    isUuid(value.taskId) &&
    value.agentId === REFERENCE_AGENT_ID &&
    isUuid(value.requesterId) &&
    AGENT_TASK_SKILLS.includes(value.skillId as AgentTaskSkill) &&
    Number.isInteger(value.contextRevision) &&
    (value.contextRevision as number) >= 0
  );
}

function isCitationIds(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 100 &&
    value.every(isUuid) &&
    new Set(value).size === value.length
  );
}

function isActionItem(value: unknown): value is ActionItem {
  if (!isRecord(value) || Object.keys(value).some((key) => !['text', 'owner', 'due'].includes(key))) {
    return false;
  }
  return (
    typeof value.text === 'string' && value.text.length > 0 && value.text.length <= 2000 &&
    (value.owner === undefined || (typeof value.owner === 'string' && value.owner.length > 0 && value.owner.length <= 256)) &&
    (value.due === undefined || (typeof value.due === 'string' && value.due.length > 0 && value.due.length <= 256))
  );
}

function isExternalTaskResult(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || !isCitationIds(value.citations)) {
    return false;
  }
  if (value.kind === 'context-summary.v1') {
    return hasExactKeys(value, ['kind', 'summary', 'citations']) &&
      typeof value.summary === 'string' && value.summary.length > 0 && value.summary.length <= 8000;
  }
  return value.kind === 'action-items.v1' &&
    hasExactKeys(value, ['kind', 'actionItems', 'citations']) &&
    Array.isArray(value.actionItems) && value.actionItems.length <= 20 && value.actionItems.every(isActionItem);
}

function isExternalTaskHandoff(value: unknown): value is AgentTaskHandoff {
  if (!isRecord(value) || !hasExactKeys(value, ['instruction', 'url', 'host', 'expiresAt'])) {
    return false;
  }
  if (
    typeof value.instruction !== 'string' || value.instruction.length === 0 || value.instruction.length > 2000 ||
    typeof value.url !== 'string' || typeof value.host !== 'string' || value.host.length === 0 || value.host.length > 253 ||
    typeof value.expiresAt !== 'string' || Number.isNaN(Date.parse(value.expiresAt))
  ) {
    return false;
  }
  try {
    const url = new URL(value.url);
    return url.protocol === 'https:' && !url.username && !url.password && url.host === value.host;
  } catch {
    return false;
  }
}

function isExternalTaskPayload(eventType: RoomEventType, payload: unknown): boolean {
  if (!isExternalTaskCore(payload)) return false;
  const coreKeys = ['taskId', 'agentId', 'requesterId', 'skillId', 'contextRevision'];
  if (eventType === 'agent.task.requested') {
    return hasExactKeys(payload, coreKeys);
  }
  if (eventType === 'agent.task.progressed') {
    return hasExactKeys(payload, [...coreKeys, 'phase', 'text', 'percent'].filter((key) => key !== 'percent' || payload.percent !== undefined)) &&
      ['accepted', 'retrieving-context', 'working', 'finalizing'].includes(payload.phase as string) &&
      typeof payload.text === 'string' && payload.text.length > 0 && payload.text.length <= 512 &&
      (payload.percent === undefined || (Number.isInteger(payload.percent) && (payload.percent as number) >= 0 && (payload.percent as number) <= 100));
  }
  if (eventType === 'agent.task.awaiting_external_input') {
    return hasExactKeys(payload, [...coreKeys, 'handoff']) && isExternalTaskHandoff(payload.handoff);
  }
  if (eventType === 'agent.task.succeeded') {
    return hasExactKeys(payload, [...coreKeys, 'result']) && isExternalTaskResult(payload.result);
  }
  if (eventType === 'agent.task.failed') {
    return hasExactKeys(payload, [...coreKeys, 'failure']) && isRecord(payload.failure) &&
      hasExactKeys(payload.failure, ['code']) &&
      (payload.failure.code === 'invalid_task_input' || payload.failure.code === 'execution_failed');
  }
  return false;
}

export function isRoomEvent(value: unknown): value is RoomEvent {
  if (!isRecord(value) || !isRecord(value.actor) || !isRecord(value.payload)) {
    return false;
  }

  const displayName = value.actor.displayName;
  if (
    displayName !== undefined &&
    (typeof displayName !== 'string' ||
      displayName.length === 0 ||
      displayName.length > 128)
  ) {
    return false;
  }

  const hasValidEnvelope = (
    value.contractVersion === CONTRACT_VERSION &&
    typeof value.requestId === 'string' &&
    typeof value.roomId === 'string' &&
    typeof value.occurredAt === 'string' &&
    Number.isInteger(value.sequence) &&
    (value.sequence as number) > 0 &&
    typeof value.eventId === 'string' &&
    typeof value.eventType === 'string' &&
    eventTypes.has(value.eventType as RoomEventType) &&
    typeof value.actor.id === 'string' &&
    (value.actor.role === 'human' || value.actor.role === 'agent')
  );
  if (!hasValidEnvelope) return false;

  const eventType = value.eventType as RoomEventType;
  if (!eventType.startsWith('agent.task.') || eventType === 'agent.task.queued' || eventType === 'agent.task.running') {
    return true;
  }
  const isExternal = isExternalTaskPayload(eventType, value.payload);
  const hasExternalActor = value.actor.id === REFERENCE_AGENT_ID && value.actor.role === 'agent';
  if (eventType === 'agent.task.requested') {
    return isExternal && value.actor.role === 'human' && value.actor.id === value.payload.requesterId;
  }
  if (
    eventType === 'agent.task.progressed' ||
    eventType === 'agent.task.awaiting_external_input'
  ) {
    return isExternal && hasExternalActor;
  }
  if (isExternal) return hasExternalActor;
  return !('skillId' in value.payload || 'contextRevision' in value.payload || value.payload.agentId === REFERENCE_AGENT_ID);
}

function isParticipant(value: unknown): value is RoomParticipant {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    (value.role === 'human' || value.role === 'agent') &&
    typeof value.displayName === 'string' &&
    value.displayName.length > 0 &&
    value.displayName.length <= 128 &&
    typeof value.online === 'boolean'
  );
}

export function isParticipantUpdate(
  value: unknown,
): value is RoomParticipantUpdate {
  if (!isRecord(value) || !isRecord(value.params)) {
    return false;
  }

  return (
    value.jsonrpc === '2.0' &&
    value.method === 'room.participants.updated' &&
    value.params.contractVersion === CONTRACT_VERSION &&
    typeof value.params.roomId === 'string' &&
    Array.isArray(value.params.participants) &&
    value.params.participants.every(isParticipant)
  );
}

export function readParticipants(value: unknown): RoomParticipant[] | null {
  if (!Array.isArray(value) || !value.every(isParticipant)) {
    return null;
  }
  return value;
}

export function readGatewayError(value: unknown): GatewayError | null {
  if (!isRecord(value)) {
    return null;
  }
  const candidate = isRecord(value.error) ? value.error : value;
  if (typeof candidate.code !== 'number') {
    return null;
  }

  return {
    code: candidate.code,
    message:
      safeErrorMessages.get(candidate.code) ??
      'The gateway returned an unexpected error.',
  };
}

export function GatewayErrorAlert({ error }: { error: unknown }) {
  const gatewayError = readGatewayError(error);
  if (!gatewayError) {
    return null;
  }

  return (
    <Alert
      variant="danger"
      isInline
      title="Request failed"
      role="alert"
      aria-live="assertive"
    >
      {gatewayError.message} (error {gatewayError.code})
    </Alert>
  );
}

export function createRpcRequest(
  method: RpcRequest['method'],
  roomId: string,
  methodParams: Record<string, unknown> = {},
): RpcRequest {
  const requestId = crypto.randomUUID();
  return {
    jsonrpc: '2.0',
    id: requestId,
    method,
    params: {
      contractVersion: CONTRACT_VERSION,
      requestId,
      roomId,
      occurredAt: new Date().toISOString(),
      ...methodParams,
    },
  };
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : null;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const mentionTokenPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const maxChatMentions = 50;

function isChatMention(value: unknown): value is ChatMention {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  if (value.type === 'participant') {
    return (
      typeof value.id === 'string' &&
      uuidPattern.test(value.id) &&
      typeof value.token === 'string' &&
      mentionTokenPattern.test(value.token)
    );
  }

  return (
    value.type === 'alias' &&
    (value.alias === 'allhumans' || value.alias === 'allagents')
  );
}

function readChatMentions(value: unknown): ChatMention[] | null {
  if (
    !Array.isArray(value) ||
    value.length > maxChatMentions ||
    !value.every(isChatMention)
  ) {
    return null;
  }

  const mentionKeys = new Set<string>();
  for (const mention of value) {
    const key =
      mention.type === 'participant'
        ? `participant:${mention.id}`
        : `alias:${mention.alias}`;
    if (mentionKeys.has(key)) {
      return null;
    }
    mentionKeys.add(key);
  }

  return value;
}

function readChatDelivery(value: unknown): ChatDelivery | null {
  return value === 'room' || value === 'mentioned' ? value : null;
}

function readChatMetadata(
  mentionsValue: unknown,
  deliveryValue: unknown,
): Pick<RoomMessage, 'mentions' | 'delivery'> {
  const mentions = readChatMentions(mentionsValue);
  const delivery = readChatDelivery(deliveryValue);
  if (!mentions || !delivery || (delivery === 'mentioned' && mentions.length === 0)) {
    return { mentions: [], delivery: 'room' };
  }

  return { mentions, delivery };
}

function fallbackDisplayName(actor: RoomActor): string {
  return `${actor.role === 'human' ? 'Human' : 'Agent'} ${actor.id.slice(0, 8)}`;
}

function readExternalTask(event: RoomEvent): RoomAgentTask | null {
  if (
    !isRoomEvent(event) ||
    !isExternalTaskPayload(event.eventType, event.payload)
  ) return null;
  const payload = event.payload;
  const task: RoomAgentTask = {
    id: payload.taskId as string,
    agent: event.eventType === 'agent.task.requested'
      ? { id: REFERENCE_AGENT_ID, role: 'agent', displayName: 'Reference Agent' }
      : event.actor,
    invocationEventId: event.eventType === 'agent.task.requested' ? event.eventId : undefined,
    events: [{eventId: event.eventId, eventType: event.eventType, occurredAt: event.occurredAt}],
    status: event.eventType.slice('agent.task.'.length) as RoomAgentTask['status'],
    actionItems: [],
    skillId: payload.skillId as AgentTaskSkill,
  };
  if (event.eventType === 'agent.task.progressed') {
    task.phase = payload.phase as AgentTaskPhase;
    task.progressText = payload.text as string;
    task.percent = payload.percent as number | undefined;
  }
  if (event.eventType === 'agent.task.awaiting_external_input') {
    task.handoff = payload.handoff as AgentTaskHandoff;
  }
  if (event.eventType === 'agent.task.succeeded') {
    const result = payload.result as Record<string, unknown>;
    task.citations = [...(result.citations as string[])];
    if (result.kind === 'context-summary.v1') {
      task.summary = result.summary as string;
    } else {
      task.actionItems = result.actionItems as ActionItem[];
    }
  }
  if (event.eventType === 'agent.task.failed') {
    task.failureCode = (payload.failure as Record<string, unknown>).code as string;
  }
  return task;
}

export function projectRoomParticipants(
  events: readonly RoomEvent[],
): RoomParticipant[] {
  const participants = new Map<string, RoomParticipant>();
  for (const event of [...events].sort(
    (left, right) => left.sequence - right.sequence,
  )) {
    participants.set(event.actor.id, {
      id: event.actor.id,
      role: event.actor.role,
      displayName: event.actor.displayName ?? fallbackDisplayName(event.actor),
      online: false,
    });
  }
  return [...participants.values()];
}

export function projectRoomEvents(events: readonly RoomEvent[]): RoomProjection {
  const messages: RoomMessage[] = [];
  const decisions = new Map<string, Decision>();
  const tasks = new Map<string, RoomAgentTask>();

  for (const event of [...events].sort(
    (left, right) => left.sequence - right.sequence,
  )) {
    if (event.eventType === 'message.created') {
      const text = readString(event.payload.text);
      if (text) {
        const metadata = readChatMetadata(
          event.payload.mentions,
          event.payload.delivery,
        );
        messages.push({
          eventId: event.eventId,
          actor: event.actor,
          occurredAt: event.occurredAt,
          text,
          ...metadata,
        });
      }
      continue;
    }

    if (event.eventType === 'agent.task.requested' ||
      event.eventType === 'agent.task.progressed' ||
      event.eventType === 'agent.task.awaiting_external_input' ||
      (event.eventType === 'agent.task.succeeded' && 'skillId' in event.payload) ||
      (event.eventType === 'agent.task.failed' && 'skillId' in event.payload)) {
      const externalTask = readExternalTask(event);
      if (!externalTask) continue;
      const previous = tasks.get(externalTask.id);
      const isTerminal = externalTask.status === 'succeeded' || externalTask.status === 'failed';
      tasks.set(externalTask.id, {
        ...previous,
        ...externalTask,
        invocationEventId: externalTask.invocationEventId ?? previous?.invocationEventId,
        events: [...(previous?.events ?? []), ...(externalTask.events ?? [])],
        actionItems: externalTask.actionItems.length > 0 ? externalTask.actionItems : previous?.actionItems ?? [],
        phase: externalTask.phase ?? previous?.phase,
        progressText: externalTask.progressText ?? previous?.progressText,
        percent: externalTask.percent ?? previous?.percent,
        summary: externalTask.summary ?? previous?.summary,
        citations: externalTask.citations ?? previous?.citations,
        handoff: isTerminal ? undefined : externalTask.handoff ?? previous?.handoff,
      });
      continue;
    }

    if (event.eventType.startsWith('agent.task.')) {
      const taskId = readString(event.payload.taskId);
      if (!taskId) continue;
      const status = event.eventType.slice('agent.task.'.length) as RoomAgentTask['status'];
      const actionItems = Array.isArray((event.payload.result as Record<string, unknown> | undefined)?.actionItems)
          ? ((event.payload.result as Record<string, unknown>).actionItems as unknown[])
              .flatMap((item) => isRecord(item) && readString(item.text) ? [{
                text: readString(item.text)!,
                owner: readString(item.owner) ?? undefined,
                due: readString(item.due) ?? undefined,
              }] : [])
          : tasks.get(taskId)?.actionItems ?? [];
      tasks.set(taskId, {
        id: taskId,
        events: [...(tasks.get(taskId)?.events ?? []), {eventId: event.eventId, eventType: event.eventType, occurredAt: event.occurredAt}],
        agent: event.actor,
        status,
        actionItems,
        failureCode: readString((event.payload.failure as Record<string, unknown> | undefined)?.code) ?? undefined,
      });
      continue;
    }

    const decisionId = readString(event.payload.decisionId);
    if (!decisionId) {
      continue;
    }

    if (event.eventType === 'decision.edited') {
      const prior = decisions.get(decisionId);
      if (prior) {
        decisions.set(decisionId, { ...prior, status: 'superseded' });
      }
      continue;
    }

    if (event.eventType === 'decision.deleted') {
      decisions.delete(decisionId);
      continue;
    }

    const title = readString(event.payload.title);
    const summary = readString(event.payload.summary);
    const sourceEventIds = readStringArray(event.payload.sourceEventIds);
    if (!title || !summary || !sourceEventIds) {
      continue;
    }

    const status =
      event.eventType === 'decision.proposed'
        ? 'draft'
        : event.eventType === 'decision.dismissed'
          ? 'dismissed'
          : 'active';
    decisions.set(decisionId, {
      id: decisionId,
      title,
      summary,
      sourceEventIds,
      status,
      derivedFromDecisionId:
        readString(event.payload.derivedFromDecisionId) ?? undefined,
    });
  }

  const projectedDecisions = [...decisions.values()];
  const citeableIds = new Set([
    ...events.map((event) => event.eventId),
    ...projectedDecisions
      .filter((decision) => decision.status === 'active')
      .flatMap((decision) => [decision.id, ...decision.sourceEventIds]),
  ]);

  return {
    messages,
    decisions: projectedDecisions,
    tasks: [...tasks.values()].map((task) => ({
      ...task,
      citations: task.citations?.filter((citation) => citeableIds.has(citation)),
    })),
    participants: projectRoomParticipants(events),
  };
}
