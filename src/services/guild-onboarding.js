import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { getAlertConfig, setAlertConfig } from './alert-config-store.js';
import { ALERT_TYPES, ensureAlertRoles } from './schedule-alerts.js';

const ALERT_CHANNEL_NAMES = ['로아-알림', '알림', 'lostark', '로아', '일정'];

function botCanSend(channel) {
  const permissions = channel.permissionsFor(channel.guild.members.me);
  return Boolean(
    permissions?.has(PermissionFlagsBits.ViewChannel) &&
    permissions?.has(PermissionFlagsBits.SendMessages)
  );
}

async function findOrCreateAlertChannel(guild) {
  await guild.channels.fetch();

  const textChannels = [...guild.channels.cache.values()]
    .filter((channel) =>
      (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) &&
      botCanSend(channel)
    )
    .sort((a, b) => a.position - b.position);

  const namedChannel = textChannels.find((channel) => {
    const normalized = channel.name.toLowerCase();
    return ALERT_CHANNEL_NAMES.some((name) => normalized.includes(name.toLowerCase()));
  });

  if (namedChannel) {
    return namedChannel;
  }

  if (guild.members.me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return guild.channels.create({
      name: '로아-알림',
      type: ChannelType.GuildText,
      reason: 'Lost Ark bot default alert channel'
    });
  }

  return guild.systemChannel && botCanSend(guild.systemChannel)
    ? guild.systemChannel
    : textChannels[0] ?? null;
}

export async function setupGuildDefaults(guild) {
  const existingConfig = await getAlertConfig(guild.id);

  if (existingConfig?.channelId && existingConfig?.roleIds) {
    return { configured: false, reason: 'already_configured' };
  }

  const channel = existingConfig?.channelId
    ? await guild.channels.fetch(existingConfig.channelId).catch(() => null)
    : await findOrCreateAlertChannel(guild);

  if (!channel?.isTextBased()) {
    return { configured: false, reason: 'no_channel' };
  }

  let alertRoles;

  try {
    alertRoles = await ensureAlertRoles(guild, existingConfig?.roleBaseName ?? '로아스케줄러');
  } catch (error) {
    console.error('Failed to create default alert roles.');
    console.error(error);
    await setAlertConfig(guild.id, {
      enabled: false,
      channelId: channel.id,
      roleBaseName: existingConfig?.roleBaseName ?? '로아스케줄러'
    });
    return { configured: false, reason: 'role_failed', channelId: channel.id };
  }

  await setAlertConfig(guild.id, {
    enabled: false,
    channelId: channel.id,
    roleIds: Object.fromEntries(Object.entries(alertRoles).map(([key, role]) => [key, role.id])),
    roleBaseName: existingConfig?.roleBaseName ?? '로아스케줄러'
  });

  return { configured: true, channelId: channel.id };
}

export async function handleGuildCreate(guild) {
  console.log('Joined guild: ' + guild.name + ' (' + guild.id + ')');

  try {
    const result = await setupGuildDefaults(guild);
    console.log('Guild default setup: ' + guild.id + ', ' + JSON.stringify(result));
  } catch (error) {
    console.error('Failed to setup guild defaults: ' + guild.id);
    console.error(error);
  }
}
