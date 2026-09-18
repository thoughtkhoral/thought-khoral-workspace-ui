import { describe, expect, it } from 'vitest';

import {
  CONTRACT_VERSION,
  isRoomEvent,
  isParticipantUpdate,
  projectRoomEvents,
  readGatewayError,
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

describe('chat message metadata projection', () => {
  it('projects valid mentions and mentioned delivery from a chat message', () => {
    const room = projectRoomEvents([
      {
        ...messageEvent,
        payload: {
          text: 'Please review this, @Maya and @allagents.',
          mentions: [
            {
              type: 'participant',
              id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
              token: 'maya-chen',
            },
            { type: 'alias', alias: 'allagents' },
          ],
          delivery: 'mentioned',
        },
      },
    ]);

    expect(room.messages).toEqual([
      {
        eventId: 'event-1',
        actor: messageEvent.actor,
        occurredAt: '2026-09-15T12:00:00Z',
        text: 'Please review this, @Maya and @allagents.',
        mentions: [
          {
            type: 'participant',
            id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
            token: 'maya-chen',
          },
          { type: 'alias', alias: 'allagents' },
        ],
        delivery: 'mentioned',
      },
    ]);
  });

  it('accepts a one-word participant token allowed by the contract', () => {
    const room = projectRoomEvents([
      {
        ...messageEvent,
        payload: {
          text: 'Please review this, @maya.',
          mentions: [
            {
              type: 'participant',
              id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
              token: 'maya',
            },
          ],
          delivery: 'mentioned',
        },
      },
    ]);

    expect(room.messages[0]).toMatchObject({
      mentions: [
        {
          type: 'participant',
          id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
          token: 'maya',
        },
      ],
      delivery: 'mentioned',
    });
  });

  it('defaults legacy chat messages without metadata to room delivery', () => {
    const room = projectRoomEvents([messageEvent]);

    expect(room.messages[0]).toMatchObject({
      mentions: [],
      delivery: 'room',
    });
  });

  it.each([
    [
      'has malformed participant metadata',
      [{ type: 'participant', id: 'maya-1', token: '@maya-chen' }],
      'mentioned',
    ],
    [
      'has an invalid delivery with valid mentions',
      [
        {
          type: 'participant',
          id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
          token: 'maya-chen',
        },
      ],
      'direct',
    ],
    ['marks an empty mention list as mentioned', [], 'mentioned'],
    [
      'contains duplicate mentions',
      [
        {
          type: 'participant',
          id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
          token: 'maya-chen',
        },
        {
          type: 'participant',
          id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
          token: 'maya-chen',
        },
      ],
      'mentioned',
    ],
    [
      'contains more than 50 mentions',
      Array.from({ length: 51 }, (_, index) => ({
        type: 'participant',
        id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        token: `person-${index}`,
      })),
      'mentioned',
    ],
  ])('falls back to safe metadata when a chat message %s', (_, mentions, delivery) => {
    const room = projectRoomEvents([
      {
        ...messageEvent,
        payload: { text: 'Hello', mentions, delivery },
      },
    ]);

    expect(room.messages[0]).toMatchObject({ mentions: [], delivery: 'room' });
  });
});

describe('gateway error mapping', () => {
  it('explains unknown mentioned participants', () => {
    expect(readGatewayError({ code: -32013 })).toEqual({
      code: -32013,
      message: 'The message mentions an unknown participant.',
    });
  });
});
