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

describe('external agent task projection', () => {
  const taskId = '84000000-0000-4000-8000-000000000001';
  const citationId = '83000000-0000-4000-8000-000000000001';
  const externalAgentId = '74686f75-6768-746b-686f-72616c000003';
  const requested: RoomEvent = {
    ...messageEvent,
    sequence: 2,
    eventId: '82000000-0000-4000-8000-000000000001',
    eventType: 'agent.task.requested',
    actor: { id: externalAgentId, role: 'agent', displayName: 'Reference Agent' },
    payload: {
      taskId,
      agentId: externalAgentId,
      requesterId: '85000000-0000-4000-8000-000000000001',
      skillId: 'summarize-context',
      contextRevision: 4,
    },
  };

  it('projects requested, progressed, and successful context summaries with persisted citations', () => {
    const progressed: RoomEvent = {
      ...requested,
      sequence: 3,
      eventId: '82000000-0000-4000-8000-000000000002',
      eventType: 'agent.task.progressed',
      payload: {
        ...requested.payload,
        phase: 'working',
        text: 'Summarizing the room context.',
        percent: 75,
      },
    };
    const succeeded: RoomEvent = {
      ...requested,
      sequence: 4,
      eventId: '82000000-0000-4000-8000-000000000003',
      eventType: 'agent.task.succeeded',
      payload: {
        ...requested.payload,
        result: {
          kind: 'context-summary.v1',
          summary: 'The room agreed to ship the gateway foundation.',
          citations: [citationId],
        },
      },
    };
    const citedMessage: RoomEvent = { ...messageEvent, eventId: citationId };

    expect(projectRoomEvents([requested, progressed, succeeded, citedMessage]).tasks).toEqual([
      expect.objectContaining({
        id: taskId,
        status: 'succeeded',
        skillId: 'summarize-context',
        phase: 'working',
        progressText: 'Summarizing the room context.',
        percent: 75,
        summary: 'The room agreed to ship the gateway foundation.',
        citations: [citationId],
      }),
    ]);
  });

  it('rejects malformed external task events instead of projecting unsafe data', () => {
    const malformed: RoomEvent = {
      ...requested,
      eventType: 'agent.task.awaiting_external_input',
      payload: {
        ...requested.payload,
        handoff: {
          instruction: 'Continue outside the room.',
          url: 'https://example.test/continue',
          host: 'different.example.test',
          expiresAt: '2026-09-22T13:00:00Z',
        },
      },
    };

    expect(isRoomEvent(malformed)).toBe(false);
    expect(projectRoomEvents([malformed]).tasks).toEqual([]);
  });

  it('projects requested, progressed, and successful action item extraction', () => {
    const requestedAction: RoomEvent = {
      ...requested,
      payload: { ...requested.payload, skillId: 'extract-action-items' },
    };
    const progressed: RoomEvent = {
      ...requestedAction,
      sequence: 3,
      eventType: 'agent.task.progressed',
      payload: {
        ...requestedAction.payload,
        phase: 'retrieving-context',
        text: 'Reviewing the persisted discussion.',
      },
    };
    const succeeded: RoomEvent = {
      ...requestedAction,
      sequence: 4,
      eventType: 'agent.task.succeeded',
      payload: {
        ...requestedAction.payload,
        result: {
          kind: 'action-items.v1',
          actionItems: [{ text: 'Prepare rollout checklist', owner: 'Maya' }],
          citations: [],
        },
      },
    };

    expect(projectRoomEvents([requestedAction, progressed, succeeded]).tasks).toEqual([
      expect.objectContaining({
        status: 'succeeded',
        skillId: 'extract-action-items',
        phase: 'retrieving-context',
        actionItems: [{ text: 'Prepare rollout checklist', owner: 'Maya' }],
      }),
    ]);
  });

  it('retains citations to active decisions and clears an awaiting handoff on success', () => {
    const decisionId = '86000000-0000-4000-8000-000000000001';
    const proposed: RoomEvent = {
      ...messageEvent,
      sequence: 2,
      eventId: '86000000-0000-4000-8000-000000000002',
      eventType: 'decision.proposed',
      payload: {
        decisionId,
        title: 'Ship the foundation',
        summary: 'The gateway foundation is approved.',
        sourceEventIds: [citationId],
      },
    };
    const confirmed: RoomEvent = {
      ...proposed,
      sequence: 3,
      eventId: '86000000-0000-4000-8000-000000000003',
      eventType: 'decision.confirmed',
    };
    const awaiting: RoomEvent = {
      ...requested,
      sequence: 4,
      eventType: 'agent.task.awaiting_external_input',
      payload: {
        ...requested.payload,
        handoff: {
          instruction: 'Sign in to continue.',
          url: 'https://handoff.example.test/continue',
          host: 'handoff.example.test',
          expiresAt: '2026-09-22T13:00:00Z',
        },
      },
    };
    const succeeded: RoomEvent = {
      ...requested,
      sequence: 5,
      eventType: 'agent.task.succeeded',
      payload: {
        ...requested.payload,
        result: {
          kind: 'context-summary.v1',
          summary: 'The decision is approved.',
          citations: [decisionId, citationId],
        },
      },
    };

    const room = projectRoomEvents([messageEvent, proposed, confirmed, requested, awaiting, succeeded]);

    expect(room.decisions).toEqual([expect.objectContaining({ id: decisionId, status: 'active' })]);
    expect(room.tasks).toEqual([expect.objectContaining({
      citations: [decisionId, citationId],
      handoff: undefined,
      status: 'succeeded',
    })]);
  });

  it('clears an awaiting handoff when an external task fails', () => {
    const awaiting: RoomEvent = {
      ...requested,
      sequence: 3,
      eventType: 'agent.task.awaiting_external_input',
      payload: {
        ...requested.payload,
        handoff: {
          instruction: 'Sign in to continue.',
          url: 'https://handoff.example.test/continue',
          host: 'handoff.example.test',
          expiresAt: '2026-09-22T13:00:00Z',
        },
      },
    };
    const failed: RoomEvent = {
      ...requested,
      sequence: 4,
      eventType: 'agent.task.failed',
      payload: {
        ...requested.payload,
        failure: { code: 'execution_failed' },
      },
    };

    expect(projectRoomEvents([requested, awaiting, failed]).tasks).toEqual([
      expect.objectContaining({ handoff: undefined, status: 'failed' }),
    ]);
  });
});
