import { REST, Routes } from 'discord.js';
import { commands } from './commands/index.js';
import { getConfig } from './config.js';

const { token, clientId, guildIds } = getConfig();
const rest = new REST({ version: '10' }).setToken(token);
const payload = commands.map((item) => item.data.toJSON());

try {
  console.log('Registering ' + payload.length + ' global slash command(s)...');
  await rest.put(Routes.applicationCommands(clientId), {
    body: payload
  });
  console.log('Global slash commands registered.');

  if (guildIds.length > 0) {
    console.log('Clearing old guild slash command duplicates for ' + guildIds.length + ' guild(s)...');

    for (const guildId of guildIds) {
      console.log('Clearing guild commands ' + guildId + '...');
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: []
      });
    }
  }

  console.log('Slash commands registered.');
} catch (error) {
  console.error('Failed to register slash commands.');
  console.error(error);
  process.exitCode = 1;
}
