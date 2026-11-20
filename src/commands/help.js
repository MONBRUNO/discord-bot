import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';

export const command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('사용 가능한 명령 목록을 보여줍니다.'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('봇 명령어 모음')
      .setDescription('로스트아크 정보 조회와 경매 분배금 계산을 지원합니다.')
      .addFields(
        { name: '/정보 [character]', value: '캐릭터 장비, 악세서리, 각인, 보석, 카드 정보를 이미지로 조회합니다.', inline: false },
        { name: '/카드 [character]', value: '캐릭터 장착 카드 세트를 조회합니다.', inline: false },
        { name: '/전각 [item]', value: '전설 각인서 최저가 기준으로 경매 분배 입찰가를 계산합니다.', inline: false },
        { name: '/골드 [gold]', value: '입력한 골드 기준으로 경매 분배 입찰가를 계산합니다.', inline: false },
        { name: '/일정 [date]', value: '필드보스, 카오스게이트, 모험섬, 항해 협동 일정을 조회합니다.', inline: false },
        { name: '/주간컨텐츠', value: '이번 주 도전 어비스 던전과 도전 가디언 토벌 정보를 조회합니다.', inline: false },
        { name: '/ping', value: '봇 응답 속도를 확인합니다.', inline: false }
      );

    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }
};
