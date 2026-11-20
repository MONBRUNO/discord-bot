import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder
} from 'discord.js';
import {
  closeParty,
  createParty,
  getParties,
  getParty,
  joinPartyAsMember,
  leavePartyAsMember,
  updateParty
} from './party-store.js';

const PARTY_JOIN_PREFIX = 'lostark-party-join';
const PARTY_CONFIRM_JOIN_PREFIX = 'lostark-party-confirm-join';
const PARTY_BUMP_PREFIX = 'lostark-party-bump';
const PARTY_CLOSE_PREFIX = 'lostark-party-close';
const PARTY_LEAVE_PREFIX = 'lostark-party-leave';
const PARTY_SELECT_ID = 'lostark-party-select';

function mentionUser(userId) {
  return '<@' + userId + '>';
}

function mentionChannel(channelId) {
  return '<#' + channelId + '>';
}

function truncate(value, maxLength) {
  const text = String(value ?? '');
  return text.length > maxLength ? text.slice(0, maxLength - 1) + '…' : text;
}

function participantText(party) {
  if (!party.participantIds?.length) {
    return '-';
  }

  return party.participantIds.map(mentionUser).join('\n');
}

function isFull(party) {
  return (party.participantIds?.length ?? 0) >= party.capacity;
}

function partyEmbed(party) {
  const count = party.participantIds?.length ?? 0;
  const full = isFull(party);
  const closed = party.status !== 'open';
  const status = closed ? '마감' : full ? '정원 마감' : '모집 중';

  return new EmbedBuilder()
    .setColor(closed ? 0x6b7280 : full ? 0xf59e0b : 0x22c55e)
    .setTitle('파티 모집')
    .setDescription('**' + party.title + '**')
    .addFields(
      { name: '상태', value: status, inline: true },
      { name: '인원', value: String(count) + '/' + String(party.capacity), inline: true },
      { name: '파티장', value: mentionUser(party.leaderId), inline: true },
      { name: '참가자', value: participantText(party), inline: false }
    )
    .setFooter({ text: '파티 ID ' + party.id + ' · 정원은 파티장 포함입니다.' })
    .setTimestamp(new Date(party.updatedAt ?? party.createdAt ?? Date.now()));
}

function partyPostRows(party, forceDisabled = false) {
  const closed = forceDisabled || party.status !== 'open';
  const full = isFull(party);

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(PARTY_JOIN_PREFIX + ':' + party.id)
        .setLabel(full ? '정원 마감' : '참가')
        .setStyle(ButtonStyle.Success)
        .setDisabled(closed || full),
      new ButtonBuilder()
        .setCustomId(PARTY_BUMP_PREFIX + ':' + party.id)
        .setLabel('끌올')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(forceDisabled),
      new ButtonBuilder()
        .setCustomId(PARTY_CLOSE_PREFIX + ':' + party.id)
        .setLabel('마감')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(closed),
      new ButtonBuilder()
        .setCustomId(PARTY_LEAVE_PREFIX + ':' + party.id)
        .setLabel('참가 취소')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(forceDisabled)
    )
  ];
}

async function replyEphemeral(interaction, content) {
  const payload = typeof content === 'string' ? { content, ephemeral: true } : { ...content, ephemeral: true };

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
}

async function sendPartyCompleteMessage(client, party) {
  const channel = await client.channels.fetch(party.channelId).catch(() => null);
  if (!channel?.isTextBased()) {
    return;
  }

  const mentions = party.participantIds.map(mentionUser).join(' ');
  await channel.send({
    content: [
      '파티 모집 완료!',
      '**' + party.title + '** 정원이 모두 찼습니다.',
      '참가자: ' + mentions
    ].join('\n'),
    allowedMentions: { users: party.participantIds }
  }).catch(() => null);
}

async function refreshPartyMessage(client, party) {
  if (!party.channelId || !party.messageId) {
    return;
  }

  const channel = await client.channels.fetch(party.channelId).catch(() => null);
  if (!channel?.isTextBased()) {
    return;
  }

  const message = await channel.messages.fetch(party.messageId).catch(() => null);
  if (!message) {
    return;
  }

  await message.edit({ embeds: [partyEmbed(party)], components: partyPostRows(party) }).catch(() => null);
}

async function disableOldPartyMessage(client, party) {
  if (!party.channelId || !party.messageId) {
    return;
  }

  const channel = await client.channels.fetch(party.channelId).catch(() => null);
  if (!channel?.isTextBased()) {
    return;
  }

  const message = await channel.messages.fetch(party.messageId).catch(() => null);
  if (!message) {
    return;
  }

  await message.edit({
    content: '끌올된 모집글입니다. 최신 모집글을 확인해 주세요.',
    embeds: [partyEmbed(party)],
    components: partyPostRows(party, true)
  }).catch(() => null);
}

