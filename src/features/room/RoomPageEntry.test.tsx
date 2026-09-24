import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { RoomPage } from './RoomPage';
import type { RoomWebSocket } from './useRoomSocket';

// Room entry does not depend on the lazy chat implementation. Its production
// import/render path is covered by the static-preview smoke check.
vi.mock('./ChatStream', () => ({ ChatStream: () => null }));

afterEach(cleanup);

class FakeRoomSocket extends EventTarget implements RoomWebSocket {
  readonly sent: string[] = [];
  readyState: number = WebSocket.CONNECTING;

  open() {
    this.readyState = WebSocket.OPEN;
    this.dispatchEvent(new Event('open'));
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = WebSocket.CLOSED;
  }
}

it('enters the suggested room only after explicit confirmation', async () => {
  const roomId = '10000000-0000-4000-8000-000000000001';
  const socket = new FakeRoomSocket();
  const createSocket = vi.fn(() => socket);
  const onEnterRoom = vi.fn();
  const user = userEvent.setup();

  render(
    <RoomPage
      roomId={roomId}
      participantRole="human"
      getAccessToken={async () => 'opaque-access-token'}
      createSocket={createSocket}
      onEnterRoom={onEnterRoom}
    />,
  );

  expect(createSocket).not.toHaveBeenCalled();
  expect(onEnterRoom).not.toHaveBeenCalled();

  await user.click(screen.getByRole('button', { name: 'Enter room' }));
  expect(onEnterRoom).toHaveBeenCalledWith(roomId);
  await act(async () => {
    await Promise.resolve();
  });
  expect(createSocket).toHaveBeenCalledOnce();

  act(() => socket.open());
  expect(JSON.parse(socket.sent[0]!).method).toBe('room.join');
  expect(JSON.parse(socket.sent[0]!).params.roomId).toBe(roomId);
});
