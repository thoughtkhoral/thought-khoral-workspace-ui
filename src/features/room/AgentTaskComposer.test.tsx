import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach as vitestAfterEach, describe, expect, it, vi } from 'vitest';

import { REFERENCE_AGENT_ID } from '../../api';
import { AgentTaskComposer } from './AgentTaskComposer';

describe('AgentTaskComposer', () => {
  vitestAfterEach(cleanup);

  it('lets a human submit only the registered agent and approved skill with trimmed input', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<AgentTaskComposer roomId="10000000-0000-4000-8000-000000000001" isConnected onStart={onStart} />);

    expect(screen.getByText(REFERENCE_AGENT_ID)).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('Agent task skill'), 'extract-action-items');
    await user.type(screen.getByLabelText('Agent task input'), '  Identify the owners.  ');
    await user.click(screen.getByRole('button', { name: 'Start agent task' }));

    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({
      method: 'agent.task.start',
      params: expect.objectContaining({
        roomId: '10000000-0000-4000-8000-000000000001',
        agentId: REFERENCE_AGENT_ID,
        skillId: 'extract-action-items',
        input: 'Identify the owners.',
      }),
    }));
  });

  it('does not permit input longer than 8000 characters', () => {
    render(<AgentTaskComposer roomId="10000000-0000-4000-8000-000000000001" isConnected onStart={() => undefined} />);

    const input = screen.getByLabelText('Agent task input');
    fireEvent.change(input, { target: { value: 'x'.repeat(8_001) } });

    expect((input as HTMLTextAreaElement).value).toBe('x'.repeat(8_000));
    expect(screen.getByText(/8000 characters maximum/i)).toBeTruthy();
  });
});
