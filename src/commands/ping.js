import { SlashCommandBuilder } from 'discord.js';

export const command = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('봇 응답 속도를 확인합니다.'),

  async execute(interaction) {
    await interaction.reply('Pinging...');
    const sent = await interaction.fetchReply();

    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply(`Pong! ${latency}ms`);
  }
};
