import {
  Content,
  Drawer,
  DrawerActions,
  DrawerCloseButton,
  DrawerContent,
  DrawerContentBody,
  DrawerHead,
  DrawerPanelBody,
  DrawerPanelContent,
  Label,
  Stack,
  StackItem,
  Title,
} from '@patternfly/react-core';
import { useEffect, type ReactNode } from 'react';

import type { RoomParticipant } from '../../api';

export interface ParticipantDrawerProps {
  participants: readonly RoomParticipant[];
  isExpanded: boolean;
  onClose: () => void;
  children: ReactNode;
}

function ParticipantRow({ participant }: { participant: RoomParticipant }) {
  return (
    <StackItem>
      <Content component="p">
        <strong>{participant.displayName}</strong>
      </Content>
      <Content component="small">
        {participant.role === 'human' ? 'Human' : 'Agent'}{' '}
        <span
          aria-hidden="true"
          style={{
            backgroundColor: participant.online ? '#3e8635' : '#6a6e73',
            borderRadius: '50%',
            display: 'inline-block',
            height: '0.5rem',
            marginInline: '0.25rem',
            width: '0.5rem',
          }}
        />
        <Label isCompact color={participant.online ? 'green' : 'grey'}>
          {participant.online ? 'Online' : 'Offline'}
        </Label>
      </Content>
    </StackItem>
  );
}

export function ParticipantDrawer({
  participants,
  isExpanded,
  onClose,
  children,
}: ParticipantDrawerProps) {
  useEffect(() => {
    if (!isExpanded) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded, onClose]);

  const panelContent = (
    <DrawerPanelContent
      id="conversation-participants-panel"
      minSize="18rem"
      defaultSize="22rem"
      aria-label="Participants"
    >
      <DrawerHead>
        <Title headingLevel="h2" id="conversation-participants-title">
          Participants ({participants.length})
        </Title>
        <DrawerActions>
          <DrawerCloseButton
            aria-label="Close participant drawer"
            onClick={onClose}
          />
        </DrawerActions>
      </DrawerHead>
      <DrawerPanelBody>
        {participants.length === 0 ? (
          <Content component="p">No participants yet.</Content>
        ) : (
          <Stack hasGutter>
            {participants.map((participant) => (
              <ParticipantRow key={participant.id} participant={participant} />
            ))}
          </Stack>
        )}
      </DrawerPanelBody>
    </DrawerPanelContent>
  );

  return (
    <Drawer isExpanded={isExpanded} position="start">
      <DrawerContent panelContent={isExpanded ? panelContent : null}>
        <DrawerContentBody>{children}</DrawerContentBody>
      </DrawerContent>
    </Drawer>
  );
}
