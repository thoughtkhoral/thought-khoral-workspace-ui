import {
  Button,
  Content,
  Modal,
  ModalVariant,
  Title,
} from '@patternfly/react-core';
import { useEffect, useState } from 'react';

import type { RoomMessage } from '../../api';
import type { Decision } from './DecisionCard';
import {
  DecisionEditForm,
  type DecisionEditTransition,
} from './DecisionEditForm';
import {
  DecisionCreateForm,
  type DecisionCreateValues,
} from './DecisionCreateForm';

type DialogAction = 'create' | 'update' | 'delete';

export interface DecisionCommandDialogProps {
  isOpen: boolean;
  decisions: readonly Decision[];
  messages: readonly RoomMessage[];
  onCreate: (values: DecisionCreateValues) => void;
  onUpdate: (transition: DecisionEditTransition) => void;
  onDelete: (decisionId: string) => void;
  onCancel: () => void;
}

export function DecisionCommandDialog({
  isOpen,
  decisions,
  messages,
  onCreate,
  onUpdate,
  onDelete,
  onCancel,
}: DecisionCommandDialogProps) {
  const [action, setAction] = useState<DialogAction | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setAction(null);
      setSelectedId(null);
    }
  }, [isOpen]);

  const drafts = decisions.filter((decision) => decision.status === 'draft');
  const selected = decisions.find((decision) => decision.id === selectedId);

  const closeAfter = (callback: () => void) => {
    callback();
    onCancel();
  };

  return (
    <Modal
      isOpen={isOpen}
      variant={ModalVariant.medium}
      title="Decision actions"
      onClose={onCancel}
      aria-label="Decision actions"
    >
      {!action && (
        <>
          <Content component="p">Choose an action for the room decisions.</Content>
          <Button onClick={() => setAction('create')}>Create</Button>{' '}
          <Button
            variant="secondary"
            isDisabled={drafts.length === 0}
            onClick={() => setAction('update')}
          >
            Update draft
          </Button>{' '}
          <Button
            variant="danger"
            isDisabled={decisions.length === 0}
            onClick={() => setAction('delete')}
          >
            Delete
          </Button>{' '}
          <Button variant="link" onClick={onCancel}>
            Cancel
          </Button>
        </>
      )}
      {action === 'create' && (
        <DecisionCreateForm
          messages={messages}
          onSubmit={(values) => closeAfter(() => onCreate(values))}
          onCancel={onCancel}
        />
      )}
      {action === 'update' && !selected && (
        <>
          <Title headingLevel="h3">Choose a draft decision</Title>
          {drafts.map((decision) => (
            <div key={decision.id}>
              <Button variant="link" onClick={() => setSelectedId(decision.id)}>
                {decision.title}
              </Button>
            </div>
          ))}
          <Button variant="link" onClick={onCancel}>Cancel</Button>
        </>
      )}
      {action === 'update' && selected && (
        <DecisionEditForm
          decision={selected}
          onSubmit={(transition) => closeAfter(() => onUpdate(transition))}
          onCancel={onCancel}
        />
      )}
      {action === 'delete' && !selected && (
        <>
          <Title headingLevel="h3">Choose a decision to delete</Title>
          {decisions.map((decision) => (
            <div key={decision.id}>
              <Button variant="link" onClick={() => setSelectedId(decision.id)}>
                {decision.title} ({decision.status})
              </Button>
            </div>
          ))}
          <Button variant="link" onClick={onCancel}>Cancel</Button>
        </>
      )}
      {action === 'delete' && selected && (
        <>
          <Content component="p">
            Permanently delete “{selected.title}”? This removes the decision from
            the current decision list while retaining an audit event.
          </Content>
          <Button variant="danger" onClick={() => closeAfter(() => onDelete(selected.id))}>
            Permanently delete
          </Button>{' '}
          <Button variant="link" onClick={onCancel}>Cancel</Button>
        </>
      )}
    </Modal>
  );
}
