import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';
import { getAlertConfig, setAlertConfig } from '../services/alert-config-store.js';
import {
  ALERT_TYPES,
  alertManageReply,
  ensureAlertRoles,
  getAlertSubscriberSummary,
  setMemberAlertSubscription,
  setMemberTodayAlert
} from '../services/schedule-alerts.js';

function memberListText(members) {
  if (members.length === 0) {
    return '-';
  }

  const text = members.map((member) => `${member}`).join(', ');
  return text.length > 850 ? `${text.slice(0, 847)}...` : text;
}

export const alertSetupCommand = {
  data: new SlashCommandBuilder()
    .setName('알림설정')
    .setDescription('로스트아크 일정 알림 채널을 설정하고 알림 역할을 자동으로 준비합니다.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('알림을 보낼 채널')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      await interaction.reply({
        content: '서버에서만 사용할 수 있는 명령입니다.',
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.options.getChannel('channel', true);
    const roleBaseName = '로아스케줄러';

    let alertRoles;

    try {
      alertRoles = await ensureAlertRoles(interaction.guild, roleBaseName);
    } catch (error) {
      console.error(error);
      await interaction.editReply({
        content: '컨텐츠별 알림 역할을 만들 수 없습니다. 봇에 `역할 관리` 권한이 있는지, 봇 역할이 만들려는 역할보다 위에 있는지 확인해 주세요.',
      });
      return;
    }

    await setAlertConfig(interaction.guildId, {
      enabled: false,
      channelId: channel.id,
      roleIds: Object.fromEntries(Object.entries(alertRoles).map(([key, alertRole]) => [key, alertRole.id])),
      roleBaseName
    });

    await interaction.editReply({
      content: [
        '알림 채널과 역할 준비가 완료되었습니다.',
        `알림 채널: <#${channel.id}>`,
        ...ALERT_TYPES.map((type) => `${type.label} 역할: <@&${alertRoles[type.key].id}>`),
        '역할은 자동으로 전체 부여하지 않습니다.',
        '알림을 받을 멤버가 `/알림`에서 직접 켜면 그 사람에게만 역할이 붙습니다.',
        '서버 전체 시간 알림은 아직 꺼져 있습니다. 알림을 보내려면 `/알림켜기`를 사용하세요.'
      ].join('\n')
    });
  }
};

async function setServerAlertEnabled(interaction, enabled) {
  if (!interaction.guildId) {
    await interaction.reply({
      content: '서버에서만 사용할 수 있는 명령입니다.',
      ephemeral: true
    });
    return;
  }

  const config = await getAlertConfig(interaction.guildId);

  if (!config?.channelId) {
    await interaction.reply({
      content: '아직 알림 채널이 설정되지 않았습니다. `/알림설정`을 먼저 사용해 주세요.',
      ephemeral: true
    });
    return;
  }

  await setAlertConfig(interaction.guildId, { enabled, enabledByCommand: enabled });

  await interaction.reply({
    content: enabled
      ? `이 서버의 로스트아크 시간 알림을 켰습니다. 알림 채널: <#${config.channelId}>`
      : '이 서버의 로스트아크 시간 알림을 껐습니다. 역할은 그대로 두고, 시간 알림 메시지만 멈춥니다.',
    ephemeral: true
  });
}

export const alertEnableCommand = {
  data: new SlashCommandBuilder()
    .setName('알림켜기')
    .setDescription('이 서버의 로스트아크 시간 알림 발송을 켭니다.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await setServerAlertEnabled(interaction, true);
  }
};

export const alertDisableCommand = {
  data: new SlashCommandBuilder()
    .setName('알림끄기')
    .setDescription('이 서버의 로스트아크 시간 알림 발송을 끕니다.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await setServerAlertEnabled(interaction, false);
  }
};

export const alertStatusCommand = {
  data: new SlashCommandBuilder()
    .setName('알림상태')
    .setDescription('현재 서버의 로스트아크 일정 알림 설정을 확인합니다.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: '서버에서만 사용할 수 있는 명령입니다.',
        ephemeral: true
      });
      return;
    }

    const config = await getAlertConfig(interaction.guildId);

    if (!config?.channelId) {
      await interaction.reply({
        content: '아직 알림이 설정되지 않았습니다. `/알림설정`을 사용해 주세요.',
        ephemeral: true
      });
      return;
    }

    await interaction.reply({
      content: [
        `시간 알림: ${config.enabled === true && config.enabledByCommand === true ? '켜짐' : '꺼짐'}`,
        `알림 채널: <#${config.channelId}>`,
        ...ALERT_TYPES.map((type) => `${type.label} 역할: ${config.roleIds?.[type.key] ? `<@&${config.roleIds[type.key]}>` : '미설정'}`)
      ].join('\n'),
      ephemeral: true
    });
  }
};

