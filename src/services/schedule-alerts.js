import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from 'discord.js';
import {
  getGameContentsCalendar,
  LostarkApiError
} from './lostark-api.js';
import { getAllAlertConfigs, setAlertConfig } from './alert-config-store.js';

const KST_TIME_ZONE = 'Asia/Seoul';
const CALENDAR_CACHE_MS = 10 * 60 * 1000;
const ALERT_BUTTON_PREFIX = 'lostark-alert-done';
const ALERT_TOGGLE_BUTTON_PREFIX = 'lostark-alert-toggle';
const ALERT_SUBSCRIBERS_KEY = 'all';
const QUIET_START_MINUTE = 4 * 60 + 30;
const QUIET_END_MINUTE = 7 * 60 + 30;

export const ALERT_TYPES = [
  { key: 'chaosGate', label: '카게', roleSuffix: '카게알림', buttonLabel: '카게 완료' },
  { key: 'fieldBoss', label: '필보', roleSuffix: '필보알림', buttonLabel: '필보 완료' },
  { key: 'goldIsland', label: '모험섬', roleSuffix: '모험섬알림', buttonLabel: '모험섬 완료' }
];

let calendarCache = {
  fetchedAt: 0,
  data: null
};

const sentKeys = new Set();
const roleResetKeys = new Set();

function kstParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: KST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function kstDateKey(date = new Date()) {
  const parts = kstParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function kstGameDateKey(date = new Date()) {
  const parts = kstParts(date);
  const gameDate = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));

  if (Number(parts.hour) < 6) {
    gameDate.setUTCDate(gameDate.getUTCDate() - 1);
  }

  return gameDate.toISOString().slice(0, 10);
}

function kstTimeLabel(date = new Date()) {
  const parts = kstParts(date);
  return `${parts.hour}:${parts.minute}`;
}

function timeLabelToMinuteOfDay(timeLabel) {
  const [hour, minute] = timeLabel.split(':').map(Number);
  return hour * 60 + minute;
}

function isQuietTime(timeLabel) {
  const minuteOfDay = timeLabelToMinuteOfDay(timeLabel);
  return minuteOfDay >= QUIET_START_MINUTE && minuteOfDay < QUIET_END_MINUTE;
}

function addMinutesToTimeLabel(timeLabel, minutes) {
  const [hour, minute] = timeLabel.split(':').map(Number);
  const total = (hour * 60 + minute + minutes + 24 * 60) % (24 * 60);
  const nextHour = String(Math.floor(total / 60)).padStart(2, '0');
  const nextMinute = String(total % 60).padStart(2, '0');
  return `${nextHour}:${nextMinute}`;
}

function gameDateKey(startTime) {
  const match = startTime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):/);

  if (!match) {
    return startTime.slice(0, 10);
  }

  const [, year, month, day, hour] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  if (Number(hour) < 6) {
    date.setUTCDate(date.getUTCDate() - 1);
  }

  return date.toISOString().slice(0, 10);
}

function eventTimesForDate(item, dateKey) {
  return [...new Set((item.StartTimes ?? [])
    .filter((time) => gameDateKey(time) === dateKey)
    .map((time) => time.slice(11, 16)))];
}

function eventsByCategoryForDate(calendar, categoryName, dateKey) {
  return calendar.filter((item) => item.CategoryName === categoryName && eventTimesForDate(item, dateKey).length > 0);
}

function rewardAppliesToDate(reward, dateKey) {
  return !reward.StartTimes || reward.StartTimes.some((time) => gameDateKey(time) === dateKey);
}

function rewardNames(item, dateKey) {
  return [...new Set((item.RewardItems ?? [])
    .flatMap((reward) => reward.Items ?? [])
    .filter((reward) => rewardAppliesToDate(reward, dateKey))
    .map((reward) => reward.Name)
    .filter(Boolean))];
}

function goldIslandsAt(calendar, dateKey, timeLabel) {
  return calendar
    .filter((item) => item.CategoryName === '모험 섬')
    .filter((item) => eventTimesForDate(item, dateKey).includes(timeLabel))
    .filter((item) => rewardNames(item, dateKey).some((name) => name.includes('골드')));
}

