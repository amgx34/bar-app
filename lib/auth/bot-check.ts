import { checkBotId } from 'botid/server';

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
