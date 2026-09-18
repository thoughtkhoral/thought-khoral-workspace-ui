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

const aliasTokens = new Set(['allhumans', 'allagents']);

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
  const index = participants.findIndex(
    (candidate) => candidate === participant || candidate.id === participant.id,
  );

  return participantTokens(participants)[index] ?? normalizedParticipantName(participant.displayName);
}

function participantIdToken(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]/g, '') || 'participant';
}

function participantTokens(participants: readonly RoomParticipant[]): string[] {
  const names = participants.map((participant) =>
    normalizedParticipantName(participant.displayName),
  );
  const nameCounts = new Map<string, number>();
  for (const name of names) {
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }

  const tokens: Array<string | undefined> = Array.from({ length: participants.length });
  const occupied = new Set(aliasTokens);
  const needsSuffix = (index: number) =>
    aliasTokens.has(names[index]) || (nameCounts.get(names[index]) ?? 0) > 1;

  for (const [index, name] of names.entries()) {
    if (!needsSuffix(index)) {
      tokens[index] = name;
      occupied.add(name);
    }
  }

  const disambiguated = participants
    .map((participant, index) => ({
      index,
      name: names[index],
      id: participantIdToken(participant.id),
    }))
    .filter(({ index }) => needsSuffix(index))
    .sort((left, right) =>
      left.name.localeCompare(right.name) ||
      left.id.localeCompare(right.id) ||
      left.index - right.index,
    );

  const suffixLengths = new Map<number, number>();
  for (const candidate of disambiguated) {
    const group = disambiguated.filter((item) => item.name === candidate.name);
    if (suffixLengths.has(candidate.index)) {
      continue;
    }

    let idLength = Math.min(8, Math.max(...group.map((item) => item.id.length)));
    while (
      idLength < Math.max(...group.map((item) => item.id.length)) &&
      (new Set(group.map((item) => item.id.slice(0, idLength))).size !== group.length ||
        group.some((item) => occupied.has(`${item.name}-${item.id.slice(0, idLength)}`)))
    ) {
      idLength += 1;
    }
    for (const item of group) {
      suffixLengths.set(item.index, idLength);
    }
  }

  for (const candidate of disambiguated) {
    let idLength = Math.min(suffixLengths.get(candidate.index) ?? 8, candidate.id.length);
    let token = `${candidate.name}-${candidate.id.slice(0, idLength)}`;
    while (occupied.has(token) && idLength < candidate.id.length) {
      idLength += 1;
      token = `${candidate.name}-${candidate.id.slice(0, idLength)}`;
    }

    let duplicate = 2;
    while (occupied.has(token)) {
      token = `${candidate.name}-${candidate.id}-${duplicate}`;
      duplicate += 1;
    }

    tokens[candidate.index] = token;
    occupied.add(token);
  }

  return tokens.map((token) => token ?? 'participant');
}

export function mentionOptions(
  participants: readonly RoomParticipant[],
): MentionOption[] {
  const tokens = participantTokens(participants);
  return [
    ...participants.map((participant, index) => ({
      type: 'participant' as const,
      participant,
      token: tokens[index]!,
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
  const pattern = /@([a-z0-9]+(?:-[a-z0-9]+)*)(?![a-z0-9.-])/gi;

  for (const match of value.matchAll(pattern)) {
    const atIndex = match.index ?? 0;
    const token = match[1];
    if (isMentionBoundary(value, atIndex) && !knownTokens.has(token.toLowerCase())) {
      unresolved.push(match[0]);
    }
  }

  return unresolved;
}