function isWednesdayGameDate(dateKey) {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay() === 3;
}

async function getCalendar() {
  const now = Date.now();

  if (calendarCache.data && now - calendarCache.fetchedAt < CALENDAR_CACHE_MS) {
    return calendarCache.data;
  }

  const data = await getGameContentsCalendar();
  calendarCache = {
    fetchedAt: now,
    data
  };

  return data;
}

function mentionText(roleId) {
  return roleId ? `<@&${roleId}> ` : '';
}

function alertTypeByKey(key) {
  return ALERT_TYPES.find((type) => type.key === key);
}

function doneButton(alertTypeKey) {
  const type = alertTypeByKey(alertTypeKey);

  return new ButtonBuilder()
    .setCustomId(`${ALERT_BUTTON_PREFIX}:${alertTypeKey}`)
    .setLabel(type?.buttonLabel ?? '완료')
    .setStyle(ButtonStyle.Success);
}

function doneButtonRow(alertTypeKey) {
  return new ActionRowBuilder().addComponents(doneButton(alertTypeKey));
}

function alertSubscriptionButton(subscribed) {
  return new ButtonBuilder()
    .setCustomId(ALERT_TOGGLE_BUTTON_PREFIX + ':all')
    .setLabel(subscribed ? '전체 알림 끄기' : '전체 알림 켜기')
    .setStyle(subscribed ? ButtonStyle.Danger : ButtonStyle.Primary);
}

function alertToggleButton(type, activeToday, disabled = false) {
  return new ButtonBuilder()
    .setCustomId(ALERT_TOGGLE_BUTTON_PREFIX + ':' + type.key)
    .setLabel(type.label + ' ' + (activeToday ? '켜짐' : '꺼짐'))
    .setStyle(activeToday ? ButtonStyle.Success : ButtonStyle.Secondary)
    .setDisabled(disabled);
}

async function alertManagePayload(client, guildId, member) {
  const config = await getAllAlertConfigs().then((configs) => configs[guildId]);

  if (!config?.channelId) {
    return {
      content: '아직 알림이 설정되지 않았습니다. `/알림설정`을 먼저 사용해 주세요.',
      components: []
    };
  }

  const nextConfig = await ensureConfiguredAlertRoles(client, guildId, config);
  const subscribed = isAlertSubscriber(nextConfig, member.id);
  const lines = [];
  const buttons = [];

  for (const type of ALERT_TYPES) {
    const roleId = alertRoleId(nextConfig, type.key);
    const activeToday = roleId ? member.roles.cache.has(roleId) : false;
    const status = activeToday ? '`ON`' : subscribed ? '`DONE`' : '`OFF`';

    lines.push(status + ' ' + type.label);
    buttons.push(alertToggleButton(type, activeToday, !subscribed));
  }

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('로스트아크 알림 설정')
    .setDescription([
      subscribed ? '현재 로스트아크 일정 알림을 받고 있습니다.' : '현재 로스트아크 일정 알림을 받지 않습니다.',
      '알림을 켜면 카게, 필보, 모험섬 알림을 모두 받습니다.',
      '`DONE`은 오늘 완료 버튼을 눌러 해당 알림만 오전 6시까지 꺼진 상태입니다.'
    ].join('\n'))
    .addFields({
      name: subscribed ? '오늘 알림 상태' : '알림 상태',
      value: lines.join('\n')
    });

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(alertSubscriptionButton(subscribed)),
      new ActionRowBuilder().addComponents(...buttons)
    ]
  };
}

function serverAlertsEnabled(config) {
  return config.enabled === true && config.enabledByCommand === true;
}

function alertRoleId(config, alertTypeKey) {
  return config.roleIds?.[alertTypeKey] ?? config.roleId ?? null;
}

function legacyAlertSubscribers(config) {
  return [...new Set(ALERT_TYPES.flatMap((type) => config.subscribers?.[type.key] ?? []))];
}

