import { describe, expect, it } from 'vitest';

import {
  CONTRACT_VERSION,
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
