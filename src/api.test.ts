import { describe, expect, it } from 'vitest';

import {
  CONTRACT_VERSION,
  isRoomEvent,
  isParticipantUpdate,
  projectRoomEvents,
  type RoomEvent,
} from './api';

const messageEvent: RoomEvent = {
  contractVersion: CONTRACT_VERSION,
  requestId: 'request-1',
  roomId: 'room-1',
  occurredAt: '2026-09-15T12:00:00Z',
  sequence: 1,
  eventId: 'event-1',
  eventType: 'message.created',
  actor: {
    id: 'actor-1',
    role: 'human',
    displayName: 'Maya Chen',
  },
  payload: { text: 'Hello' },
};

describe('room participant projection', () => {
  it('keeps actor names and derives an offline participant from room history', () => {
    const room = projectRoomEvents([messageEvent]);

    expect(room.participants).toEqual([
      {
        id: 'actor-1',
        role: 'human',
        displayName: 'Maya Chen',
        online: false,
      },
    ]);
  });

  it('recognizes an ephemeral participant update notification', () => {
    expect(
      isParticipantUpdate({
        jsonrpc: '2.0',
        method: 'room.participants.updated',
        params: {
          contractVersion: CONTRACT_VERSION,
          roomId: 'room-1',
          participants: [
            {
              id: 'actor-1',
              role: 'human',
              displayName: 'Maya Chen',
              online: true,
            },
          ],
        },
      }),
    ).toBe(true);
  });
});

describe('room decision projection', () => {
  it('removes a decision after a decision.deleted event', () => {
    const proposed: RoomEvent = {
      ...messageEvent,
      sequence: 2,
      eventId: 'decision-proposed',
      eventType: 'decision.proposed',
      payload: {
        decisionId: 'decision-1',
        title: 'Adopt JSON-RPC',
        summary: 'Use JSON-RPC for room mutations.',
        sourceEventIds: ['event-1'],
      },
    };
    const deleted: RoomEvent = {
      ...proposed,
      sequence: 3,
      eventId: 'decision-deleted',
      eventType: 'decision.deleted',
      payload: {
        decisionId: 'decision-1',
        priorStatus: 'draft',
        title: 'Adopt JSON-RPC',
        summary: 'Use JSON-RPC for room mutations.',
        sourceEventIds: ['event-1'],
      },
    };

    expect(projectRoomEvents([proposed, deleted]).decisions).toEqual([]);
  });

  it('accepts decision.deleted room events', () => {
    expect(
      isRoomEvent({
        ...messageEvent,
        eventId: 'decision-deleted',
        eventType: 'decision.deleted',
        payload: {
          decisionId: 'decision-1',
          priorStatus: 'draft',
          title: 'Adopt JSON-RPC',
          summary: 'Use JSON-RPC for room mutations.',
          sourceEventIds: ['event-1'],
        },
      }),
    ).toBe(true);
  });
});
