import { useState, type FormEvent } from 'react';
import {
  Button,
  Checkbox,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  TextArea,
  TextInput,
} from '@patternfly/react-core';

import type { RoomMessage } from '../../api';

export interface DecisionCreateValues {
  title: string;
  summary: string;
  sourceEventIds: string[];
}

export interface DecisionCreateFormProps {
  messages: readonly RoomMessage[];
  onSubmit: (values: DecisionCreateValues) => void;
  onCancel: () => void;
}

export function DecisionCreateForm({
  messages,
  onSubmit,
  onCancel,
}: DecisionCreateFormProps) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [sourceEventIds, setSourceEventIds] = useState<string[]>([]);
  const [didValidate, setDidValidate] = useState(false);
  const hasTitle = title.trim().length > 0;
  const hasSummary = summary.trim().length > 0;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDidValidate(true);
    if (!hasTitle || !hasSummary) return;
    onSubmit({
      title: title.trim(),
      summary: summary.trim(),
      sourceEventIds,
    });
  };

  const toggleSource = (eventId: string, checked: boolean) => {
    setSourceEventIds((current) =>
      checked
        ? [...current, eventId]
        : current.filter((candidate) => candidate !== eventId),
    );
  };

  return (
    <Form onSubmit={submit} noValidate>
      <FormGroup label="Title" isRequired fieldId="decision-create-title">
        <TextInput
          id="decision-create-title"
          aria-label="Decision title"
          isRequired
          value={title}
          validated={didValidate && !hasTitle ? 'error' : 'default'}
          onChange={(_event, value) => setTitle(value)}
        />
        {didValidate && !hasTitle && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">Enter a title.</HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>
      <FormGroup label="Summary" isRequired fieldId="decision-create-summary">
        <TextArea
          id="decision-create-summary"
          aria-label="Decision summary"
          isRequired
          value={summary}
          validated={didValidate && !hasSummary ? 'error' : 'default'}
          onChange={(_event, value) => setSummary(value)}
        />
        {didValidate && !hasSummary && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">Enter a summary.</HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>
      <FormGroup label="Source evidence" fieldId="decision-create-sources">
        {messages.length === 0 ? (
          <HelperText>
            <HelperTextItem>No chat messages selected.</HelperTextItem>
          </HelperText>
        ) : (
          messages.map((message) => (
            <Checkbox
              key={message.eventId}
              id={`decision-source-${message.eventId}`}
              label={message.text}
              isChecked={sourceEventIds.includes(message.eventId)}
              onChange={(_event, checked) =>
                toggleSource(message.eventId, checked)
              }
            />
          ))
        )}
      </FormGroup>
      <Button type="submit" variant="primary">
        Create decision
      </Button>{' '}
      <Button type="button" variant="link" onClick={onCancel}>
        Cancel
      </Button>
    </Form>
  );
}
