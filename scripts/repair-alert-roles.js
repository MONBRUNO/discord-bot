import fs from 'node:fs/promises';
import { Client, GatewayIntentBits } from 'discord.js';

const ALERT_CONFIG_PATH = 'data/alert-configs.json';

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error('DISCORD_TOKEN is required.');
  process.exit(1);
}

const configs = JSON.parse(await fs.readFile(ALERT_CONFIG_PATH, 'utf8'));
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

client.once('ready', async () => {
  try {
    for (const [guildId, config] of Object.entries(configs)) {
      const guild = await client.guilds.fetch(guildId);
      const roleIds = Object.values(config.roleIds ?? {}).filter(Boolean);
      const roles = [];

      await guild.roles.fetch();

      for (const roleId of roleIds) {
        const role = await guild.roles.fetch(roleId).catch(() => null);

        if (role) {
          roles.push(role);
        } else {
          console.log(`MISSING_ROLE ${guild.name} ${roleId}`);
        }
      }

      const members = await guild.members.fetch();
      let changes = 0;

      for (const member of members.values()) {
        if (member.user.bot) {
          continue;
        }

        const missingRoles = roles.filter((role) => !member.roles.cache.has(role.id));

        if (missingRoles.length > 0) {
          console.log(`MISSING_MEMBER ${guild.name} ${member.user.tag} ${missingRoles.map((role) => role.name).join(', ')}`);
        }

        for (const role of missingRoles) {
          await member.roles.add(role, 'Manual Lost Ark alert role repair');
          changes += 1;
        }
      }

      console.log(`REPAIRED ${guild.name} ${changes}`);
    }
  } finally {
    client.destroy();
  }
});

await client.login(token);
