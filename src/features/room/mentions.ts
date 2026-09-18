import type { RoomParticipant } from '../../api';

export type MentionOption =
  | {
      type: 'participant';
      participant: RoomParticipant;
      token: string;
    }
  | {
      type: 'alias';
      alias: 'allhumans' | 'allagents';
      token: 'allhumans' | 'allagents';
    };

export interface ActiveMentionQuery {
  start: number;
  query: string;
}

function normalizedParticipantName(displayName: string): string {
  return (
    displayName
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'participant'
  );
}

export function participantToken(
  participant: RoomParticipant,
  participants: readonly RoomParticipant[],
): string {
  const name = normalizedParticipantName(participant.displayName);
  const hasCollision = participants.filter(
    (candidate) => normalizedParticipantName(candidate.displayName) === name,
  ).length > 1;

  return hasCollision ? `${name}-${participant.id.slice(0, 8).toLowerCase()}` : name;
}

export function mentionOptions(
  participants: readonly RoomParticipant[],
): MentionOption[] {
  return [
    ...participants.map((participant) => ({
      type: 'participant' as const,
      participant,
      token: participantToken(participant, participants),
    })),
    { type: 'alias', alias: 'allhumans', token: 'allhumans' },
    { type: 'alias', alias: 'allagents', token: 'allagents' },
  ];
}

function isMentionBoundary(value: string, atIndex: number): boolean {
  return (
    atIndex === 0 ||
    !/[a-z0-9._%+-]/i.test(value.charAt(atIndex - 1))
  );
}

export function activeMentionQuery(
  value: string,
  cursor: number,
): ActiveMentionQuery | null {
  const clampedCursor = Math.max(0, Math.min(cursor, value.length));
  let atIndex = clampedCursor - 1;
  while (atIndex >= 0 && /[a-z0-9-]/i.test(value.charAt(atIndex))) {
    atIndex -= 1;
  }

  if (value.charAt(atIndex) !== '@' || !isMentionBoundary(value, atIndex)) {
    return null;
  }

  return { start: atIndex, query: value.slice(atIndex + 1, clampedCursor) };
}

export function insertMention(
  value: string,
  cursor: number,
  option: MentionOption,
): { value: string; cursor: number } {
  const activeQuery = activeMentionQuery(value, cursor);
  if (!activeQuery) {
    return { value, cursor };
  }

  const replacement = `@${option.token}`;
  const nextValue = `${value.slice(0, activeQuery.start)}${replacement}${value.slice(cursor)}`;
  return {
    value: nextValue,
    cursor: activeQuery.start + replacement.length,
  };
}

export function unresolvedMentionTokens(
  value: string,
  options: readonly MentionOption[],
): string[] {
  const knownTokens = new Set(options.map((option) => option.token));
  const unresolved: string[] = [];
  const pattern = /@([a-z0-9]+(?:-[a-z0-9]+)*)/gi;

  for (const match of value.matchAll(pattern)) {
    const atIndex = match.index ?? 0;
    const token = match[1];
    if (isMentionBoundary(value, atIndex) && !knownTokens.has(token.toLowerCase())) {
      unresolved.push(match[0]);
    }
  }

  return unresolved;
}
