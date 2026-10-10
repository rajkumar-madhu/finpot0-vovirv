import { getRedisClient } from '../db/redis.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import type { ConversationTurn } from '../types/index.js';

const makeKey = (tenantId: string, sessionId: string) =>
  `conv:${tenantId}:${sessionId}`;

export async function getHistory(
  tenantId: string,
  sessionId: string
): Promise<ConversationTurn[]> {
  const client = await getRedisClient();
  const key = makeKey(tenantId, sessionId);
  const raw = await client.get(key);

  if (!raw) return [];

  // Reset TTL on read — active conversations shouldn't expire between turns
  await client.expire(key, config.sessionTtlSeconds);

  return JSON.parse(raw) as ConversationTurn[];
}

export async function appendTurns(
  tenantId: string,
  sessionId: string,
  userText: string,
  assistantText: string
): Promise<void> {
  const client = await getRedisClient();
  const key = makeKey(tenantId, sessionId);

  const raw = await client.get(key);
  const history: ConversationTurn[] = raw ? (JSON.parse(raw) as ConversationTurn[]) : [];

  history.push(
    { role: 'user', content: userText },
    { role: 'assistant', content: assistantText },
  );

  // Cap at maxHistoryTurns pairs to keep context window bounded
  const maxMessages = config.maxHistoryTurns * 2;
  const trimmed =
    history.length > maxMessages ? history.slice(history.length - maxMessages) : history;

  await client.setEx(key, config.sessionTtlSeconds, JSON.stringify(trimmed));

  logger.debug(
    { tenantId, sessionId, turns: trimmed.length / 2 },
    'conversation_history_updated',
  );
}

export async function deleteHistory(
  tenantId: string,
  sessionId: string
): Promise<void> {
  const client = await getRedisClient();
  await client.del(makeKey(tenantId, sessionId));
}
