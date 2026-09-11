import { useState, type FormEvent } from 'react';
import {
  Button,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  TextArea,
  TextInput,
} from '@patternfly/react-core';

import type { Decision } from './DecisionCard';

export interface DecisionEditTransition {
  action: 'edit';
  decisionId: string;
  editedTitle: string;
  editedSummary: string;
}

export interface DecisionEditFormProps {
  decision: Decision;
  onSubmit: (transition: DecisionEditTransition) => void;
  onCancel: () => void;
}

export function DecisionEditForm({
  decision,
  onSubmit,
  onCancel,
}: DecisionEditFormProps) {
  const [title, setTitle] = useState(decision.title);
  const [summary, setSummary] = useState(decision.summary);
  const [didValidate, setDidValidate] = useState(false);
  const hasTitle = title.trim().length > 0;
  const hasSummary = summary.trim().length > 0;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDidValidate(true);
    if (!hasTitle || !hasSummary) {
      return;
    }
    onSubmit({
      action: 'edit',
      decisionId: decision.id,
      editedTitle: title.trim(),
      editedSummary: summary.trim(),
    });
  };

  return (
    <Form onSubmit={submit} noValidate>
      <FormGroup
        label="Title"
        isRequired
        fieldId={`decision-${decision.id}-title`}
      >
        <TextInput
          id={`decision-${decision.id}-title`}
          aria-label="Title"
          isRequired
          value={title}
          validated={didValidate && !hasTitle ? 'error' : 'default'}
          onChange={(_event, value) => setTitle(value)}
        />
        {didValidate && !hasTitle && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">
                Enter a decision title.
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>
      <FormGroup
        label="Summary"
        isRequired
        fieldId={`decision-${decision.id}-summary`}
      >
        <TextArea
          id={`decision-${decision.id}-summary`}
          aria-label="Summary"
          isRequired
          value={summary}
          validated={didValidate && !hasSummary ? 'error' : 'default'}
          onChange={(_event, value) => setSummary(value)}
        />
        {didValidate && !hasSummary && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">
                Enter a decision summary.
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>
      <Button type="submit" variant="primary">
        Save decision
      </Button>{' '}
      <Button type="button" variant="link" onClick={onCancel}>
        Cancel
      </Button>
    </Form>
  );
}