function alertSubscribers(config) {
  return config.subscribers?.[ALERT_SUBSCRIBERS_KEY] ?? legacyAlertSubscribers(config);
}

function isAlertSubscriber(config, userId) {
  return alertSubscribers(config).includes(userId);
}

function allSubscriberKeysPresent(config) {
  return Array.isArray(config.subscribers?.[ALERT_SUBSCRIBERS_KEY]);
}

async function setAlertSubscriber(guildId, userId, enabled) {
  const configs = await getAllAlertConfigs();
  const config = configs[guildId] ?? {};
  const subscribers = { ...(config.subscribers ?? {}) };
  const current = new Set(alertSubscribers(config));

  if (enabled) {
    current.add(userId);
  } else {
    current.delete(userId);
  }

  subscribers[ALERT_SUBSCRIBERS_KEY] = [...current];
  return setAlertConfig(guildId, { subscribers });
}

async function syncSubscribersFromCurrentRoles(guild, guildId, config) {
  if (allSubscriberKeysPresent(config)) {
    return config;
  }

  const subscribers = { ...(config.subscribers ?? {}) };
  const members = await guild.members.fetch();
  const current = new Set(legacyAlertSubscribers(config));

  for (const type of ALERT_TYPES) {
    const roleId = alertRoleId(config, type.key);

    if (!roleId) {
      continue;
    }

    for (const userId of members
      .filter((member) => !member.user.bot && member.roles.cache.has(roleId))
      .keys()) {
      current.add(userId);
    }
  }

  subscribers[ALERT_SUBSCRIBERS_KEY] = [...current];
  return setAlertConfig(guildId, { subscribers });
}

function consumeOnce(key) {
  if (sentKeys.has(key)) {
    return false;
  }

  sentKeys.add(key);

  if (sentKeys.size > 2000) {
    const oldKeys = [...sentKeys].slice(0, 500);
    for (const oldKey of oldKeys) {
      sentKeys.delete(oldKey);
    }
  }

  return true;
}

async function sendAlert(channel, roleId, key, message, alertTypeKey) {
  if (!consumeOnce(key)) {
    return;
  }

  const guide = alertTypeKey ? '\n오늘 이 알림을 끄려면 아래 완료 버튼을 누르세요. 다시 조정하려면 `/알림`을 사용하세요.' : '';

  await channel.send({
    content: `${mentionText(roleId)}${message}${guide}`,
    allowedMentions: roleId ? { roles: [roleId] } : { parse: [] },
    components: alertTypeKey ? [doneButtonRow(alertTypeKey)] : []
  });
}

async function findOrCreateRole(guild, roleName) {
  const existing = guild.roles.cache.find((role) => role.name === roleName);

  if (existing) {
    return existing;
  }

  return guild.roles.create({
    name: roleName,
    reason: 'Lost Ark schedule alert role'
  });
}

export async function ensureAlertRoles(guild, baseName = '로아스케줄러') {
  await guild.roles.fetch();
  const roleEntries = await Promise.all(
    ALERT_TYPES.map(async (type) => {
      const role = await findOrCreateRole(guild, `${baseName}-${type.roleSuffix}`);
      return [type.key, role];
    })
  );

  return Object.fromEntries(roleEntries);
}

async function assignAlertRolesToSubscribers(guild, config) {
  let total = 0;
  const userIds = alertSubscribers(config);

  for (const type of ALERT_TYPES) {
    const roleId = alertRoleId(config, type.key);

    if (!roleId || userIds.length === 0) {
      continue;
    }

    const role = await guild.roles.fetch(roleId).catch(() => null);

    if (!role) {
      continue;
    }

    for (const userId of userIds) {
      const member = await guild.members.fetch(userId).catch(() => null);

      if (!member || member.user.bot || member.roles.cache.has(role.id)) {
        continue;
      }

      await member.roles.add(role, 'Daily Lost Ark alert role reset for subscriber');
      total += 1;
    }
  }

  return total;
}

