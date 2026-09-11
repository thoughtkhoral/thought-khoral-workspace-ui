import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardTitle,
  Content,
  Label,
} from '@patternfly/react-core';
import { useState } from 'react';

import {
  DecisionEditForm,
  type DecisionEditTransition,
} from './DecisionEditForm';

export type ParticipantRole = 'human' | 'agent';
export type DecisionStatus = 'draft' | 'active' | 'dismissed' | 'superseded';

export interface Decision {
  id: string;
  title: string;
  summary: string;
  sourceEventIds: string[];
  status: DecisionStatus;
  derivedFromDecisionId?: string;
}

export interface DecisionTransition {
  action: 'confirm' | 'dismiss';
  decisionId: string;
}

export interface DecisionCardProps {
  decision: Decision;
  participantRole: ParticipantRole;
  onTransition: (transition: DecisionTransition | DecisionEditTransition) => void;
}

export function DecisionCard({
  decision,
  participantRole,
  onTransition,
}: DecisionCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const canTransition = participantRole === 'human' && decision.status === 'draft';

  return (
    <Card isCompact>
      <CardTitle>
        {decision.title} <Label>{decision.status}</Label>
      </CardTitle>
      <CardBody>
        <Content component="p">{decision.summary}</Content>
        <Content component="small">
          Source events: {decision.sourceEventIds.join(', ')}
        </Content>
        {canTransition && isEditing && (
          <DecisionEditForm
            decision={decision}
            onCancel={() => setIsEditing(false)}
            onSubmit={(transition) => {
              onTransition(transition);
              setIsEditing(false);
            }}
          />
        )}
      </CardBody>
      {canTransition && !isEditing && (
        <CardFooter>
          <Button
            variant="primary"
            onClick={() =>
              onTransition({ action: 'confirm', decisionId: decision.id })
            }
          >
            Confirm
          </Button>{' '}
          <Button variant="secondary" onClick={() => setIsEditing(true)}>
            Edit
          </Button>{' '}
          <Button
            variant="link"
            isDanger
            onClick={() =>
              onTransition({ action: 'dismiss', decisionId: decision.id })
            }
          >
            Dismiss
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
