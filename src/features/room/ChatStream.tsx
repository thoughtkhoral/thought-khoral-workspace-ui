import Chatbot, {
  ChatbotDisplayMode,
} from '@patternfly/chatbot/dist/dynamic/Chatbot';
import ChatbotContent from '@patternfly/chatbot/dist/dynamic/ChatbotContent';
import ChatbotFooter from '@patternfly/chatbot/dist/dynamic/ChatbotFooter';
import Message from '@patternfly/chatbot/dist/dynamic/Message';
import MessageBar from '@patternfly/chatbot/dist/dynamic/MessageBar';
import MessageBox from '@patternfly/chatbot/dist/dynamic/MessageBox';

import type { RoomMessage } from '../../api';
import './ChatStream.css';

export interface ChatStreamProps {
  messages: readonly RoomMessage[];
  onSendMessage: (text: string) => void;
  onCommand?: (command: 'decisions') => void;
  canManageDecisions?: boolean;
  isConnected: boolean;
}

export function ChatStream({
  messages,
  onSendMessage,
  onCommand,
  canManageDecisions = false,
  isConnected,
}: ChatStreamProps) {
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
              content={message.text}
              timestamp={message.occurredAt}
              isMarkdownDisabled
            />
          ))}
        </MessageBox>
      </ChatbotContent>
      <ChatbotFooter>
        <MessageBar
          aria-label="Message"
          placeholder={
            isConnected ? 'Send a room message' : 'Waiting for the room'
          }
          isDisabled={!isConnected}
          onSendMessage={(value) => {
            const text = String(value).trim();
            if (text) {
              if (text === '/decisions' && canManageDecisions && onCommand) {
                onCommand('decisions');
              } else {
                onSendMessage(text);
              }
            }
          }}
        />
      </ChatbotFooter>
    </Chatbot>
  );
}
