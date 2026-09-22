import { Button, FormGroup, TextArea } from '@patternfly/react-core';
import { useState } from 'react';

import {
  AGENT_TASK_SKILLS,
  createRpcRequest,
  REFERENCE_AGENT_ID,
  type AgentTaskSkill,
  type RpcRequest,
} from '../../api';

export interface AgentTaskComposerProps {
  roomId: string;
  isConnected: boolean;
  onStart: (request: RpcRequest) => void;
}

const inputLimit = 8_000;

export function AgentTaskComposer({
  roomId,
  isConnected,
  onStart,
}: AgentTaskComposerProps) {
  const [skillId, setSkillId] = useState<AgentTaskSkill>('summarize-context');
  const [input, setInput] = useState('');
  const trimmedInput = input.trim();

  const submit = () => {
    if (!isConnected || !trimmedInput) return;
    onStart(createRpcRequest('agent.task.start', roomId, {
      agentId: REFERENCE_AGENT_ID,
      skillId,
      input: trimmedInput,
    }));
    setInput('');
  };

  return (
    <section className="thought-khoral-agent-task-composer" aria-label="Start Reference Agent task">
      <p>Reference Agent: <code>{REFERENCE_AGENT_ID}</code></p>
      <FormGroup label="Agent task skill" fieldId="agent-task-skill">
        <select
          id="agent-task-skill"
          aria-label="Agent task skill"
          value={skillId}
          disabled={!isConnected}
          onChange={(event) => setSkillId(event.target.value as AgentTaskSkill)}
        >
          {AGENT_TASK_SKILLS.map((skill) => (
            <option key={skill} value={skill}>{skill}</option>
          ))}
        </select>
      </FormGroup>
      <FormGroup label="Agent task input" fieldId="agent-task-input">
        <TextArea
          id="agent-task-input"
          aria-label="Agent task input"
          value={input}
          maxLength={inputLimit}
          isDisabled={!isConnected}
          rows={3}
          resizeOrientation="vertical"
          onChange={(event) => setInput(String(event.target.value).slice(0, inputLimit))}
        />
        <small>{input.length} / {inputLimit} characters maximum</small>
      </FormGroup>
      <Button
        type="button"
        variant="secondary"
        isDisabled={!isConnected || !trimmedInput}
        onClick={submit}
      >
        Start agent task
      </Button>
    </section>
  );
}