async function ensureConfiguredAlertRoles(client, guildId, config) {
  const guild = await client.guilds.fetch(guildId);

  if (config.roleIds && ALERT_TYPES.every((type) => config.roleIds[type.key])) {
    return syncSubscribersFromCurrentRoles(guild, guildId, config);
  }

  const baseRole = config.roleId ? await guild.roles.fetch(config.roleId).catch(() => null) : null;
  const baseName = config.roleBaseName ?? baseRole?.name ?? '로아스케줄러';
  const roles = await ensureAlertRoles(guild, baseName);
  const nextConfig = await setAlertConfig(guildId, {
    roleIds: Object.fromEntries(Object.entries(roles).map(([key, role]) => [key, role.id])),
    roleBaseName: baseName
  });

  return syncSubscribersFromCurrentRoles(guild, guildId, nextConfig);
}

export async function setMemberAlertSubscription(client, guild, member, enabled) {
  const config = await getAllAlertConfigs().then((configs) => configs[guild.id]);
  const nextConfig = await ensureConfiguredAlertRoles(client, guild.id, config ?? {});
  const roles = [];
  const changed = [];
  const already = [];
  const subscribed = isAlertSubscriber(nextConfig, member.id);

  for (const type of ALERT_TYPES) {
    const roleId = alertRoleId(nextConfig, type.key);
    const role = roleId ? await guild.roles.fetch(roleId).catch(() => null) : null;

    if (!role) {
      continue;
    }

    roles.push(role);
  }

  if (enabled) {
    await setAlertSubscriber(guild.id, member.id, true);

    for (const role of roles) {
      const hasRole = member.roles.cache.has(role.id);

      if (!hasRole) {
        await member.roles.add(role, 'Lost Ark alert subscribed by admin');
      }
    }

    (subscribed && roles.every((role) => member.roles.cache.has(role.id)) ? already : changed).push('전체 알림');
    return { changed, already };
  }

  await setAlertSubscriber(guild.id, member.id, false);

  for (const role of roles) {
    const hasRole = member.roles.cache.has(role.id);

    if (hasRole) {
      await member.roles.remove(role, 'Lost Ark alert unsubscribed by admin');
    }
  }

  (subscribed || roles.some((role) => member.roles.cache.has(role.id)) ? changed : already).push('전체 알림');
  return { changed, already };
}

export async function setMemberTodayAlert(client, guild, member, alertTypeKey, enabled) {
  const type = alertTypeByKey(alertTypeKey);

  if (!type) {
    return {
      ok: false,
      message: '알 수 없는 알림 종류입니다.'
    };
  }

  const config = await getAllAlertConfigs().then((configs) => configs[guild.id]);
  const nextConfig = await ensureConfiguredAlertRoles(client, guild.id, config ?? {});
  const roleId = alertRoleId(nextConfig, alertTypeKey);
  const role = roleId ? await guild.roles.fetch(roleId).catch(() => null) : null;

  if (!role) {
    return {
      ok: false,
      message: '알림 역할을 찾지 못했습니다. `/알림설정`을 다시 실행해 주세요.'
    };
  }

  await setAlertSubscriber(guild.id, member.id, true);

  if (enabled) {
    if (member.roles.cache.has(role.id)) {
      return {
        ok: true,
        changed: false,
        message: `이미 오늘  알림은 켜져 있습니다.`
      };
    }

    await member.roles.add(role, `Today's  alert restored by command`);
    return {
      ok: true,
      changed: true,
      message: `오늘  알림을 다시 켰습니다.`
    };
  }

  if (!member.roles.cache.has(role.id)) {
    return {
      ok: true,
      changed: false,
      message: `이미 오늘  알림은 꺼져 있습니다. 내일 오전 6시에 자동으로 다시 켜집니다.`
    };
  }

  await member.roles.remove(role, `Today's  alert disabled by command`);
  return {
    ok: true,
    changed: true,
    message: `오늘  알림을 껐습니다. 내일 오전 6시에 자동으로 다시 켜집니다.`
  };
}