export async function createPartyRecruitment(interaction) {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: '서버에서만 사용할 수 있는 명령입니다.', ephemeral: true });
    return;
  }

  if (!interaction.channel?.isTextBased()) {
    await interaction.reply({ content: '메시지를 보낼 수 있는 채널에서만 사용할 수 있습니다.', ephemeral: true });
    return;
  }

  const title = interaction.options.getString('제목', true).trim();
  const capacity = interaction.options.getInteger('정원', true);

  if (!title) {
    await interaction.reply({ content: '파티 제목을 입력해 주세요.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const party = await createParty({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    title,
    capacity,
    leaderId: interaction.user.id
  });

  const message = await interaction.channel.send({
    embeds: [partyEmbed(party)],
    components: partyPostRows(party)
  });

  const updated = await updateParty(interaction.guildId, party.id, (current) => ({
    ...current,
    messageId: message.id
  }));

  await message.edit({ embeds: [partyEmbed(updated)], components: partyPostRows(updated) });
  await interaction.editReply('파티 모집글을 만들었습니다: ' + message.url);
}

export async function partyListReply(interaction) {
  if (!interaction.guildId) {
    await interaction.reply({ content: '서버에서만 사용할 수 있는 명령입니다.', ephemeral: true });
    return;
  }

  const parties = await getParties(interaction.guildId);

  if (parties.length === 0) {
    await interaction.reply({ content: '현재 등록된 파티가 없습니다.', ephemeral: true });
    return;
  }

  const visibleParties = parties.slice(0, 25);
  const embed = new EmbedBuilder()
    .setColor(0x38bdf8)
    .setTitle('파티 목록')
    .setDescription(visibleParties.map((party, index) => {
      const count = party.participantIds?.length ?? 0;
      const status = party.status === 'open' ? '모집 중' : '마감';
      return String(index + 1) + '. [' + status + '] **' + party.title + '** (' + count + '/' + party.capacity + ') · ' + mentionChannel(party.channelId) + ' · 파티장 ' + mentionUser(party.leaderId);
    }).join('\n'));

  const menu = new StringSelectMenuBuilder()
    .setCustomId(PARTY_SELECT_ID)
    .setPlaceholder('확인할 파티를 선택하세요')
    .addOptions(visibleParties.map((party) => {
      const count = party.participantIds?.length ?? 0;
      const status = party.status === 'open' ? '모집 중' : '마감';
      return {
        label: truncate('[' + status + '] ' + party.title, 80),
        description: count + '/' + party.capacity + ' · 참가자 확인 / 참가자 끌올',
        value: party.id
      };
    }));

  await interaction.reply({
    content: '파티를 선택하면 참가자와 버튼을 확인할 수 있습니다.',
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(menu)],
    ephemeral: true
  });
}
async function joinParty(interaction, partyId, useUpdate = false) {
  if (!interaction.guildId) {
    await replyEphemeral(interaction, '서버에서만 사용할 수 있습니다.');
    return;
  }

  const result = await joinPartyAsMember(interaction.guildId, partyId, interaction.user.id);

  if (!result.ok) {
    const messages = {
      not_found: '이미 없어진 파티 모집입니다.',
      closed: '마감된 파티입니다.',
      already_joined: '이미 참가한 파티입니다.',
      full: '정원이 찬 파티입니다.'
    };

    const content = messages[result.reason] ?? '참가할 수 없습니다.';
    if (useUpdate) {
      await interaction.update({ content, embeds: [], components: [] });
    } else {
      await replyEphemeral(interaction, content);
    }
    return;
  }

  await refreshPartyMessage(interaction.client, result.party);

  if (result.completed) {
    await sendPartyCompleteMessage(interaction.client, result.party);
  }

  const content = result.completed
    ? result.party.title + ' 파티에 참가했습니다. 모집이 완료됐습니다. (' + result.party.participantIds.length + '/' + result.party.capacity + ')'
    : result.party.title + ' 파티에 참가했습니다. (' + result.party.participantIds.length + '/' + result.party.capacity + ')';
  if (useUpdate) {
    await interaction.update({ content, embeds: [], components: [] });
  } else {
    await replyEphemeral(interaction, content);
  }
}

async function showJoinConfirm(interaction, partyId) {
  const party = await getParty(interaction.guildId, partyId);

  if (!party) {
    await interaction.update({ content: '이미 없어진 파티입니다.', embeds: [], components: [] });
    return;
  }

  const row = party.status === 'open'
    ? new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(PARTY_CONFIRM_JOIN_PREFIX + ':' + party.id)
        .setLabel('참가하기')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(PARTY_BUMP_PREFIX + ':' + party.id)
        .setLabel('끌올')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(PARTY_LEAVE_PREFIX + ':' + party.id)
        .setLabel('참가 취소')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('lostark-party-cancel')
        .setLabel('닫기')
        .setStyle(ButtonStyle.Secondary)
    )
    : new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(PARTY_BUMP_PREFIX + ':' + party.id)
        .setLabel('끌올')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(PARTY_LEAVE_PREFIX + ':' + party.id)
        .setLabel('참가 취소')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('lostark-party-cancel')
        .setLabel('닫기')
        .setStyle(ButtonStyle.Secondary)
    );

  await interaction.update({
    content: party.status === 'open' ? '이 파티에 참가할까요?' : '마감된 파티입니다. 참가자 확인과 참가자 끌올은 가능합니다.',
    embeds: [partyEmbed(party)],
    components: [row]
  });
}

