import { SlashCommandBuilder } from 'discord.js';
import { createPartyRecruitment, partyListReply } from '../services/party-recruitment.js';

const partyRecruitCommand = {
  data: new SlashCommandBuilder()
    .setName('파티모집')
    .setDescription('파티 모집글을 만듭니다.')
    .addStringOption((option) =>
      option
        .setName('제목')
        .setDescription('파티 제목')
        .setRequired(true)
        .setMaxLength(80)
    )
    .addIntegerOption((option) =>
      option
        .setName('정원')
        .setDescription('파티장 포함 총 정원')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(30)
    ),

  async execute(interaction) {
    await createPartyRecruitment(interaction);
  }
};

const partyListCommand = {
  data: new SlashCommandBuilder()
    .setName('파티')
    .setDescription('현재 모집 중인 파티를 봅니다.'),

  async execute(interaction) {
    await partyListReply(interaction);
  }
};

export const partyCommands = [partyRecruitCommand, partyListCommand];
