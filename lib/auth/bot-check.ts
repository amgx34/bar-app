import { checkBotId } from 'botid/server';

import { LEGAL_CONTACT_EMAIL } from '@/lib/legal';

/** Shown when the bot check blocks someone. A real person who was wrongly flagged needs a way out. */
export const BOT_BLOCKED_MESSAGE = `Too many attempts. Try again in a few minutes. If this keeps happening, email ${LEGAL_CONTACT_EMAIL} and we will help.`;

/**
 * True when BotID says the caller is a bot. In local development checkBotId
 * answers "human", so this is a no-op there. It fails OPEN on an error: a false
 * block on a real owner is worse than a missed bot, and the rate limits on each
 * entry point (S2) still carry the load. Verified bots (good bots) pass.
 */
export async function isBotRequest(): Promise<boolean> {
  try {
    return (await checkBotId()).isBot;
  } catch (e) {
    console.warn('[botid] check failed, allowing:', e instanceof Error ? e.message : e);
    return false;
  }
}