async function bumpParty(interaction, partyId) {
  if (!interaction.guildId || !interaction.channel?.isTextBased()) {
    await replyEphemeral(interaction, '메시지를 보낼 수 있는 서버 채널에서만 사용할 수 있습니다.');
    return;
  }

  const party = await getParty(interaction.guildId, partyId);

  if (!party) {
    await replyEphemeral(interaction, '이미 없어진 파티입니다.');
    return;
  }

  if (!party.participantIds.includes(interaction.user.id)) {
    await replyEphemeral(interaction, '참가 인원만 끌올할 수 있습니다.');
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  await disableOldPartyMessage(interaction.client, party);

  const nextParty = {
    ...party,
    channelId: interaction.channelId,
    bumpedAt: new Date().toISOString()
  };

  const message = await interaction.channel.send({
    embeds: [partyEmbed(nextParty)],
    components: partyPostRows(nextParty)
  });

  const updated = await updateParty(interaction.guildId, party.id, (current) => ({
    ...current,
    channelId: interaction.channelId,
    messageId: message.id,
    bumpedAt: nextParty.bumpedAt
  }));

  await message.edit({ embeds: [partyEmbed(updated)], components: partyPostRows(updated) });
  await interaction.editReply('파티 모집글을 끌올했습니다: ' + message.url);
}

async function leaveParty(interaction, partyId) {
  if (!interaction.guildId) {
    await replyEphemeral(interaction, '서버에서만 사용할 수 있습니다.');
    return;
  }

  const result = await leavePartyAsMember(interaction.guildId, partyId, interaction.user.id);

  if (!result.ok) {
    const messages = {
      not_found: '이미 없어진 파티 모집입니다.',
      not_participant: '참가 중인 파티가 아닙니다.'
    };
    await replyEphemeral(interaction, messages[result.reason] ?? '참가 취소를 할 수 없습니다.');
    return;
  }

  await refreshPartyMessage(interaction.client, result.party);

  if (result.leaderCancelled) {
    await replyEphemeral(interaction, result.party.title + ' 파티장 참가를 취소했고, 모집을 마감했습니다.');
    return;
  }

  if (result.reopened) {
    await replyEphemeral(interaction, result.party.title + ' 참가를 취소했습니다. 빈자리가 생겨 다시 모집 중으로 바뀌었습니다. (' + result.party.participantIds.length + '/' + result.party.capacity + ')');
    return;
  }

  await replyEphemeral(interaction, result.party.title + ' 참가를 취소했습니다. (' + result.party.participantIds.length + '/' + result.party.capacity + ')');
}

async function closePartyFromButton(interaction, partyId) {
  if (!interaction.guildId) {
    await replyEphemeral(interaction, '서버에서만 사용할 수 있습니다.');
    return;
  }

  const party = await getParty(interaction.guildId, partyId);

  if (!party) {
    await replyEphemeral(interaction, '이미 없어진 파티 모집입니다.');
    return;
  }

  if (party.leaderId !== interaction.user.id) {
    await replyEphemeral(interaction, '파티장만 마감할 수 있습니다.');
    return;
  }

  const closed = await closeParty(interaction.guildId, party.id);
  await refreshPartyMessage(interaction.client, closed);
  await replyEphemeral(interaction, '파티 모집을 마감했습니다.');
}

export async function handlePartyInteraction(interaction) {
  if (interaction.isStringSelectMenu() && interaction.customId === PARTY_SELECT_ID) {
    await showJoinConfirm(interaction, interaction.values[0]);
    return true;
  }

  if (!interaction.isButton()) {
    return false;
  }

  const [prefix, partyId] = interaction.customId.split(':');

  if (interaction.customId === 'lostark-party-cancel') {
    await interaction.update({ content: '취소했습니다.', embeds: [], components: [] });
    return true;
  }

  if (prefix === PARTY_JOIN_PREFIX) {
    await joinParty(interaction, partyId, false);
    return true;
  }

  if (prefix === PARTY_CONFIRM_JOIN_PREFIX) {
    await joinParty(interaction, partyId, true);
    return true;
  }

  if (prefix === PARTY_BUMP_PREFIX) {
    await bumpParty(interaction, partyId);
    return true;
  }

  if (prefix === PARTY_CLOSE_PREFIX) {
    await closePartyFromButton(interaction, partyId);
    return true;
  }

  if (prefix === PARTY_LEAVE_PREFIX) {
    await leaveParty(interaction, partyId);
    return true;
  }

  return false;
}
