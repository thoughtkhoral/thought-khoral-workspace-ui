import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ParticipantDrawer } from './ParticipantDrawer';

const participants = [
  {
    id: 'human-1',
    role: 'human' as const,
    displayName: 'Maya Chen',
    online: true,
  },
  {
    id: 'agent-1',
    role: 'agent' as const,
    displayName: 'Atlas Planner',
    online: false,
  },
];

describe('ParticipantDrawer', () => {
  it('shows all participants with roles and explicit presence text', () => {
    render(
      <ParticipantDrawer
        participants={participants}
        isExpanded
        onClose={() => undefined}
      >
        <main>Conversation</main>
      </ParticipantDrawer>,
    );

    expect(screen.getByLabelText('Participants')).toBeTruthy();
    expect(screen.getByText('Maya Chen')).toBeTruthy();
    expect(screen.getByText('Atlas Planner')).toBeTruthy();
    expect(screen.getByText('Human')).toBeTruthy();
    expect(screen.getByText('Agent')).toBeTruthy();
    expect(screen.getByText('Online')).toBeTruthy();
    expect(screen.getByText('Offline')).toBeTruthy();
  });

  it('closes when Escape is pressed', () => {
    let closeCount = 0;
    render(
      <ParticipantDrawer
        participants={participants}
        isExpanded
        onClose={() => {
          closeCount += 1;
        }}
      >
        <main>Conversation</main>
      </ParticipantDrawer>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(closeCount).toBe(1);
  });
});