export async function getAlertSubscriberSummary(client, guildId) {
  const config = await getAllAlertConfigs().then((configs) => configs[guildId]);

  if (!config?.channelId) {
    return null;
  }

  const guild = await client.guilds.fetch(guildId);
  const nextConfig = await ensureConfiguredAlertRoles(client, guildId, config);
  const subscribers = alertSubscribers(nextConfig);
  const subscribedMembers = [];
  const doneMembers = [];
  const missingUserIds = [];

  for (const userId of subscribers) {
    const member = await guild.members.fetch(userId).catch(() => null);

    if (!member || member.user.bot) {
      missingUserIds.push(userId);
      continue;
    }

    const hasAnyRole = ALERT_TYPES.some((type) => {
      const roleId = alertRoleId(nextConfig, type.key);
      return roleId && member.roles.cache.has(roleId);
    });

    if (hasAnyRole) {
      subscribedMembers.push(member);
    } else {
      doneMembers.push(member);
    }
  }

  return {
    config: nextConfig,
    subscribedMembers,
    doneMembers,
    missingUserIds
  };
}

async function resetAlertRoles(client, guildId, config, dateKey) {
  const key = `${guildId}-${dateKey}-role-reset`;

  if (!consumeResetOnce(key)) {
    return;
  }

  const nextConfig = await ensureConfiguredAlertRoles(client, guildId, config);
  const guild = await client.guilds.fetch(guildId);
  const assignedCount = await assignAlertRolesToSubscribers(guild, nextConfig);

  console.log(`Daily alert roles reset: ${guildId}, assigned ${assignedCount}`);
}

function consumeResetOnce(key) {
  if (roleResetKeys.has(key)) {
    return false;
  }

  roleResetKeys.add(key);

  if (roleResetKeys.size > 500) {
    const oldKeys = [...roleResetKeys].slice(0, 100);
    for (const oldKey of oldKeys) {
      roleResetKeys.delete(oldKey);
    }
  }

  return true;
}

async function tickGuild(client, guildId, options) {
  if (!client.guilds.cache.has(guildId)) {
    return;
  }

  if (!serverAlertsEnabled(options)) {
    return;
  }

  const config = await ensureConfiguredAlertRoles(client, guildId, options);
  const { channelId } = config;

  const now = new Date();
  const dateKey = kstDateKey(now);
  const gameDate = kstGameDateKey(now);
  const timeLabel = kstTimeLabel(now);
  const minute = timeLabel.slice(3, 5);
  const targetDate = new Date(now.getTime() + 3 * 60 * 1000);
  const targetGameDate = kstGameDateKey(targetDate);
  const targetTimeLabel = addMinutesToTimeLabel(timeLabel, 3);
  const chaosGateSoonDate = new Date(now.getTime() + 1 * 60 * 1000);
  const chaosGateSoonGameDate = kstGameDateKey(chaosGateSoonDate);
  const goldTargetDate = new Date(now.getTime() + 5 * 60 * 1000);
  const goldTargetGameDate = kstGameDateKey(goldTargetDate);
  const goldTargetTimeLabel = addMinutesToTimeLabel(timeLabel, 5);

  if (timeLabel === '06:00') {
    await resetAlertRoles(client, guildId, config, dateKey);
  }

  if (isQuietTime(timeLabel)) {
    return;
  }

  const channel = await client.channels.fetch(channelId);

  if (!channel?.isTextBased()) {
    console.warn(`Schedule alert channel is not text based: ${guildId}`);
    return;
  }

  const calendar = await getCalendar();

  if (minute === '57') {
    const fieldBosses = isWednesdayGameDate(targetGameDate)
      ? []
      : eventsByCategoryForDate(calendar, '필드보스', targetGameDate);
    if (fieldBosses.length > 0) {
      const roleId = alertRoleId(config, 'fieldBoss');
      await sendAlert(channel, roleId, `${guildId}-${dateKey}-${timeLabel}-field-boss`, '3분 뒤 필보 가라~', 'fieldBoss');
    }

    const chaosGates = isWednesdayGameDate(targetGameDate)
      ? []
      : eventsByCategoryForDate(calendar, '카오스게이트', targetGameDate);
    if (chaosGates.length > 0) {
      const roleId = alertRoleId(config, 'chaosGate');
      await sendAlert(channel, roleId, `${guildId}-${dateKey}-${timeLabel}-chaos-gate`, '3분 뒤 카게 가라~', 'chaosGate');
    }
  }

  if (minute === '02') {
    const fieldBosses = isWednesdayGameDate(gameDate)
      ? []
      : eventsByCategoryForDate(calendar, '필드보스', gameDate);
    if (fieldBosses.length > 0) {
      const roleId = alertRoleId(config, 'fieldBoss');
      await sendAlert(channel, roleId, `${guildId}-${dateKey}-${timeLabel}-field-boss-soon`, '곧 필보 등장!!', 'fieldBoss');
    }
  }

  if (minute === '59') {
    const chaosGates = isWednesdayGameDate(chaosGateSoonGameDate)
      ? []
      : eventsByCategoryForDate(calendar, '카오스게이트', chaosGateSoonGameDate);
    if (chaosGates.length > 0) {
      const roleId = alertRoleId(config, 'chaosGate');
      await sendAlert(channel, roleId, `${guildId}-${dateKey}-${timeLabel}-chaos-gate-soon`, '곧 카게 열림!!', 'chaosGate');
    }
  }

  const goldIslands = goldIslandsAt(calendar, goldTargetGameDate, goldTargetTimeLabel);
  if (goldIslands.length > 0) {
    const names = goldIslands.map((item) => item.ContentsName).join(', ');
    const roleId = alertRoleId(config, 'goldIsland');
    await sendAlert(channel, roleId, `${guildId}-${dateKey}-${timeLabel}-gold-island`, `5분 뒤 ${goldTargetTimeLabel} ${names} 쌀섬!!`, 'goldIsland');
  }
}

