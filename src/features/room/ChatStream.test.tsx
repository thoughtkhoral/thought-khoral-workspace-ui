import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { RoomParticipant } from '../../api';
import { ChatStream } from './ChatStream';

const participants: RoomParticipant[] = [
  { id: 'maya-1', role: 'human', displayName: 'Maya Chen', online: true },
  { id: 'bot-2', role: 'agent', displayName: 'Scout Bot', online: true },
];

function inputFor(container: HTMLElement) {
  return container.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label="Message"]',
  )!;
}

describe('ChatStream', () => {
  beforeAll(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        disconnect() {}
        observe() {}
        unobserve() {}
      },
    );
  });

  it('renders the PatternFly room conversation', () => {
    render(
      <ChatStream
        isConnected
        messages={[]}
        participants={participants}
        onSendMessage={() => undefined}
      />,
    );

    const conversation = screen.getByLabelText('Room conversation');

    expect(conversation).toBeTruthy();
    expect(conversation.parentElement?.className).toContain(
      'thought-khoral-room-chatbot',
    );
  });

  it('consumes the exact /decisions command for human participants', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    const onSendMessage = vi.fn();
    const { container } = render(
      <ChatStream
        isConnected
        messages={[]}
        participants={participants}
        onCommand={onCommand}
        canManageDecisions
        onSendMessage={onSendMessage}
      />,
    );

    const input = inputFor(container);
    await user.type(input, '/decisions');
    await user.keyboard('{Enter}');

    expect(onCommand).toHaveBeenCalledWith('decisions');
    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it('passes ordinary messages through and rejects decision commands for agents', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    const onSendMessage = vi.fn();
    const { container } = render(
      <ChatStream
        isConnected
        messages={[]}
        participants={participants}
        onCommand={onCommand}
        onSendMessage={onSendMessage}
      />,
    );

    const input = inputFor(container);
    await user.type(input, 'ordinary room message');
    await user.keyboard('{Enter}');
    await user.clear(input);
    await user.type(input, '/decisions');
    await user.keyboard('{Enter}');

    expect(onCommand).not.toHaveBeenCalled();
    expect(onSendMessage).toHaveBeenCalledWith({
      text: 'ordinary room message',
      mentions: [],
      delivery: 'room',
    });
    expect(onSendMessage).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Decision commands are available to human participants only.',
    );
  });

  it('rejects unknown slash commands without sending them to the room', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    const onSendMessage = vi.fn();
    const { container } = render(
      <ChatStream
        isConnected
        messages={[]}
        participants={participants}
        onCommand={onCommand}
        canManageDecisions
        onSendMessage={onSendMessage}
      />,
    );

    const input = inputFor(container);
    await user.type(input, '/unknown');
    await user.keyboard('{Enter}');

    expect(onCommand).not.toHaveBeenCalled();
    expect(onSendMessage).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Unrecognized command: /unknown',
    );
    expect(container.querySelector('[role="alert"]')?.textContent).not.toContain(
      'Try /decisions',
    );

    await user.type(input, ' ordinary message');
    await user.keyboard('{Enter}');
    expect(container.querySelector('[role="alert"]')).toBeTruthy();

    await user.click(
      container.querySelector<HTMLButtonElement>(
        'button[aria-label="Dismiss command error"]',
      )!,
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('sends multiple participant targets selected with the keyboard', async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn();
    const { container } = render(
      <ChatStream isConnected messages={[]} participants={participants} onSendMessage={onSendMessage} />,
    );

    const input = inputFor(container);
    await user.type(input, 'Hello @');
    expect(screen.getByRole('listbox', { name: 'Mention suggestions' })).toBeTruthy();
    await user.keyboard('{Enter} and @sc');
    await user.keyboard('{Enter}');
    await user.click(within(container).getByRole('button', { name: 'Send message' }));

    expect(onSendMessage).toHaveBeenCalledWith({
      text: 'Hello @maya-chen and @scout-bot',
      mentions: [
        { type: 'participant', id: 'maya-1', token: 'maya-chen' },
        { type: 'participant', id: 'bot-2', token: 'scout-bot' },
      ],
      delivery: 'room',
    });
  });

  it.each([
    ['allhumans', 'allhumans'],
    ['allagents', 'allagents'],
  ] as const)('sends the @%s alias', async (alias, token) => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn();
    const { container } = render(
      <ChatStream isConnected messages={[]} participants={participants} onSendMessage={onSendMessage} />,
    );

    await user.type(inputFor(container), `Hi @${alias}`);
    await user.keyboard('{Tab}{Enter}');

    expect(onSendMessage).toHaveBeenCalledWith({
      text: `Hi @${token}`,
      mentions: [{ type: 'alias', alias }],
      delivery: 'room',
    });
  });

  it('sends mentioned-only delivery and blocks it without a target', async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn();
    const { container } = render(
      <ChatStream isConnected messages={[]} participants={participants} onSendMessage={onSendMessage} />,
    );

    await user.selectOptions(within(container).getByLabelText('Message delivery'), 'mentioned');
    await user.type(inputFor(container), 'Private message');
    expect((within(container).getByRole('button', { name: 'Send message' }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(inputFor(container), ' @maya');
    await user.keyboard('{Enter}');
    await user.click(within(container).getByRole('button', { name: 'Send message' }));

    expect(onSendMessage).toHaveBeenCalledWith({
      text: 'Private message @maya-chen',
      mentions: [{ type: 'participant', id: 'maya-1', token: 'maya-chen' }],
      delivery: 'mentioned',
    });
  });

  it('blocks unresolved tokens, including targets removed from the roster', async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn();
    const { container, rerender } = render(
      <ChatStream isConnected messages={[]} participants={participants} onSendMessage={onSendMessage} />,
    );

    await user.type(inputFor(container), 'Hello @missing');
    expect(within(container).getByRole('alert').textContent).toContain('@missing');
    expect((within(container).getByRole('button', { name: 'Send message' }) as HTMLButtonElement).disabled).toBe(true);

    await user.clear(inputFor(container));
    await user.type(inputFor(container), 'Hello @maya');
    await user.keyboard('{Enter}');
    rerender(<ChatStream isConnected messages={[]} participants={[participants[1]]} onSendMessage={onSendMessage} />);
    expect(within(container).getByRole('alert').textContent).toContain('@maya-chen');
    expect((within(container).getByRole('button', { name: 'Send message' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders safe accessible transcript mentions and targeted delivery', () => {
    render(
      <ChatStream
        isConnected
        participants={participants}
        onSendMessage={() => undefined}
        messages={[{
          eventId: 'message-1',
          actor: { id: 'maya-1', role: 'human', displayName: 'Maya Chen' },
          occurredAt: '2026-09-18T12:00:00Z',
          text: 'Hello @maya-chen and @allagents <strong>unsafe</strong>',
          mentions: [
            { type: 'participant', id: 'maya-1', token: 'maya-chen' },
            { type: 'alias', alias: 'allagents' },
          ],
          delivery: 'mentioned',
        }]}
      />,
    );

    expect(screen.getByLabelText('Mention Maya Chen, human participant').textContent).toBe('@maya-chen');
    expect(screen.getByLabelText('Mention all agents').textContent).toBe('@allagents');
    expect(document.querySelector('.thought-khoral-targeted-delivery')?.textContent).toBe('Mentioned participants only');
    expect(document.querySelector('strong')).toBeNull();
    expect(document.body.textContent).toContain('<strong>unsafe</strong>');
  });
});
