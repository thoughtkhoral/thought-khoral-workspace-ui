import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GatewayErrorAlert, projectRoomEvents } from '../../api';
import { DecisionCard } from './DecisionCard';
import { DecisionEditForm } from './DecisionEditForm';
import {
  useRoomSocket,
  type RoomWebSocket,
} from '../room/useRoomSocket';
import { RoomPage } from '../room/RoomPage';

afterEach(cleanup);

const draftDecision = {
  id: 'decision-42',
  title: 'Select the deployment region',
  summary: 'Use us-east-1 for the first production deployment.',
  sourceEventIds: ['event-7', 'event-11'],
  status: 'draft' as const,
};

describe('DecisionCard', () => {
  it('lets a human confirm a draft decision', async () => {
    const onTransition = vi.fn();
    const user = userEvent.setup();

    render(
      <DecisionCard
        decision={draftDecision}
        participantRole="human"
        onTransition={onTransition}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeNull();
    expect(screen.queryByText(/event-7, event-11/)).not.toBeNull();
    expect(screen.queryByText('draft')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onTransition).toHaveBeenCalledWith({
      action: 'confirm',
      decisionId: draftDecision.id,
    });
  });

  it('does not offer decision actions to an agent', () => {
    render(
      <DecisionCard
        decision={draftDecision}
        participantRole="agent"
        onTransition={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('does not offer decision actions for an active decision', () => {
    render(
      <DecisionCard
        decision={{ ...draftDecision, status: 'active' }}
        participantRole="human"
        onTransition={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('DecisionEditForm', () => {
  it('requires a non-empty title and summary before sending an edit', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <DecisionEditForm
        decision={draftDecision}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.clear(screen.getByRole('textbox', { name: 'Title' }));
    await user.clear(screen.getByRole('textbox', { name: 'Summary' }));
    await user.click(screen.getByRole('button', { name: 'Save decision' }));

    expect(screen.queryByText('Enter a decision title.')).not.toBeNull();
    expect(screen.queryByText('Enter a decision summary.')).not.toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(
      screen.getByRole('textbox', { name: 'Title' }),
      'Approved title',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Summary' }),
      'Approved summary',
    );
    await user.click(screen.getByRole('button', { name: 'Save decision' }));

    expect(onSubmit).toHaveBeenCalledWith({
      action: 'edit',
      decisionId: draftDecision.id,
      editedTitle: 'Approved title',
      editedSummary: 'Approved summary',
    });
  });
});

describe('gateway error rendering', () => {
  it('announces a safe structured error without wire details', () => {
    render(
      <GatewayErrorAlert
        error={{
          code: -32003,
          message: 'Forbidden: eyJhbGciOiJSUzI1NiJ9.secret.signature',
          data: { stack: 'handler.ts:42\nsecret internals' },
        }}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain(
      'You are not allowed to perform this action.',
    );
    expect(alert.textContent).toContain('-32003');
    expect(alert.textContent).not.toContain('eyJ');
    expect(alert.textContent).not.toContain('handler.ts');
    expect(alert.textContent).not.toContain('secret');
  });
});

describe('normalized room events', () => {
  it('marks a decision active only after a normalized confirmation event', () => {
    const proposed = {
      contractVersion: 'n2n.room.v1' as const,
      requestId: 'request-1',
      roomId: 'room-1',
      occurredAt: '2026-09-11T12:00:00Z',
      sequence: 1,
      eventId: 'event-1',
      eventType: 'decision.proposed' as const,
      actor: { id: 'actor-1', role: 'agent' as const },
      payload: {
        decisionId: draftDecision.id,
        status: 'draft' as const,
        title: draftDecision.title,
        summary: draftDecision.summary,
        sourceEventIds: draftDecision.sourceEventIds,
      },
    };
    const beforeConfirmation = projectRoomEvents([proposed]);

    expect(beforeConfirmation.decisions[0]?.status).toBe('draft');

    const confirmed = {
      ...proposed,
      requestId: 'request-2',
      sequence: 2,
      eventId: 'event-2',
      eventType: 'decision.confirmed' as const,
      actor: { id: 'actor-2', role: 'human' as const },
      payload: { ...proposed.payload, status: 'active' as const },
    };
    const afterConfirmation = projectRoomEvents([proposed, confirmed]);

    expect(afterConfirmation.decisions[0]?.status).toBe('active');
  });
});

class FakeRoomSocket extends EventTarget implements RoomWebSocket {
  readonly sent: string[] = [];
  readyState: number = WebSocket.CONNECTING;

  open() {
    this.readyState = WebSocket.OPEN;
    this.dispatchEvent(new Event('open'));
  }

  receive(value: unknown) {
    this.dispatchEvent(
      new MessageEvent('message', { data: JSON.stringify(value) }),
    );
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = WebSocket.CLOSED;
  }
}

describe('useRoomSocket', () => {
  it('joins after token acquisition and reconnects from the last server sequence', async () => {
    const sockets: FakeRoomSocket[] = [];
    const createSocket = vi.fn((_url: string, accessToken: string) => {
      expect(accessToken).toBe('opaque-access-token');
      const socket = new FakeRoomSocket();
      sockets.push(socket);
      return socket;
    });

    const { result, unmount } = renderHook(() =>
      useRoomSocket({
        roomId: 'room-1',
        getAccessToken: async () => 'opaque-access-token',
        createSocket,
        reconnectDelayMs: 0,
      }),
    );

    await waitFor(() => expect(sockets).toHaveLength(1));
    act(() => sockets[0]!.open());

    const firstJoin = JSON.parse(sockets[0]!.sent[0]!);
    expect(firstJoin.method).toBe('room.join');
    expect(firstJoin.params.afterSequence).toBeUndefined();

    act(() => {
      sockets[0]!.receive({
        eventType: 'message.created',
        sequence: 4,
        payload: { text: 'Unnormalized message' },
      });
    });
    expect(result.current.events).toHaveLength(0);

    act(() => {
      sockets[0]!.receive({
        contractVersion: 'n2n.room.v1',
        requestId: 'request-5',
        roomId: 'room-1',
        occurredAt: '2026-09-11T12:00:00Z',
        sequence: 5,
        eventId: 'event-5',
        eventType: 'message.created',
        actor: { id: 'actor-1', role: 'human' },
        payload: { text: 'Server-normalized message' },
      });
    });
    expect(result.current.lastSequence).toBe(5);

    act(() => sockets[0]!.dispatchEvent(new Event('close')));
    await waitFor(() => expect(sockets).toHaveLength(2));
    act(() => sockets[1]!.open());

    const replayJoin = JSON.parse(sockets[1]!.sent[0]!);
    expect(replayJoin.params.afterSequence).toBe(5);
    unmount();
  });

  it('projects join participants and applies live presence updates', async () => {
    const socket = new FakeRoomSocket();
    const createSocket = vi.fn(() => socket);
    const { result } = renderHook(() =>
      useRoomSocket({
        roomId: 'room-1',
        getAccessToken: async () => 'opaque-access-token',
        createSocket,
      }),
    );

    await waitFor(() => expect(createSocket).toHaveBeenCalledOnce());
    act(() => socket.open());
    act(() =>
      socket.receive({
        jsonrpc: '2.0',
        id: 'join-response',
        result: {
          events: [],
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
    );

    expect(result.current.participants).toEqual([
      {
        id: 'actor-1',
        role: 'human',
        displayName: 'Maya Chen',
        online: true,
      },
    ]);

    act(() =>
      socket.receive({
        jsonrpc: '2.0',
        method: 'room.participants.updated',
        params: {
          contractVersion: 'n2n.room.v1',
          roomId: 'room-1',
          participants: [
            {
              id: 'actor-1',
              role: 'human',
              displayName: 'Maya Chen',
              online: false,
            },
          ],
        },
      }),
    );

    expect(result.current.participants[0]?.online).toBe(false);
  });
});

describe('RoomPage governance', () => {
  it('opens the participant roster with named room actors', async () => {
    const socket = new FakeRoomSocket();
    const createSocket = vi.fn(() => socket);

    render(
      <RoomPage
        roomId="room-1"
        participantRole="human"
        getAccessToken={async () => 'opaque-access-token'}
        createSocket={createSocket}
      />,
    );
    await waitFor(() => expect(createSocket).toHaveBeenCalledOnce());
    act(() => socket.open());
    act(() =>
      socket.receive({
        contractVersion: 'n2n.room.v1',
        requestId: 'request-1',
        roomId: 'room-1',
        occurredAt: '2026-09-15T12:00:00Z',
        sequence: 1,
        eventId: 'event-1',
        eventType: 'message.created',
        actor: { id: 'actor-1', role: 'human', displayName: 'Maya Chen' },
        payload: { text: 'Hello' },
      }),
    );

    expect(screen.getAllByText('Maya Chen')).toHaveLength(2);
    expect(screen.getByText('Offline')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close participants' })).toBeTruthy();
  });

  it('waits for a normalized confirmation before showing active memory', async () => {
    const socket = new FakeRoomSocket();
    const createSocket = vi.fn(() => socket);
    const getAccessToken = vi.fn(async () => 'opaque-access-token');
    const user = userEvent.setup();

    render(
      <RoomPage
        roomId="room-1"
        participantRole="human"
        getAccessToken={getAccessToken}
        createSocket={createSocket}
      />,
    );
    await waitFor(() => expect(createSocket).toHaveBeenCalledOnce());
    act(() => socket.open());
    act(() =>
      socket.receive({
        contractVersion: 'n2n.room.v1',
        requestId: 'request-1',
        roomId: 'room-1',
        occurredAt: '2026-09-11T12:00:00Z',
        sequence: 1,
        eventId: 'event-1',
        eventType: 'decision.proposed',
        actor: { id: 'actor-1', role: 'agent' },
        payload: {
          decisionId: draftDecision.id,
          status: 'draft',
          title: draftDecision.title,
          summary: draftDecision.summary,
          sourceEventIds: draftDecision.sourceEventIds,
        },
      }),
    );

    await user.click(await screen.findByRole('button', { name: 'Confirm' }));
    const transition = socket.sent
      .map((item) => JSON.parse(item))
      .find((item) => item.method === 'decision.transition');
    expect(transition.params).toMatchObject({
      action: 'confirm',
      decisionId: draftDecision.id,
    });

    await user.click(
      screen.getByRole('button', { name: 'Open collective memory' }),
    );
    expect(screen.queryByText('No active decisions yet.')).not.toBeNull();

    act(() =>
      socket.receive({
        contractVersion: 'n2n.room.v1',
        requestId: 'request-2',
        roomId: 'room-1',
        occurredAt: '2026-09-11T12:01:00Z',
        sequence: 2,
        eventId: 'event-2',
        eventType: 'decision.confirmed',
        actor: { id: 'actor-2', role: 'human' },
        payload: {
          decisionId: draftDecision.id,
          status: 'active',
          title: draftDecision.title,
          summary: draftDecision.summary,
          sourceEventIds: draftDecision.sourceEventIds,
        },
      }),
    );

    await waitFor(() =>
      expect(screen.queryByText('No active decisions yet.')).toBeNull(),
    );
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
  });
});
