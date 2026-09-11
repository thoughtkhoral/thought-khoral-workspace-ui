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

    expect(screen.getByLabelText('Room conversation')).toBeTruthy();
  });
});
