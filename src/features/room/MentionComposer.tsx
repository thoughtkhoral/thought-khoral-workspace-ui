import MessageBar from '@patternfly/chatbot/dist/dynamic/MessageBar';
import { Alert, FormGroup } from '@patternfly/react-core';
import { useMemo, useState, type KeyboardEvent } from 'react';

import type { ChatMention, ChatSendValues, RoomParticipant } from '../../api';
import {
  activeMentionQuery,
  insertMention,
  mentionOptions,
  unresolvedMentionTokens,
  type MentionOption,
} from './mentions';

export interface MentionComposerProps {
  participants: readonly RoomParticipant[];
  isConnected: boolean;
  onSend: (values: ChatSendValues) => void;
}

function selectedMentions(value: string, options: readonly MentionOption[]): ChatMention[] {
  const usedTokens = new Set(
    [...value.matchAll(/@([a-z0-9]+(?:-[a-z0-9]+)*)/gi)].map((match) =>
      match[1].toLowerCase(),
    ),
  );
  const unique = new Set<string>();
  const mentions: ChatMention[] = [];
  for (const option of options) {
    if (!usedTokens.has(option.token) || unique.has(option.token)) continue;
    unique.add(option.token);
    mentions.push(option.type === 'participant'
      ? { type: 'participant', id: option.participant.id, token: option.token }
      : { type: 'alias', alias: option.alias });
  }
  return mentions;
}

export function MentionComposer({ participants, isConnected, onSend }: MentionComposerProps) {
  const options = useMemo(() => mentionOptions(participants), [participants]);
  const [text, setText] = useState('');
  const [cursor, setCursor] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [delivery, setDelivery] = useState<'room' | 'mentioned'>('room');
  const query = activeMentionQuery(text, cursor);
  const suggestions = isMenuOpen && query
    ? options.filter((option) => option.token.startsWith(query.query.toLowerCase()))
    : [];
  const unresolved = unresolvedMentionTokens(text, options);
  const mentions = selectedMentions(text, options);
  const cannotSend = !text.trim() || !isConnected || unresolved.length > 0 ||
    (delivery === 'mentioned' && mentions.length === 0);

  const choose = (option: MentionOption) => {
    const inserted = insertMention(text, cursor, option);
    setText(inserted.value);
    setCursor(inserted.cursor);
    setActiveIndex(0);
    setIsMenuOpen(false);
  };

  const submit = () => {
    if (cannotSend) return;
    onSend({ text: text.trim(), mentions, delivery });
    setText('');
    setCursor(0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % suggestions.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        choose(suggestions[activeIndex] ?? suggestions[0]!);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setCursor(0);
        setIsMenuOpen(false);
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="thought-khoral-mention-composer">
      <FormGroup label="Message delivery" fieldId="message-delivery">
        <select
          id="message-delivery"
          aria-label="Message delivery"
          value={delivery}
          onChange={(event) => setDelivery(event.target.value as 'room' | 'mentioned')}
        >
          <option value="room">Everyone in room</option>
          <option value="mentioned">Mentioned participants only</option>
        </select>
      </FormGroup>
      {unresolved.length > 0 && (
        <Alert variant="danger" isInline title="Unknown mention" role="alert">
          Unknown mention token: {unresolved.join(', ')}
        </Alert>
      )}
      <div className="thought-khoral-mention-input">
        <MessageBar
          aria-label="Message"
          placeholder={isConnected ? 'Send a room message' : 'Waiting for the room'}
          hasAttachButton={false}
          alwayShowSendButton
          value={text}
          isDisabled={!isConnected}
          isSendButtonDisabled={cannotSend}
          buttonProps={{ send: { props: { 'aria-label': 'Send message' } } }}
          onChange={(event) => {
            setText(String(event.target.value));
            setCursor(event.target.selectionStart ?? event.target.value.length);
            setActiveIndex(0);
            setIsMenuOpen(true);
          }}
          onKeyDown={onKeyDown}
          onClick={(event) => {
            setCursor(event.currentTarget.selectionStart ?? text.length);
            setIsMenuOpen(true);
          }}
          onSelect={(event) => {
            setCursor(event.currentTarget.selectionStart ?? text.length);
            setIsMenuOpen(true);
          }}
          onSendMessage={submit}
        />
        {suggestions.length > 0 && (
          <ul className="thought-khoral-mention-menu" role="listbox" aria-label="Mention suggestions">
            {suggestions.map((option, index) => (
              <li
                key={option.token}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                @{option.token}{option.type === 'participant' ? ` — ${option.participant.displayName}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
