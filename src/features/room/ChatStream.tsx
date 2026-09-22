import Chatbot, {
  ChatbotDisplayMode,
} from '@patternfly/chatbot/dist/dynamic/Chatbot';
import ChatbotContent from '@patternfly/chatbot/dist/dynamic/ChatbotContent';
import ChatbotFooter from '@patternfly/chatbot/dist/dynamic/ChatbotFooter';
import Message from '@patternfly/chatbot/dist/dynamic/Message';
import MessageBox from '@patternfly/chatbot/dist/dynamic/MessageBox';
import { Alert, AlertActionCloseButton } from '@patternfly/react-core';
import { useState, type ReactNode } from 'react';

import type { ChatMention, ChatSendValues, RoomAgentTask, RoomMessage, RoomParticipant } from '../../api';
import './ChatStream.css';
import { MentionComposer } from './MentionComposer';
import { mentionTokens } from './mentions';

export interface ChatStreamProps {
  messages: readonly RoomMessage[];
  tasks?: readonly RoomAgentTask[];
  participants: readonly RoomParticipant[];
  onSendMessage: (values: ChatSendValues) => void;
  onCommand?: (command: 'decisions') => void;
  canManageDecisions?: boolean;
  isConnected: boolean;
}

export function ChatStream({
  messages,
  tasks = [],
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
    const fragments: ReactNode[] = [];
    let end = 0;
    for (const token of mentionTokens(message.text)) {
      const mention = mentions.get(token.token);
      if (!mention) continue;
      fragments.push(message.text.slice(end, token.start));
      fragments.push(
        <span className="thought-khoral-transcript-mention" aria-label={mentionLabel(mention)} key={`${token.start}-${token.token}`}>
          {message.text.slice(token.start, token.end)}
        </span>,
      );
      end = token.end;
    }
    fragments.push(message.text.slice(end));
    return <>{fragments}</>;
  };

  const focusCitation = (eventId: string) => {
    const citedEvent = document.getElementById(eventId) ??
      document.getElementById(`decision-${eventId}`) ??
      document.getElementById(`decision-source-${eventId}`);
    if (!citedEvent) return;
    citedEvent.scrollIntoView({ block: 'center' });
    citedEvent.focus({ preventScroll: true });
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
              timestamp={message.occurredAt}
              >
                <>
                  {messageContent(message)}
                  {message.delivery === 'mentioned' && (
                    <span className="thought-khoral-targeted-delivery">Mentioned participants only</span>
                  )}
                </>
              </Message>
          ))}
          {tasks.map((task) => (
            <section key={task.id} role="status" aria-label={`Reference Agent task ${task.status}`} className="thought-khoral-agent-task">
              <strong>{task.skillId ? `Reference Agent: ${task.skillId}` : 'Action Items'}: {task.status}</strong>
              {task.phase && <div>Phase: {task.phase}</div>}
              {task.progressText && <div>{task.progressText}{task.percent !== undefined ? ` (${task.percent}%)` : ''}</div>}
              {task.summary && <p>{task.summary}</p>}
              {task.actionItems.map((item) => <div key={item.text}>{item.text}{item.owner ? ` — ${item.owner}` : ''}{item.due ? ` (${item.due})` : ''}</div>)}
              {task.citations && task.citations.length > 0 && (
                <div className="thought-khoral-agent-task-citations">
                  {task.citations.map((citation, index) => (
                    <button type="button" key={citation} onClick={() => focusCitation(citation)}>
                      Citation {index + 1}
                    </button>
                  ))}
                </div>
              )}
              {task.handoff && (
                <div>
                  <p>{task.handoff.instruction}</p>
                  <a href={task.handoff.url} target="_blank" rel="noopener noreferrer">
                    Continue at {task.handoff.host}
                  </a>
                </div>
              )}
              {task.failureCode && <div>Task failed: {task.failureCode}</div>}
            </section>
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
