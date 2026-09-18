import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { ChatStream } from './ChatStream';

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
        onCommand={onCommand}
        canManageDecisions
        onSendMessage={onSendMessage}
      />,
    );

    const input = container.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Message"]',
    )!;
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
        onCommand={onCommand}
        onSendMessage={onSendMessage}
      />,
    );

    const input = container.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Message"]',
    )!;
    await user.type(input, 'ordinary room message');
    await user.keyboard('{Enter}');
    await user.clear(input);
    await user.type(input, '/decisions');
    await user.keyboard('{Enter}');

    expect(onCommand).not.toHaveBeenCalled();
    expect(onSendMessage).toHaveBeenCalledWith('ordinary room message');
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
        onCommand={onCommand}
        canManageDecisions
        onSendMessage={onSendMessage}
      />,
    );

    const input = container.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Message"]',
    )!;
    await user.type(input, '/unknown');
    await user.keyboard('{Enter}');

    expect(onCommand).not.toHaveBeenCalled();
    expect(onSendMessage).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Unknown command. Try /decisions.',
    );
  });
});
