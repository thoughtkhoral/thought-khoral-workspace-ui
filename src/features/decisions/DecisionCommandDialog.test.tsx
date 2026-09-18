import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DecisionCommandDialog } from './DecisionCommandDialog';

const draft = {
  id: 'decision-1',
  title: 'Draft decision',
  summary: 'Draft summary',
  sourceEventIds: [],
  status: 'draft' as const,
};

const active = {
  id: 'decision-2',
  title: 'Active decision',
  summary: 'Active summary',
  sourceEventIds: [],
  status: 'active' as const,
};

afterEach(cleanup);

describe('DecisionCommandDialog', () => {
  it('creates a decision with optional source evidence and can cancel', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const onCancel = vi.fn();
    render(
      <DecisionCommandDialog
        isOpen
        decisions={[]}
        messages={[
          {
            eventId: 'message-1',
            actor: { id: 'human-1', role: 'human' },
            occurredAt: '2026-09-18T12:00:00Z',
            text: 'Evidence message',
          },
        ]}
        onCreate={onCreate}
        onUpdate={() => undefined}
        onDelete={() => undefined}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Create' }));
    await user.type(screen.getByLabelText('Decision title'), 'New decision');
    await user.type(screen.getByLabelText('Decision summary'), 'New summary');
    await user.click(screen.getByRole('button', { name: 'Create decision' }));

    expect(onCreate).toHaveBeenCalledWith({
      title: 'New decision',
      summary: 'New summary',
      sourceEventIds: [],
    });
    expect(onCancel).toHaveBeenCalled();
  });

  it('limits update to drafts and requires delete confirmation', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <DecisionCommandDialog
        isOpen
        decisions={[draft, active]}
        messages={[]}
        onCreate={() => undefined}
        onUpdate={() => undefined}
        onDelete={onDelete}
        onCancel={() => undefined}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: /Draft decision/ }));
    expect(screen.getByText(/This removes the decision/)).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Permanently delete' }));
    expect(onDelete).toHaveBeenCalledWith('decision-1');
  });
});