async function tick(client) {
  const configs = await getAllAlertConfigs();
  const entries = Object.entries(configs).filter(([, config]) => config?.channelId);

  for (const [guildId, config] of entries) {
    await tickGuild(client, guildId, config);
  }
}

export function startScheduleAlerts(client) {
  console.log('Schedule alerts enabled.');

  setInterval(() => {
    tick(client).catch((error) => {
      if (error instanceof LostarkApiError) {
        console.error(`Schedule alert API error: ${error.message}`);
        return;
      }

      console.error('Schedule alert failed.');
      console.error(error);
    });
  }, 30 * 1000);
}

export async function handleAlertDoneButton(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith(`${ALERT_BUTTON_PREFIX}:`)) {
    return false;
  }

  if (!interaction.guildId || !interaction.guild || !interaction.member) {
    await interaction.reply({
      content: '서버에서만 사용할 수 있는 버튼입니다.',
      ephemeral: true
    });
    return true;
  }

  const [, alertTypeKey] = interaction.customId.split(':');
  const type = alertTypeByKey(alertTypeKey);

  if (!type) {
    await interaction.reply({
      content: '알 수 없는 알림 버튼입니다.',
      ephemeral: true
    });
    return true;
  }

  const config = await getAllAlertConfigs().then((configs) => configs[interaction.guildId]);
  const nextConfig = await ensureConfiguredAlertRoles(interaction.client, interaction.guildId, config ?? {});
  const roleId = alertRoleId(nextConfig, alertTypeKey);

  if (!roleId) {
    await interaction.reply({
      content: '이 알림 역할이 아직 설정되지 않았습니다. `/알림설정`을 다시 실행해 주세요.',
      ephemeral: true
    });
    return true;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const role = await interaction.guild.roles.fetch(roleId);

  if (!role) {
    await interaction.reply({
      content: '알림 역할을 찾지 못했습니다. `/알림설정`을 다시 실행해 주세요.',
      ephemeral: true
    });
    return true;
  }

  if (!member.roles.cache.has(role.id)) {
    const subscribed = isAlertSubscriber(nextConfig, interaction.user.id);
    await interaction.reply({
      content: subscribed
        ? `이미 오늘 ${type.label} 알림은 완료되어 있습니다. 내일 오전 6시에 다시 켜집니다.`
        : `현재 ${type.label} 알림을 구독하지 않고 있습니다. 다시 받으려면 \`/알림\`에서 켜세요.`,
      ephemeral: true
    });
    return true;
  }

  await member.roles.remove(role, `Completed today's ${type.label} alert`);
  await setAlertSubscriber(interaction.guildId, interaction.user.id, true);
  await interaction.reply({
    content: `오늘 ${type.label} 알림을 껐습니다. 다시 켜려면 \`/알림\`을 사용하세요. 내일 오전 6시에 자동으로 다시 켜집니다.`,
    ephemeral: true
  });
  return true;
}

