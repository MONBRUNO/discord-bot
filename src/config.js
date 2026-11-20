import 'dotenv/config';

const requiredEnv = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID'];

export function getConfig({ requireGuildId = false } = {}) {
  const missing = requiredEnv.filter((key) => !process.env[key]);

  const guildIds = (process.env.DISCORD_GUILD_IDS ?? process.env.DISCORD_GUILD_ID ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (requireGuildId && guildIds.length === 0) {
    missing.push('DISCORD_GUILD_ID or DISCORD_GUILD_IDS');
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    guildId: guildIds[0],
    guildIds,
    lostarkApiKey: process.env.LOSTARK_API_KEY
  };
}
