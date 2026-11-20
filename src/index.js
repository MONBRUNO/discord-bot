import { Client, Events, GatewayIntentBits } from 'discord.js';
import { createCommandCollection } from './commands/index.js';
import { getConfig } from './config.js';
import { startAccessoryPriceCache } from './commands/lostark.js';
import { handleAlertDoneButton, handleAlertToggleButton, startScheduleAlerts } from './services/schedule-alerts.js';
import { handlePartyInteraction } from './services/party-recruitment.js';
import { handleGuildCreate } from './services/guild-onboarding.js';

const { token } = getConfig();
const commands = createCommandCollection();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  startAccessoryPriceCache();
  startScheduleAlerts(readyClient);
});

client.on(Events.GuildCreate, (guild) => {
  handleGuildCreate(guild).catch((error) => {
    console.error('Guild onboarding failed.');
    console.error(error);
  });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (await handleAlertDoneButton(interaction)) {
    return;
  }

  if (await handleAlertToggleButton(interaction)) {
    return;
  }

  if (await handlePartyInteraction(interaction)) {
    return;
  }

  if (!interaction.isChatInputCommand()) {
    return;
  }

  const command = commands.get(interaction.commandName);

  if (!command) {
    await interaction.reply({
      content: '알 수 없는 명령입니다.',
      ephemeral: true
    });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Command failed: ${interaction.commandName}`);
    console.error(error);

    const response = {
      content: '명령을 처리하는 중 오류가 발생했습니다.',
      ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(response);
    } else {
      await interaction.reply(response);
    }
  }
});

client.login(token);
