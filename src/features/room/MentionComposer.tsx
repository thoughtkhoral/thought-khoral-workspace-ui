import { Alert, Button, FormGroup, TextArea } from '@patternfly/react-core';
import { useMemo, useState, type KeyboardEvent } from 'react';

import type { ChatMention, ChatSendValues, RoomParticipant } from '../../api';
import {
  activeMentionQuery,
  insertMention,
  mentionTokens,
  mentionOptions,
  unresolvedMentionTokens,
  type MentionOption,
} from './mentions';

export interface MentionComposerProps {
  participants: readonly RoomParticipant[];
  isConnected: boolean;
  onSend: (values: ChatSendValues) => void;
}

const maxResolvedTargets = 50;
const mentionSuggestionsId = 'mention-suggestions';

function mentionOptionId(option: MentionOption): string {
  return `mention-option-${option.token}`;
}

function selectedMentions(value: string, options: readonly MentionOption[]): ChatMention[] {
  const usedTokens = new Set(mentionTokens(value).map((mention) => mention.token));
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
  const exceedsTargetLimit = mentions.length > maxResolvedTargets;
  const cannotSend = !text.trim() || !isConnected || unresolved.length > 0 ||
    exceedsTargetLimit || (delivery === 'mentioned' && mentions.length === 0);

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
      {exceedsTargetLimit && (
        <Alert variant="danger" isInline title="Too many mention targets" role="alert">
          A message can include at most 50 unique mention targets.
        </Alert>
      )}
      <div className="thought-khoral-mention-input">
        <TextArea
          aria-label="Message"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={suggestions.length > 0}
          aria-controls={suggestions.length > 0 ? mentionSuggestionsId : undefined}
          aria-activedescendant={suggestions.length > 0
            ? mentionOptionId(suggestions[activeIndex] ?? suggestions[0]!)
            : undefined}
          value={text}
          isDisabled={!isConnected}
          resizeOrientation="vertical"
          rows={3}
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
        />
        <Button
          aria-label="Send message"
          isDisabled={cannotSend}
          onClick={submit}
          variant="primary"
        >
          Send
        </Button>
        {suggestions.length > 0 && (
          <ul
            id={mentionSuggestionsId}
            className="thought-khoral-mention-menu"
            role="listbox"
            aria-label="Mention suggestions"
          >
            {suggestions.map((option, index) => (
              <li
                key={option.token}
                id={mentionOptionId(option)}
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
