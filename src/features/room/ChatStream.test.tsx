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

  it('passes ordinary messages through and does not expose the command to agents', async () => {
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
    await user.type(input, '/decisions please');
    await user.keyboard('{Enter}');
    await user.clear(input);
    await user.type(input, '/decisions');
    await user.keyboard('{Enter}');

    expect(onCommand).not.toHaveBeenCalled();
    expect(onSendMessage).toHaveBeenNthCalledWith(1, '/decisions please');
    expect(onSendMessage).toHaveBeenNthCalledWith(2, '/decisions');
  });
});
