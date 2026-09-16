import { lazy, useMemo, useState } from 'react';
import {
  Button,
  Content,
  Flex,
  FlexItem,
  Label,
  Masthead,
  MastheadBrand,
  MastheadMain,
  Page,
  PageSection,
  Stack,
  StackItem,
  Title,
} from '@patternfly/react-core';

import { GatewayErrorAlert, projectRoomEvents } from '../../api';
import { DecisionCard } from '../decisions/DecisionCard';
import { MemoryDrawer } from '../decisions/MemoryDrawer';
import { ParticipantDrawer } from '../participants/ParticipantDrawer';
import {
  useRoomSocket,
  type AuthenticatedSocketFactory,
} from './useRoomSocket';
import type { ParticipantRole } from '../decisions/DecisionCard';

const ChatStream = lazy(() =>
  import('./ChatStream').then((module) => ({ default: module.ChatStream })),
);

export interface RoomPageProps {
  roomId: string;
  participantRole: ParticipantRole;
  getAccessToken: () => Promise<string>;
  createSocket: AuthenticatedSocketFactory;
  socketUrl?: string;
}

export function RoomPage({
  roomId,
  participantRole,
  getAccessToken,
  createSocket,
  socketUrl,
}: RoomPageProps) {
  const [isMemoryExpanded, setIsMemoryExpanded] = useState(false);
  const [isParticipantsExpanded, setIsParticipantsExpanded] = useState(true);
  const { events, participants, error, status, send } = useRoomSocket({
    roomId,
    getAccessToken,
    createSocket,
    url: socketUrl,
  });
  const room = useMemo(() => projectRoomEvents(events), [events]);
  const roomParticipants =
    participants.length > 0 ? participants : room.participants;
  const isConnected = status === 'connected';

  const masthead = (
    <Masthead>
      <MastheadMain>
        <MastheadBrand>
          <Title headingLevel="h1">ThoughtKhoral collaborative room</Title>
        </MastheadBrand>
      </MastheadMain>
    </Masthead>
  );

  return (
    <Page masthead={masthead} mainAriaLabel="ThoughtKhoral room workspace">
      <ParticipantDrawer
        participants={roomParticipants}
        isExpanded={isParticipantsExpanded}
        onClose={() => setIsParticipantsExpanded(false)}
      >
        <MemoryDrawer
          decisions={room.decisions}
          isExpanded={isMemoryExpanded}
          onClose={() => setIsMemoryExpanded(false)}
        >
          <PageSection variant="secondary">
            <Flex alignItems={{ default: 'alignItemsCenter' }}>
              <FlexItem grow={{ default: 'grow' }}>
                <Content component="p">Room {roomId}</Content>
              </FlexItem>
              <FlexItem>
                <Label color={isConnected ? 'green' : 'grey'}>{status}</Label>
              </FlexItem>
              <FlexItem>
                <Button
                  variant="secondary"
                  aria-expanded={isParticipantsExpanded}
                  aria-controls="conversation-participants-panel"
                  aria-label={
                    isParticipantsExpanded
                      ? 'Close participants'
                      : 'Open participants'
                  }
                  onClick={() =>
                    setIsParticipantsExpanded((expanded) => !expanded)
                  }
                >
                  Participants ({roomParticipants.length})
                </Button>
              </FlexItem>
              <FlexItem>
                <Button
                  variant="secondary"
                  aria-expanded={isMemoryExpanded}
                  aria-controls="collective-memory-panel"
                  aria-label={
                    isMemoryExpanded
                      ? 'Close collective memory'
                      : 'Open collective memory'
                  }
                  onClick={() => setIsMemoryExpanded((expanded) => !expanded)}
                >
                  Collective memory
                </Button>
              </FlexItem>
            </Flex>
          </PageSection>
          {error && (
            <PageSection>
              <GatewayErrorAlert error={error} />
            </PageSection>
          )}
          <PageSection isFilled>
            <Stack hasGutter>
              <StackItem isFilled>
                <ChatStream
                  messages={room.messages}
                  isConnected={isConnected}
                  onSendMessage={(text) => send('chat.send', { text })}
                />
              </StackItem>
              <StackItem>
                <Title headingLevel="h2">Decisions</Title>
              </StackItem>
              {room.decisions.length === 0 ? (
                <StackItem>
                  <Content component="p">No decisions have been proposed.</Content>
                </StackItem>
              ) : (
                room.decisions.map((decision) => (
                  <StackItem key={decision.id}>
                    <DecisionCard
                      decision={decision}
                      participantRole={participantRole}
                      onTransition={(transition) => {
                        const params =
                          transition.action === 'edit'
                            ? {
                                decisionId: transition.decisionId,
                                action: transition.action,
                                editedTitle: transition.editedTitle,
                                editedSummary: transition.editedSummary,
                              }
                            : {
                                decisionId: transition.decisionId,
                                action: transition.action,
                              };
                        send('decision.transition', params);
                      }}
                    />
                  </StackItem>
                ))
              )}
            </Stack>
          </PageSection>
        </MemoryDrawer>
      </ParticipantDrawer>
    </Page>
  );
}