export const alertAssignCommand = {
  data: new SlashCommandBuilder()
    .setName('알림지정')
    .setDescription('특정 멤버의 로스트아크 알림 구독을 관리합니다.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((option) =>
      option
        .setName('멤버')
        .setDescription('알림 구독을 바꿀 멤버')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('상태')
        .setDescription('구독 상태')
        .setRequired(true)
        .addChoices(
          { name: '켜기', value: 'on' },
          { name: '끄기', value: 'off' }
        )
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      await interaction.reply({
        content: '서버에서만 사용할 수 있는 명령입니다.',
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const user = interaction.options.getUser('멤버', true);
    const enabled = interaction.options.getString('상태', true) === 'on';
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (!member || member.user.bot) {
      await interaction.editReply({
        content: '알림을 지정할 수 없는 멤버입니다.'
      });
      return;
    }

    const { changed, already } = await setMemberAlertSubscription(
      interaction.client,
      interaction.guild,
      member,
      enabled
    );

    const embed = new EmbedBuilder()
      .setColor(enabled ? 0x57f287 : 0xed4245)
      .setTitle('알림 구독 변경')
      .setDescription(`${member}님의 알림 구독을 ${enabled ? '켰습니다.' : '껐습니다.'}`)
      .addFields(
        { name: '변경', value: changed.length > 0 ? changed.join(', ') : '-' },
        { name: '이미 같은 상태', value: already.length > 0 ? already.join(', ') : '-' }
      );

    await interaction.editReply({ embeds: [embed] });
  }
};

export const alertSubscribersCommand = {
  data: new SlashCommandBuilder()
    .setName('알림구독자')
    .setDescription('알림을 켠 멤버와 오늘 완료한 멤버를 확인합니다.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: '서버에서만 사용할 수 있는 명령입니다.',
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const result = await getAlertSubscriberSummary(interaction.client, interaction.guildId);

    if (!result) {
      await interaction.editReply({
        content: '아직 알림이 설정되지 않았습니다. `/알림설정`을 먼저 사용해 주세요.'
      });
      return;
    }

    const missingLine = result.missingUserIds.length > 0
      ? `\n서버에서 못 찾음: ${result.missingUserIds.length}명`
      : '';
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('알림 구독자')
      .setDescription([
        '구독자는 카게, 필보, 모험섬 알림을 받습니다.',
        '`받는 중`은 지금 하나 이상의 알림 역할이 붙어 있는 사람입니다.',
        '`오늘 전부 완료`는 구독은 유지 중이지만 오늘 받을 알림 역할이 전부 빠진 사람입니다.'
      ].join('\n'))
      .addFields(
        {
          name: '요약',
          value: `받는 중 ${result.subscribedMembers.length}명 · 오늘 전부 완료 ${result.doneMembers.length}명${missingLine}`
        },
        {
          name: '받는 중',
          value: memberListText(result.subscribedMembers)
        },
        {
          name: '오늘 전부 완료',
          value: memberListText(result.doneMembers)
        }
      );

    await interaction.editReply({ embeds: [embed] });
  }
};

export const alertTodayCommand = {
  data: new SlashCommandBuilder()
    .setName('알림오늘')
    .setDescription('오늘 받을 알림 역할 하나만 다시 켜거나 끕니다.')
    .addStringOption((option) =>
      option
        .setName('종류')
        .setDescription('바꿀 알림 종류')
        .setRequired(true)
        .addChoices(...ALERT_TYPES.map((type) => ({ name: type.label, value: type.key })))
    )
    .addStringOption((option) =>
      option
        .setName('상태')
        .setDescription('오늘 알림 상태')
        .setRequired(true)
        .addChoices(
          { name: '켜기', value: 'on' },
          { name: '끄기', value: 'off' }
        )
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      await interaction.reply({
        content: '서버에서만 사용할 수 있는 명령입니다.',
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const alertTypeKey = interaction.options.getString('종류', true);
    const enabled = interaction.options.getString('상태', true) === 'on';
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const result = await setMemberTodayAlert(
      interaction.client,
      interaction.guild,
      member,
      alertTypeKey,
      enabled
    );

    await interaction.editReply({
      content: result.message
    });
  }
};

export const alertManageCommand = {
  data: new SlashCommandBuilder()
    .setName('알림')
    .setDescription('내 로스트아크 일정 알림 역할을 켜고 끕니다.'),

  async execute(interaction) {
    await alertManageReply(interaction);
  }
};

export const alertCommands = [
  alertManageCommand,
  alertSetupCommand,
  alertEnableCommand,
  alertDisableCommand,
  alertStatusCommand,
  alertAssignCommand,
  alertSubscribersCommand
];
