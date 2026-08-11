/** Fallback bot username when /api/telegram/config is unavailable. */
export const TELEGRAM_BOT_USERNAME = 'KuponiksFinder_bot';

export function buildTelegramDeepLink(
  botUsername: string,
  userId: string,
): string {
  const username = botUsername.replace(/^@/, '').trim();
  return `https://t.me/${username}?start=${encodeURIComponent(userId)}`;
}
