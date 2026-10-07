import {
  Alert,
  Button,
  Checkbox,
  Content,
  FormGroup,
  Stack,
  StackItem,
  Title,
} from '@patternfly/react-core';

import type { AgentConversation } from './useAgentConversation';

export interface ConversationCapabilities {
  modelSelection: boolean;
  reasoningEffort: boolean;
  usage: boolean;
}

interface ControlsProps {
  conversation: AgentConversation;
  capabilities?: ConversationCapabilities;
}

export function CodexConversationControls({
  conversation,
  capabilities = { modelSelection: true, reasoningEffort: true, usage: true },
}: ControlsProps) {
  const state = conversation.view?.conversation;
  const chosen = conversation.draftSettings ?? (conversation.newSession ? undefined : conversation.submittedSettings ?? state?.selectedSettings);
  const model = conversation.catalog?.data.find(option => option.id === chosen?.model);
  const effective = conversation.pendingConfirmation
    ? null
    : conversation.task ? conversation.task.effectiveSettings : state?.effectiveSettings;
  const usage = conversation.pendingConfirmation
    ? null
    : conversation.task ? conversation.task.usage : state?.usage;
  const unavailable = !conversation.isAvailable;
  const disableControls = conversation.busy || unavailable;
  const contextEstimate = usage && usage.freshness !== 'unavailable' && usage.modelContextWindow
    ? `Last-request context estimate: ${usage.lastTotalTokens.toLocaleString()} / ${usage.modelContextWindow.toLocaleString()} tokens (${Math.round(100 * usage.lastTotalTokens / usage.modelContextWindow)}%; ${usage.freshness}; ${usage.model ?? 'model unavailable'}; reported ${usage.reportedAt})`
    : 'Last-request context estimate unavailable.';

  return (
    <Stack hasGutter aria-label="Codex conversation controls">
      <StackItem>
        <Title headingLevel="h3">Codex shared room conversation</Title>
      </StackItem>
      <StackItem>
        <Content component="p">
          Session: {conversation.busy ? 'busy' : state?.state ?? 'not started'}
          {state ? ` · generation ${state.generation}` : ''}
        </Content>
      </StackItem>
      {conversation.error && (
        <StackItem>
          <Alert isInline variant="warning" title="Codex conversation" role="alert">
            {conversation.error.message}
          </Alert>
        </StackItem>
      )}
      <StackItem>
        <Button variant="secondary" onClick={conversation.chooseNewSession} isDisabled={disableControls}>
          New session
        </Button>
        {state?.state === 'ready' && (
          <Button variant="link" onClick={conversation.continueSession} isDisabled={disableControls}>
            Continue session
          </Button>
        )}
      </StackItem>
      {conversation.newSession && (
        <StackItem>
          <Content component="p">
            New session resets the shared thread for everyone. Room history is
            retained and supplied to the fresh thread with your next message.
          </Content>
          <Checkbox
            id="codex-reset-ack"
            label="I understand this resets the shared thread"
            isChecked={conversation.resetAcknowledged}
            onChange={(_event, checked) => conversation.acknowledgeReset(checked)}
            isDisabled={conversation.busy}
          />
        </StackItem>
      )}
      {conversation.needsSettingsSelection && !conversation.busy && (
        <StackItem><Content component="p">Choose a model and reasoning effort before starting a new session.</Content></StackItem>
      )}
      {capabilities.modelSelection && conversation.catalog && conversation.catalog.data.length > 0 && (
        <StackItem>
          <FormGroup label="Model" fieldId="codex-model">
            <select
              id="codex-model"
              aria-label="Model"
              value={chosen?.model ?? ''}
              disabled={disableControls}
              onChange={event => conversation.selectModel(event.target.value)}
            >
              <option value="" disabled>Choose a model</option>
              {conversation.catalog.data.map(option => (
                <option key={option.id} value={option.id}>{option.displayName}</option>
              ))}
            </select>
          </FormGroup>
        </StackItem>
      )}
      {capabilities.reasoningEffort && model && model.supportedReasoningEfforts.length > 0 && (
        <StackItem>
          <FormGroup label="Reasoning effort" fieldId="codex-effort">
            <select
              id="codex-effort"
              aria-label="Reasoning effort"
              value={chosen?.reasoningEffort ?? ''}
              disabled={disableControls}
              onChange={event => conversation.selectEffort(event.target.value)}
            >
              {model.supportedReasoningEfforts.map(effort => (
                <option key={effort.id} value={effort.id}>{effort.description}</option>
              ))}
            </select>
          </FormGroup>
        </StackItem>
      )}
      {conversation.needsEffortAcknowledgement && (
        <StackItem>
          <Checkbox
            id="codex-effort-ack"
            label="I acknowledge the new model's supported effort default"
            isChecked={false}
            onChange={(_event, checked) => { if (checked) conversation.acknowledgeEffort(); }}
            isDisabled={conversation.busy}
          />
        </StackItem>
      )}
      {(capabilities.modelSelection || capabilities.reasoningEffort) && (
        <StackItem>
          <Content component="p">
            Selected for next turn: {chosen
              ? `${chosen.model} / ${chosen.reasoningEffort}${conversation.draftSettings ? ' (unsent)' : ''}`
              : 'choose a model and reasoning effort'}
          </Content>
          <Content component="p">
            Active settings: {effective?.confirmation === 'confirmed'
              ? `${effective.reroutedModel ?? effective.model} / ${effective.reasoningEffort} (confirmed)`
              : 'unconfirmed or unavailable'}
          </Content>
        </StackItem>
      )}
      {capabilities.usage && <StackItem><Content component="p">{contextEstimate}</Content></StackItem>}
      {conversation.task && (
        <StackItem>
          <Content component="p" role="status">Codex turn: {conversation.task.state}</Content>
        </StackItem>
      )}
    </Stack>
  );
}