export async function alertManageReply(interaction) {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: '서버에서만 사용할 수 있는 명령입니다.',
      ephemeral: true
    });
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  await interaction.reply({
    ...(await alertManagePayload(interaction.client, interaction.guildId, member)),
    ephemeral: true
  });
}

export async function handleAlertToggleButton(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith(`${ALERT_TOGGLE_BUTTON_PREFIX}:`)) {
    return false;
  }

  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: '서버에서만 사용할 수 있는 버튼입니다.',
      ephemeral: true
    });
    return true;
  }

  const [, alertTypeKey] = interaction.customId.split(':');
  const config = await getAllAlertConfigs().then((configs) => configs[interaction.guildId]);
  const nextConfig = await ensureConfiguredAlertRoles(interaction.client, interaction.guildId, config ?? {});
  const member = await interaction.guild.members.fetch(interaction.user.id);

  if (alertTypeKey && alertTypeKey !== 'all') {
    const type = alertTypeByKey(alertTypeKey);
    const roleId = alertRoleId(nextConfig, alertTypeKey);
    const role = roleId ? await interaction.guild.roles.fetch(roleId).catch(() => null) : null;

    if (!type || !role) {
      await interaction.reply({
        content: '알림 역할을 찾지 못했습니다. `/알림설정`을 다시 실행해 주세요.',
        ephemeral: true
      });
      return true;
    }

    await setAlertSubscriber(interaction.guildId, interaction.user.id, true);

    if (member.roles.cache.has(role.id)) {
      await member.roles.remove(role, 'Today\'s ' + type.label + ' alert disabled by user');
    } else {
      await member.roles.add(role, 'Today\'s ' + type.label + ' alert enabled by user');
    }

    const refreshedMember = await interaction.guild.members.fetch(interaction.user.id);
    await interaction.update(await alertManagePayload(interaction.client, interaction.guildId, refreshedMember));
    return true;
  }

  const subscribed = isAlertSubscriber(nextConfig, interaction.user.id);
  const roles = [];

  for (const type of ALERT_TYPES) {
    const roleId = alertRoleId(nextConfig, type.key);
    const role = roleId ? await interaction.guild.roles.fetch(roleId).catch(() => null) : null;

    if (role) {
      roles.push(role);
    }
  }

  if (roles.length === 0) {
    await interaction.reply({
      content: '알림 역할을 찾지 못했습니다. `/알림설정`을 다시 실행해 주세요.',
      ephemeral: true
    });
    return true;
  }

  if (subscribed) {
    await setAlertSubscriber(interaction.guildId, interaction.user.id, false);

    for (const role of roles) {
      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role, 'Lost Ark alert unsubscribed by user');
      }
    }
  } else {
    await setAlertSubscriber(interaction.guildId, interaction.user.id, true);

    for (const role of roles) {
      if (!member.roles.cache.has(role.id)) {
        await member.roles.add(role, 'Lost Ark alert subscribed by user');
      }
    }
  }

  const refreshedMember = await interaction.guild.members.fetch(interaction.user.id);
  await interaction.update(await alertManagePayload(interaction.client, interaction.guildId, refreshedMember));
  return true;
}
