import { describe, expect, it } from 'vitest';

import type { RoomParticipant } from '../../api';
import {
  activeMentionQuery,
  insertMention,
  mentionOptions,
  participantToken,
  unresolvedMentionTokens,
} from './mentions';

const participants: RoomParticipant[] = [
  {
    id: 'f4c0ffee-1234-4567-8901-abcdef123456',
    role: 'human',
    displayName: 'Maya Chen',
    online: true,
  },
  {
    id: 'c0ffee00-1234-4567-8901-abcdef123456',
    role: 'agent',
    displayName: 'Atlas Planner',
    online: false,
  },
];

describe('participantToken', () => {
  it('slugs a display name into a lowercase hyphenated token', () => {
    expect(participantToken(
      { ...participants[0], displayName: '  Maya—Chen!  ' },
      participants,
    )).toBe('maya-chen');
  });

  it('disambiguates every participant whose normalized display name collides', () => {
    const colliding = [
      { ...participants[0], displayName: 'Maya Chen' },
      { ...participants[1], displayName: 'maya--chen' },
    ];

    expect(participantToken(colliding[0], colliding)).toBe('maya-chen-f4c0ffee');
    expect(participantToken(colliding[1], colliding)).toBe('maya-chen-c0ffee00');
  });
});

describe('mentionOptions', () => {
  it('offers participant tokens and both group aliases', () => {
    expect(mentionOptions(participants)).toEqual([
      {
        type: 'participant',
        participant: participants[0],
        token: 'maya-chen',
      },
      {
        type: 'participant',
        participant: participants[1],
        token: 'atlas-planner',
      },
      { type: 'alias', alias: 'allhumans', token: 'allhumans' },
      { type: 'alias', alias: 'allagents', token: 'allagents' },
    ]);
  });
});

describe('activeMentionQuery', () => {
  it.each([
    ['finds a query at the end of a message', 'Please ask @maya', 16, { start: 11, query: 'maya' }],
    ['finds an empty query', 'Please ask @', 12, { start: 11, query: '' }],
    ['finds the query after punctuation', 'Hi, @atl', 8, { start: 4, query: 'atl' }],
    ['uses the cursor rather than the end of the value', '@maya then', 5, { start: 0, query: 'maya' }],
  ])('%s', (_, value, cursor, expected) => {
    expect(activeMentionQuery(value, cursor)).toEqual(expected);
  });

  it.each([
    ['does not treat an email address as a mention', 'email maya@example.com', 22],
    ['stops at whitespace', '@maya chen', 10],
    ['stops after a completed token followed by punctuation', '@maya, please', 13],
  ])('%s', (_, value, cursor) => {
    expect(activeMentionQuery(value, cursor)).toBeNull();
  });
});

describe('insertMention', () => {
  it('replaces the active query and places the cursor after the canonical token', () => {
    const option = mentionOptions(participants)[0];

    expect(insertMention('Please ask @may now', 15, option)).toEqual({
      value: 'Please ask @maya-chen now',
      cursor: 21,
    });
  });

  it('leaves the value and cursor unchanged when no mention query is active', () => {
    const option = mentionOptions(participants)[0];

    expect(insertMention('Please ask Maya', 15, option)).toEqual({
      value: 'Please ask Maya',
      cursor: 15,
    });
  });
});

describe('unresolvedMentionTokens', () => {
  it('returns unknown or stale mentions across a message while ignoring known aliases', () => {
    expect(unresolvedMentionTokens(
      '@maya-chen, please ask @former-user and @allagents.',
      mentionOptions(participants),
    )).toEqual(['@former-user']);
  });

  it('does not mistake email addresses or punctuation for mentions', () => {
    expect(unresolvedMentionTokens(
      'Email maya@example.com; then ask @unknown!',
      mentionOptions(participants),
    )).toEqual(['@unknown']);
  });
});
