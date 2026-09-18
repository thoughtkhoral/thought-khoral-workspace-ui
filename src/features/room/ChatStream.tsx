import Chatbot, {
  ChatbotDisplayMode,
} from '@patternfly/chatbot/dist/dynamic/Chatbot';
import ChatbotContent from '@patternfly/chatbot/dist/dynamic/ChatbotContent';
import ChatbotFooter from '@patternfly/chatbot/dist/dynamic/ChatbotFooter';
import Message from '@patternfly/chatbot/dist/dynamic/Message';
import MessageBox from '@patternfly/chatbot/dist/dynamic/MessageBox';
import { Alert, AlertActionCloseButton } from '@patternfly/react-core';
import { useState, type ReactNode } from 'react';

import type { ChatMention, ChatSendValues, RoomMessage, RoomParticipant } from '../../api';
import './ChatStream.css';
import { MentionComposer } from './MentionComposer';

export interface ChatStreamProps {
  messages: readonly RoomMessage[];
  participants: readonly RoomParticipant[];
  onSendMessage: (values: ChatSendValues) => void;
  onCommand?: (command: 'decisions') => void;
  canManageDecisions?: boolean;
  isConnected: boolean;
}

export function ChatStream({
  messages,
  participants,
  onSendMessage,
  onCommand,
  canManageDecisions = false,
  isConnected,
}: ChatStreamProps) {
  const [commandError, setCommandError] = useState<string | null>(null);

  const submitMessage = (values: ChatSendValues) => {
    const text = values.text;
    if (!text) return;

    if (text.startsWith('/')) {
      if (text === '/decisions') {
        if (canManageDecisions && onCommand) {
          onCommand('decisions');
        } else {
          setCommandError(
            'Decision commands are available to human participants only.',
          );
        }
        return;
      }
      setCommandError(`Unrecognized command: ${text}`);
      return;
    }

    onSendMessage(values);
  };

  const mentionLabel = (mention: ChatMention) => {
    if (mention.type === 'alias') {
      return mention.alias === 'allhumans' ? 'Mention all humans' : 'Mention all agents';
    }
    const participant = participants.find((candidate) => candidate.id === mention.id);
    return participant
      ? `Mention ${participant.displayName}, ${participant.role} participant`
      : `Mention participant ${mention.token}`;
  };

  const messageContent = (message: RoomMessage) => {
    const mentions = new Map<string, ChatMention>();
    for (const mention of message.mentions) {
      mentions.set(mention.type === 'participant' ? mention.token : mention.alias, mention);
    }
    const pattern = /@([a-z0-9]+(?:-[a-z0-9]+)*)/gi;
    const fragments: ReactNode[] = [];
    let end = 0;
    for (const match of message.text.matchAll(pattern)) {
      const token = match[1].toLowerCase();
      const mention = mentions.get(token);
      if (!mention) continue;
      const start = match.index ?? 0;
      fragments.push(message.text.slice(end, start));
      fragments.push(
        <span className="thought-khoral-transcript-mention" aria-label={mentionLabel(mention)} key={`${start}-${token}`}>
          {match[0]}
        </span>,
      );
      end = start + match[0].length;
    }
    fragments.push(message.text.slice(end));
    return <>{fragments}</>;
  };

  return (
    <Chatbot
      displayMode={ChatbotDisplayMode.embedded}
      ariaLabel="Room conversation"
      className="thought-khoral-room-chatbot"
    >
      <ChatbotContent>
        <MessageBox
          ariaLabel="Normalized room messages"
          announcement={messages.at(-1)?.text}
          enableSmartScroll
        >
          {messages.map((message) => (
            <Message
              key={message.eventId}
              id={message.eventId}
              role={message.actor.role === 'human' ? 'user' : 'bot'}
              alignment={message.actor.role === 'human' ? 'end' : 'start'}
              name={
                message.actor.displayName ??
                (message.actor.role === 'human'
                  ? 'Human participant'
                  : 'Agent participant')
              }
              >
                <>
                  {messageContent(message)}
                  {message.delivery === 'mentioned' && (
                    <span className="thought-khoral-targeted-delivery">Mentioned participants only</span>
                  )}
                </>
              </Message>
          ))}
        </MessageBox>
      </ChatbotContent>
      <ChatbotFooter>
        {commandError && (
          <Alert
            variant="warning"
            isInline
            title="Command not recognized"
            role="alert"
            actionClose={
              <AlertActionCloseButton
                aria-label="Dismiss command error"
                onClose={() => setCommandError(null)}
              />
            }
          >
            {commandError}
          </Alert>
        )}
        <MentionComposer participants={participants} isConnected={isConnected} onSend={submitMessage} />
      </ChatbotFooter>
    </Chatbot>
  );
}
