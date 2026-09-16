import { Alert } from '@patternfly/react-core';

import type { Decision, ParticipantRole } from './features/decisions/DecisionCard';

export const CONTRACT_VERSION = 'n2n.room.v1' as const;

export type RoomEventType =
  | 'message.created'
  | 'decision.proposed'
  | 'decision.confirmed'
  | 'decision.edited'
  | 'decision.dismissed';

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
}

export interface RoomProjection {
  messages: RoomMessage[];
  decisions: Decision[];
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
  method: 'room.join' | 'chat.send' | 'decision.transition';
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
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

  return (
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

function fallbackDisplayName(actor: RoomActor): string {
  return `${actor.role === 'human' ? 'Human' : 'Agent'} ${actor.id.slice(0, 8)}`;
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

  for (const event of [...events].sort(
    (left, right) => left.sequence - right.sequence,
  )) {
    if (event.eventType === 'message.created') {
      const text = readString(event.payload.text);
      if (text) {
        messages.push({
          eventId: event.eventId,
          actor: event.actor,
          occurredAt: event.occurredAt,
          text,
        });
      }
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

  return {
    messages,
    decisions: [...decisions.values()],
    participants: projectRoomParticipants(events),
  };
}
