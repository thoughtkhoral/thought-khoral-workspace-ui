import { useCallback, useEffect, useRef, useState } from 'react';

import {
  createRpcRequest,
  isRoomEvent,
  isParticipantUpdate,
  projectRoomParticipants,
  readGatewayError,
  readParticipants,
  type GatewayError,
  type RoomEvent,
  type RoomParticipant,
  type RpcRequest,
} from '../../api';

export interface RoomWebSocket {
  readonly readyState: number;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  send(data: string): void;
  close(): void;
}

export type AuthenticatedSocketFactory = (
  url: string,
  accessToken: string,
) => RoomWebSocket;

export interface UseRoomSocketOptions {
  roomId: string;
  getAccessToken: () => Promise<string>;
  createSocket: AuthenticatedSocketFactory;
  url?: string;
  reconnectDelayMs?: number;
}

export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

function defaultSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeEventParticipants(
  current: readonly RoomParticipant[],
  events: readonly RoomEvent[],
): RoomParticipant[] {
  const participants = new Map(current.map((participant) => [participant.id, participant]));
  for (const participant of projectRoomParticipants(events)) {
    const prior = participants.get(participant.id);
    participants.set(participant.id, {
      ...participant,
      online: prior?.online ?? false,
    });
  }
  return [...participants.values()];
}

export function useRoomSocket({
  roomId,
  getAccessToken,
  createSocket,
  url = defaultSocketUrl(),
  reconnectDelayMs = 1_000,
}: UseRoomSocketOptions) {
  const [events, setEvents] = useState<RoomEvent[]>([]);
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [error, setError] = useState<GatewayError | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [lastSequence, setLastSequence] = useState(0);
  const socketRef = useRef<RoomWebSocket | null>(null);
  const lastSequenceRef = useRef(0);

  const appendEvents = useCallback(
    (received: unknown[]) => {
      const normalized = received
        .filter(isRoomEvent)
        .filter((event) => event.roomId === roomId)
        .sort((left, right) => left.sequence - right.sequence)
        .filter((event) => event.sequence > lastSequenceRef.current);
      if (normalized.length === 0) {
        return;
      }

      const newestSequence = normalized.at(-1)!.sequence;
      lastSequenceRef.current = newestSequence;
      setLastSequence(newestSequence);
      setEvents((current) => [...current, ...normalized]);
      setParticipants((current) => mergeEventParticipants(current, normalized));
    },
    [roomId],
  );

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let hasConnected = false;

    const connect = async () => {
      setStatus(hasConnected ? 'reconnecting' : 'connecting');
      try {
        const accessToken = await getAccessToken();
        if (cancelled) {
          return;
        }

        const socket = createSocket(url, accessToken);
        socketRef.current = socket;

        const onOpen: EventListener = () => {
          hasConnected = true;
          setStatus('connected');
          setError(null);
          const afterSequence = lastSequenceRef.current;
          const join = createRpcRequest(
            'room.join',
            roomId,
            afterSequence > 0 ? { afterSequence } : {},
          );
          socket.send(JSON.stringify(join));
        };
        const onMessage: EventListener = (event) => {
          if (!(event instanceof MessageEvent) || typeof event.data !== 'string') {
            setError({
              code: -32603,
              message: 'The gateway could not complete the request.',
            });
            return;
          }
          let value: unknown;
          try {
            value = JSON.parse(event.data);
          } catch {
            setError({
              code: -32603,
              message: 'The gateway could not complete the request.',
            });
            return;
          }

          const gatewayError = readGatewayError(value);
          if (gatewayError) {
            setError(gatewayError);
            return;
          }
          if (isRoomEvent(value)) {
            appendEvents([value]);
            return;
          }
          if (isParticipantUpdate(value)) {
            if (value.params.roomId === roomId) {
              setParticipants(value.params.participants);
            }
            return;
          }
          if (
            isRecord(value) &&
            isRecord(value.result) &&
            Array.isArray(value.result.events)
          ) {
            appendEvents(value.result.events);
            const joinedParticipants = readParticipants(value.result.participants);
            if (joinedParticipants) {
              setParticipants(joinedParticipants);
            }
          }
        };
        const onClose: EventListener = () => {
          if (cancelled) {
            return;
          }
          setStatus('reconnecting');
          reconnectTimer = setTimeout(connect, reconnectDelayMs);
        };
        const onError: EventListener = () => {
          setError({
            code: -32603,
            message: 'The gateway could not complete the request.',
          });
        };

        socket.addEventListener('open', onOpen);
        socket.addEventListener('message', onMessage);
        socket.addEventListener('close', onClose);
        socket.addEventListener('error', onError);
      } catch {
        if (!cancelled) {
          setStatus('disconnected');
          setError({
            code: -32001,
            message: 'Your session is not authenticated. Sign in again.',
          });
        }
      }
    };

    void connect();
    return () => {
      cancelled = true;
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
      }
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [appendEvents, createSocket, getAccessToken, reconnectDelayMs, roomId, url]);

  const send = useCallback(
    (
      method: Exclude<RpcRequest['method'], 'room.join'>,
      params: Record<string, unknown>,
    ) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        setError({
          code: -32603,
          message: 'The gateway could not complete the request.',
        });
        return false;
      }
      socket.send(JSON.stringify(createRpcRequest(method, roomId, params)));
      return true;
    },
    [roomId],
  );

  return { events, participants, error, status, lastSequence, send };
}
