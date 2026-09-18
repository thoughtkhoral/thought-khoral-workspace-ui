import { render, screen } from '@testing-library/react';
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
});
