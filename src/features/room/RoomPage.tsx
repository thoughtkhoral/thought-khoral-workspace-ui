import { lazy, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Button,
  Content,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Label,
  Masthead,
  MastheadBrand,
  MastheadMain,
  Page,
  PageSection,
  Stack,
  StackItem,
  TextInput,
  Title,
} from '@patternfly/react-core';

import { GatewayErrorAlert, projectRoomEvents, type RoomEvent } from '../../api';
import { DecisionCard } from '../decisions/DecisionCard';
import { DecisionCommandDialog } from '../decisions/DecisionCommandDialog';
import type { DecisionCreateValues } from '../decisions/DecisionCreateForm';
import type { DecisionEditTransition } from '../decisions/DecisionEditForm';
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
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RoomPageProps {
  roomId?: string;
  participantRole: ParticipantRole;
  getAccessToken: () => Promise<string>;
  createSocket: AuthenticatedSocketFactory;
  socketUrl?: string;
  onEnterRoom?: (roomId: string) => void;
  onLeaveRoom?: () => void;
}

export function RoomPage({
  roomId,
  participantRole,
  getAccessToken,
  createSocket,
  socketUrl,
  onEnterRoom,
  onLeaveRoom,
}: RoomPageProps) {
  const [isMemoryExpanded, setIsMemoryExpanded] = useState(false);
  const [isParticipantsExpanded, setIsParticipantsExpanded] = useState(true);
  const [roomInput, setRoomInput] = useState(roomId ?? '');
  const [activeRoomId, setActiveRoomId] = useState<string>();
  const [didValidateRoom, setDidValidateRoom] = useState(false);
  const [isDecisionDialogOpen, setIsDecisionDialogOpen] = useState(false);
  const pendingMutations = useRef(
    new Map<
      string,
      {
        kind: 'create' | 'update' | 'delete';
        title?: string;
        edited?: boolean;
        confirmed?: boolean;
      }
    >(),
  );
  const { events, participants, error, status, send } = useRoomSocket({
    roomId: activeRoomId,
    getAccessToken,
    createSocket,
    url: socketUrl,
  });
  const room = useMemo(() => projectRoomEvents(events), [events]);
  const roomParticipants =
    participants.length > 0 ? participants : room.participants;
  const isConnected = status === 'connected';
  const canManageDecisions = participantRole === 'human';

  const rememberMutation = (
    requestId: string | false,
    mutation: {
      kind: 'create' | 'update' | 'delete';
      title?: string;
    },
  ) => {
    if (requestId !== false) {
      pendingMutations.current.set(requestId, mutation);
    }
  };

  const sendDecisionUpdate = (transition: DecisionEditTransition) => {
    const requestId = send('decision.transition', {
      decisionId: transition.decisionId,
      action: transition.action,
      editedTitle: transition.editedTitle,
      editedSummary: transition.editedSummary,
    });
    rememberMutation(requestId, { kind: 'update', title: transition.editedTitle });
  };

  useEffect(() => {
    for (const event of events as RoomEvent[]) {
      const pending = pendingMutations.current.get(event.requestId);
      if (!pending) continue;
      let complete = false;
      if (pending.kind === 'create' && event.eventType === 'decision.proposed') {
        complete = true;
      } else if (pending.kind === 'delete' && event.eventType === 'decision.deleted') {
        complete = true;
      } else if (pending.kind === 'update') {
        pending.edited ||= event.eventType === 'decision.edited';
        pending.confirmed ||= event.eventType === 'decision.confirmed';
        complete = Boolean(pending.edited && pending.confirmed);
      }
      if (!complete) continue;
      pendingMutations.current.delete(event.requestId);
      const label = pending.kind === 'create'
        ? 'Created decision'
        : pending.kind === 'update'
          ? 'Updated decision'
          : 'Deleted decision';
      send('chat.send', { text: `${label}: ${pending.title ?? 'decision'}.` });
    }
  }, [events, send]);

  const enterRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDidValidateRoom(true);
    const nextRoomId = roomInput.trim();
    if (!nextRoomId || !uuidPattern.test(nextRoomId)) {
      return;
    }
    onEnterRoom?.(nextRoomId);
    setActiveRoomId(nextRoomId);
  };

  const leaveRoom = () => {
    setActiveRoomId(undefined);
    setRoomInput('');
    setDidValidateRoom(false);
    setIsMemoryExpanded(false);
    setIsParticipantsExpanded(true);
    onLeaveRoom?.();
  };
  const roomValidationError = didValidateRoom
    ? !roomInput.trim()
      ? 'Enter a room ID.'
      : !uuidPattern.test(roomInput.trim())
        ? 'Enter a valid room ID (UUID).'
        : undefined
    : undefined;

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
      {activeRoomId ? (
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
                  <Content component="p">Room {activeRoomId}</Content>
                </FlexItem>
                <FlexItem>
                  <Label color={isConnected ? 'green' : 'grey'}>{status}</Label>
                </FlexItem>
                <FlexItem>
                  <Button type="button" variant="secondary" onClick={leaveRoom}>
                    Leave room
                  </Button>
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
                    canManageDecisions={canManageDecisions}
                    onCommand={() => setIsDecisionDialogOpen(true)}
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
                          if (transition.action === 'edit') {
                            sendDecisionUpdate(transition);
                            return;
                          }
                          send('decision.transition', {
                            decisionId: transition.decisionId,
                            action: transition.action,
                          });
                        }}
                      />
                    </StackItem>
                  ))
                )}
              </Stack>
            </PageSection>
            <DecisionCommandDialog
              isOpen={isDecisionDialogOpen}
              decisions={room.decisions}
              messages={room.messages}
              onCreate={(values: DecisionCreateValues) => {
                const requestId = send('decision.propose', { ...values });
                rememberMutation(requestId, { kind: 'create', title: values.title });
              }}
              onUpdate={sendDecisionUpdate}
              onDelete={(decisionId) => {
                const decision = room.decisions.find((candidate) => candidate.id === decisionId);
                const requestId = send('decision.delete', { decisionId });
                rememberMutation(requestId, { kind: 'delete', title: decision?.title });
              }}
              onCancel={() => setIsDecisionDialogOpen(false)}
            />
          </MemoryDrawer>
        </ParticipantDrawer>
      ) : (
        <PageSection isFilled>
          <Title headingLevel="h2">Enter a room</Title>
          <Content component="p">You are not in a room.</Content>
          <Form onSubmit={enterRoom} noValidate>
            <FormGroup label="Room ID" isRequired fieldId="room-id">
              <TextInput
                id="room-id"
                aria-label="Room ID"
                isRequired
                value={roomInput}
                validated={roomValidationError ? 'error' : 'default'}
                onChange={(_event, value) => setRoomInput(value)}
              />
              {roomValidationError && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem variant="error">
                      {roomValidationError}
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              )}
            </FormGroup>
            <Button type="submit" variant="primary">
              Enter room
            </Button>
          </Form>
        </PageSection>
      )}
    </Page>
  );
}
