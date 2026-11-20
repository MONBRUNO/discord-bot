import { AttachmentBuilder, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { calculateAuctionBids, formatGold } from '../services/auction-calculator.js';
import { renderCharacterCard } from '../services/character-card.js';
import { renderScheduleCard } from '../services/schedule-card.js';
import {
  getChallengeAbyssDungeons,
  getChallengeGuardianRaids,
  getCharacterCards,
  getCharacterEngravings,
  getCharacterEquipment,
  getCharacterGems,
  getCharacterProfile,
  getCharacterSiblings,
  getGameContentsCalendar,
  LostarkApiError,
  searchAuctionItems,
  searchMarketItems
} from '../services/lostark-api.js';

const GOLD_ICON_URL = 'https://cdn-lostark.game.onstove.com/EFUI_IconAtlas/Money/Money_4.png';
const ACCESSORY_PRICE_CACHE_REFRESH_MS = 10 * 60 * 1000;
const ACCESSORY_PRICE_CACHE_START_DELAY_MS = 5 * 1000;

const accessoryPriceCache = {
  topSingle: { refreshedAt: 0, description: null, refreshing: false, error: null },
  topMidQuality: { refreshedAt: 0, description: null, refreshing: false, error: null },
  tripleTop: { refreshedAt: 0, description: null, refreshing: false, error: null }
};

let accessoryPriceCacheStarted = false;

function createAuctionEmbed(title, gold, thumbnailUrl) {
  const bids = calculateAuctionBids(gold);

  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setAuthor({ name: title, iconURL: thumbnailUrl ?? GOLD_ICON_URL })
    .addFields(
      {
        name: '기준 금액',
        value: formatGold(gold),
        inline: false
      },
      {
        name: '4인 파티',
        value: [`입찰가: ${formatGold(bids.party4.bid)}`, `선점입찰가: ${formatGold(bids.party4.preemptiveBid)}`].join('\n'),
        inline: true
      },
      {
        name: '8인 파티',
        value: [`입찰가: ${formatGold(bids.party8.bid)}`, `선점입찰가: ${formatGold(bids.party8.preemptiveBid)}`].join('\n'),
        inline: true
      }
    );
}

function createPriceEmbed(title, description, thumbnailUrl) {
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setAuthor({ name: title, iconURL: thumbnailUrl ?? GOLD_ICON_URL })
    .setDescription(description)
    .setFooter({ text: 'Data: Lost Ark OpenAPI' })
    .setTimestamp();
}

function cacheTimeLabel(refreshedAt) {
  if (!refreshedAt) {
    return '갱신 전';
  }

  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(new Date(refreshedAt));
}

function marketPriceLine(item) {
  const minPrice = item.CurrentMinPrice ? formatGold(item.CurrentMinPrice) : '-';
  const recentPrice = item.RecentPrice ? formatGold(item.RecentPrice) : '-';
  return `**${item.Name}**\n최저가: ${minPrice} / 최근 거래가: ${recentPrice}`;
}

function gemBuyPrice(item) {
  return item?.AuctionInfo?.BuyPrice ?? item?.AuctionInfo?.StartPrice ?? 0;
}

function normalizeGemKind(value) {
  const aliases = {
    겁: '겁화',
    겁화: '겁화',
    작: '작열',
    작열: '작열',
    멸: '멸화',
    멸화: '멸화',
    홍: '홍염',
    홍염: '홍염'
  };

  return aliases[value] ?? value;
}

function gemItemName(level, kind) {
  return `${level}레벨 ${normalizeGemKind(kind)}`;
}

function formatPlainGold(value) {
  return Math.floor(value).toLocaleString('ko-KR');
}

function itemByGrade(items, grade) {
  return items.find((item) => item.Grade === grade);
}

async function arkGridGemPrices(itemName) {
  const result = await searchMarketItems(itemName, {
    categoryCode: 230000,
    sort: 'CURRENT_MIN_PRICE',
    sortCondition: 'ASC'
  });

  return result?.Items ?? [];
}

const ACCESSORY_PARTS = [
  {
    name: '목걸이',
    code: 200010,
    singles: [
      { label: '적주피%', name: '적에게 주는 피해 증가', code: 42, high: 2.0, mid: 1.2, percentage: true },
      { label: '추피%', name: '추가 피해', code: 41, high: 2.6, mid: 1.6, percentage: true },
      { label: '낙인력', name: '낙인력', code: 44, high: 8.0, mid: 4.8, percentage: true },
      { label: '조계획', name: '세레나데, 신앙, 조화 게이지 획득량 증가', code: 43, high: 6.0, mid: 3.6, percentage: true }
    ],
    tripleCombos: [
      ['적주피%', '추피%', '공'],
      ['적주피%', '추피%', '무공'],
      ['낙인력', '조계획', '무공'],
      ['낙인력', '조계획', '최생']
    ],
    midCombos: [
      ['적주피%', '추피%'],
      ['추피%', '적주피%'],
      ['낙인력', '조계획'],
      ['조계획', '낙인력']
    ]
  },
  {
    name: '귀걸이',
    code: 200020,
    singles: [
      { label: '무공%', name: '무기 공격력', code: 46, high: 3.0, mid: 1.8, percentage: true },
      { label: '공격력%', name: '공격력', code: 45, high: 1.55, mid: 0.95, percentage: true }
    ],
    tripleCombos: [
      ['무공%', '공격력%', '공'],
      ['무공%', '공격력%', '무공']
    ],
    midCombos: [
      ['무공%', '공격력%'],
      ['공격력%', '무공%']
    ]
  },
  {
    name: '반지',
    code: 200030,
    singles: [
      { label: '치적%', name: '치명타 적중률', code: 49, high: 1.55, mid: 0.95, percentage: true },
      { label: '치피%', name: '치명타 피해', code: 50, high: 4.0, mid: 2.4, percentage: true },
      { label: '아공강%', name: '아군 공격력 강화 효과', code: 51, high: 5.0, mid: 3.0, percentage: true },
      { label: '아피강%', name: '아군 피해량 강화 효과', code: 52, high: 7.5, mid: 4.5, percentage: true }
    ],
    tripleCombos: [
      ['치적%', '치피%', '공'],
      ['치적%', '치피%', '무공'],
      ['아공강%', '아피강%', '무공']
    ],
    midCombos: [
      ['치적%', '치피%'],
      ['치피%', '치적%'],
      ['아공강%', '아피강%'],
      ['아피강%', '아공강%']
    ]
  }
];

const ACCESSORY_EXTRA_OPTIONS = {
  공: { label: '공', name: '공격력', code: 53, high: 390, mid: 195, percentage: false },
  무공: { label: '무공', name: '무기 공격력', code: 54, high: 960, mid: 480, percentage: false },
  최생: { label: '최생', name: '최대 생명력', code: 55, high: 6500, mid: 3755, percentage: false }
};

function accessoryOption(firstOption, minValue) {
  return {
    FirstOption: 7,
    SecondOption: firstOption,
    MinValue: minValue,
    MaxValue: null
  };
}

function optionByLabel(part, label) {
  return part.singles.find((option) => option.label === label) ?? ACCESSORY_EXTRA_OPTIONS[label];
}

function accessoryBuyPrice(item) {
  return item?.AuctionInfo?.BuyPrice ?? item?.AuctionInfo?.StartPrice ?? 0;
}

function accessoryUpgradeText(item) {
  const options = item?.Options?.filter((option) => option.Type === 'ACCESSORY_UPGRADE') ?? [];

  if (options.length === 0) {
    return '연마 효과 없음';
  }

  return options
    .map((option) => {
      const value = option.IsValuePercentage ? `${option.Value}%` : option.Value;
      return `${option.OptionName} ${value}`;
    })
    .join(' / ');
}

function itemHasAccessoryOptions(item, requiredOptions) {
  const options = item?.Options?.filter((option) => option.Type === 'ACCESSORY_UPGRADE') ?? [];

  return requiredOptions.every((required) =>
    options.some((option) => {
      const optionName = String(option.OptionName ?? '').replaceAll('%', '').replace(/\s+/g, '');
      const requiredName = String(required.name ?? '').replaceAll('%', '').replace(/\s+/g, '');
      const percentageMatches =
        required.percentage == null || Boolean(option.IsValuePercentage) === Boolean(required.percentage);

      return optionName === requiredName && percentageMatches && Number(option.Value) >= required.value;
    })
  );
}

async function findAccessoryPresetItem(part, requiredOptions, { itemGradeQuality = 67, pageLimit = 30 } = {}) {
  const etcOptions = requiredOptions.map((option) =>
    accessoryOption(option.code, option.value < 20 ? Math.round(option.value * 100) : option.value)
  );

  for (let pageNo = 1; pageNo <= pageLimit; pageNo += 1) {
    const result = await searchAuctionItems('', {
      categoryCode: part.code,
      itemTier: 4,
      itemGrade: '고대',
      itemGradeQuality,
      itemUpgradeLevel: 3,
      pageNo,
      sort: 'BUY_PRICE',
      sortCondition: 'ASC',
      etcOptions
    });
    const item = result?.Items?.find((candidate) => accessoryBuyPrice(candidate) > 0 && itemHasAccessoryOptions(candidate, requiredOptions));

    if (item) {
      return item;
    }

    if (!result?.Items?.length || pageNo * (result.PageSize ?? 10) >= (result.TotalCount ?? 0)) {
      break;
    }
  }

  return null;
}

function accessoryPresetLine(label, item) {
  if (!item) {
    return `${label}: -`;
  }

  return `${label}: ${formatPlainGold(accessoryBuyPrice(item))}`;
}

function accessoryDetailLine(label, item) {
  if (!item) {
    return `${label}: -`;
  }

  const stat = item.Options?.find((option) => ['힘', '민첩', '지능'].includes(option.OptionName))?.Value;
  return [`${label}: ${formatPlainGold(accessoryBuyPrice(item))}`, `품: ${item.GradeQuality ?? '-'}${stat ? ` / 힘민지: ${stat}` : ''}`].join('\n');
}

async function buildTopSingleAccessoryDescription() {
  const lines = ['▌상단일 악세 최저가 시세', '▌기준: 고대, 3연마, 품67▲', ''];

  for (const part of ACCESSORY_PARTS) {
    lines.push(`▌${part.name}`);

    for (const option of part.singles) {
      const item = await findAccessoryPresetItem(part, [{ ...option, value: option.high }]);
      lines.push(accessoryPresetLine(option.label, item));
    }

    lines.push('');
  }

  return compactLines(lines, 3900);
}

async function buildTopMidQualityAccessoryDescription() {
  const lines = ['▌상중 악세 최저가 시세', '▌기준: 고대, 3연마, 품90▲', ''];

  for (const part of ACCESSORY_PARTS) {
    lines.push(`▌${part.name}`);

    for (const [highLabel, midLabel] of part.midCombos) {
      const high = optionByLabel(part, highLabel);
      const mid = optionByLabel(part, midLabel);
      const item = await findAccessoryPresetItem(
        part,
        [
          { ...high, value: high.high },
          { ...mid, value: mid.mid }
        ],
        { itemGradeQuality: 90 }
      );
      lines.push(accessoryDetailLine(`${high.label} + ${mid.label}`, item));
      lines.push('');
    }
  }

  return compactLines(lines, 3900);
}

async function buildTripleTopAccessoryDescription() {
  const lines = ['▌상상상 악세 최저가 시세', '▌기준: 고대, 3연마, 품67▲', ''];

  for (const part of ACCESSORY_PARTS) {
    lines.push(`▌${part.name}`);

    for (const labels of part.tripleCombos) {
      const options = labels.map((label) => optionByLabel(part, label));
      const item = await findAccessoryPresetItem(
        part,
        options.map((option) => ({ ...option, value: option.high }))
      );
      lines.push(accessoryPresetLine(labels.join(' + '), item));
    }

    lines.push('');
  }

  return compactLines(lines, 3900);
}

async function refreshAccessoryPriceCacheEntry(key, builder) {
  const entry = accessoryPriceCache[key];

  if (entry.refreshing) {
    return;
  }

  entry.refreshing = true;
  entry.error = null;

  try {
    entry.description = await builder();
    entry.refreshedAt = Date.now();
    console.log(`Accessory price cache refreshed: ${key}`);
  } catch (error) {
    entry.error = error;
    console.error(`Accessory price cache refresh failed: ${key}`);
    console.error(error);
  } finally {
    entry.refreshing = false;
  }
}

async function refreshAccessoryPriceCache() {
  await refreshAccessoryPriceCacheEntry('topSingle', buildTopSingleAccessoryDescription);
  await refreshAccessoryPriceCacheEntry('topMidQuality', buildTopMidQualityAccessoryDescription);
  await refreshAccessoryPriceCacheEntry('tripleTop', buildTripleTopAccessoryDescription);
}

function accessoryCacheDescription(key) {
  const entry = accessoryPriceCache[key];

  if (!entry.description) {
    return null;
  }

  return `${entry.description}\n\nData: Lost Ark OpenAPI · ${cacheTimeLabel(entry.refreshedAt)} 갱신`;
}

async function replyAccessoryCache(interaction, key, title) {
  const description = accessoryCacheDescription(key);

  if (!description) {
    const entry = accessoryPriceCache[key];
    const suffix = entry.refreshing ? '현재 시세를 수집하는 중입니다.' : '아직 시세 캐시가 준비되지 않았습니다.';
    await interaction.editReply(`${suffix} 잠시 후 다시 시도해 주세요.`);
    return;
  }

  await interaction.editReply({
    embeds: [createPriceEmbed(title, description)]
  });
}

export function startAccessoryPriceCache() {
  if (accessoryPriceCacheStarted) {
    return;
  }

  accessoryPriceCacheStarted = true;
  console.log('Accessory price cache enabled.');

  setTimeout(() => {
    refreshAccessoryPriceCache().catch((error) => {
      console.error('Accessory price cache initial refresh failed.');
      console.error(error);
    });
  }, ACCESSORY_PRICE_CACHE_START_DELAY_MS);

  setInterval(() => {
    refreshAccessoryPriceCache().catch((error) => {
      console.error('Accessory price cache refresh failed.');
      console.error(error);
    });
  }, ACCESSORY_PRICE_CACHE_REFRESH_MS);
}

function statValue(stats, type) {
  return stats?.find((stat) => stat.Type === type)?.Value ?? '-';
}

function apiKeyHelp() {
  return '로스트아크 API 키가 설정되지 않았습니다. `.env`에 `LOSTARK_API_KEY`를 추가해 주세요.';
}

function kstDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatKoreanDate(dateKey) {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${Number(match[2])}월 ${Number(match[3])}일` : dateKey;
}

function isValidDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function startDateKey(startTime) {
  return startTime.slice(0, 10);
}

function startTimeLabel(startTime) {
  return startTime.slice(11, 16);
}

function eventTimesForDate(item, dateKey) {
  return (item.StartTimes ?? []).filter((time) => startDateKey(time) === dateKey).map(startTimeLabel);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function rewardNames(item) {
  return unique(
    (item.RewardItems ?? [])
      .flatMap((reward) => reward.Items ?? [])
      .map((reward) => reward.Name)
  );
}

function compactRewardNames(item) {
  const names = rewardNames(item).filter((name) => !name.includes('경험치'));
  return names.slice(0, 4).join(', ') || '보상 정보 없음';
}

function contentLine(item, dateKey, { includeRewards = false } = {}) {
  const times = eventTimesForDate(item, dateKey);
  const timeText = times.length > 0 ? times.join(' / ') : '-';
  const rewardText = includeRewards ? `\n보상: ${compactRewardNames(item)}` : '';
  return `**${item.ContentsName}** (${timeText})${rewardText}`;
}

function eventsByCategoryForDate(calendar, categoryName, dateKey) {
  return calendar.filter((item) => item.CategoryName === categoryName && eventTimesForDate(item, dateKey).length > 0);
}

function nextAvailableDate(calendar, categories, preferredDateKey) {
  const dates = unique(
    calendar
      .filter((item) => categories.includes(item.CategoryName))
      .flatMap((item) => item.StartTimes ?? [])
      .map(startDateKey)
  ).sort();

  return dates.find((date) => date >= preferredDateKey) ?? dates[0] ?? preferredDateKey;
}

function truncateField(value) {
  return value.length > 1024 ? `${value.slice(0, 1000)}...` : value;
}

function compactLines(lines, maxLength = 1000) {
  const selected = [];
  let length = 0;

  for (const line of lines) {
    const nextLength = length + line.length + (selected.length > 0 ? 1 : 0);
    if (nextLength > maxLength) {
      selected.push(`외 ${lines.length - selected.length}개`);
      break;
    }

    selected.push(line);
    length = nextLength;
  }

  return selected.join('\n');
}

function compactChaosGateLine(items, dateKey) {
  if (items.length === 0) {
    return '일정 없음';
  }

  const times = unique(items.flatMap((item) => eventTimesForDate(item, dateKey)));
  const regions = items
    .map((item) => item.ContentsName.match(/\(([^)]+)\)/)?.[1] ?? item.Location ?? item.ContentsName)
    .slice(0, 14);

  return [`시간: ${times.join(' / ')}`, `지역: ${regions.join(', ')}${items.length > regions.length ? ` 외 ${items.length - regions.length}곳` : ''}`].join('\n');
}

async function runLostarkCommand(interaction, handler) {
  await interaction.deferReply();

  try {
    await handler();
  } catch (error) {
    if (error instanceof LostarkApiError && error.message.includes('LOSTARK_API_KEY')) {
      await interaction.editReply(apiKeyHelp());
      return;
    }

    console.error(error);
    await interaction.editReply(error instanceof LostarkApiError ? error.message : '명령을 처리하는 중 오류가 발생했습니다.');
  }
}

export const goldCommand = {
  data: new SlashCommandBuilder()
    .setName('경매')
    .setDescription('입력한 골드 기준으로 경매 분배 입찰가를 계산합니다.')
    .addIntegerOption((option) =>
      option.setName('gold').setDescription('계산할 골드').setRequired(true).setMinValue(1)
    ),

  async execute(interaction) {
    const gold = interaction.options.getInteger('gold', true);
    await interaction.reply({ embeds: [createAuctionEmbed('경매 분배금 계산기', gold)] });
  }
};

export const engravingBookCommand = {
  data: new SlashCommandBuilder()
    .setName('전각')
    .setDescription('전설 각인서 최저가 기준으로 경매 분배 입찰가를 계산합니다.')
    .addStringOption((option) =>
      option.setName('item').setDescription('전설 각인서 이름').setRequired(true).setMaxLength(50)
    ),

  async execute(interaction) {
    const itemName = interaction.options.getString('item', true);

    await runLostarkCommand(interaction, async () => {
      const result = await searchMarketItems(itemName);
      const item = result?.Items?.at(-1);

      if (!item) {
        await interaction.editReply('존재하지 않는 아이템입니다. 정식 각인서 이름으로 다시 검색해 주세요.');
        return;
      }

      const embed = createAuctionEmbed('전각 분배금 계산기', item.RecentPrice, item.Icon)
        .setDescription(item.Name)
        .addFields({
          name: '경매장 최근 거래가',
          value: formatGold(item.RecentPrice),
          inline: false
        });

      await interaction.editReply({ embeds: [embed] });
    });
  }
};

export const bookPriceCommand = {
  data: new SlashCommandBuilder()
    .setName('책값')
    .setDescription('각인서 현재 최저가와 최근 거래가를 조회합니다.')
    .addStringOption((option) =>
      option.setName('item').setDescription('각인서 이름 예: 원한, 예리한 둔기').setRequired(true).setMaxLength(50)
    )
    .addStringOption((option) =>
      option
        .setName('grade')
        .setDescription('각인서 등급')
        .setRequired(false)
        .addChoices(
          { name: '유물', value: '유물' },
          { name: '전설', value: '전설' },
          { name: '영웅', value: '영웅' }
        )
    ),

  async execute(interaction) {
    const itemName = interaction.options.getString('item', true);
    const grade = interaction.options.getString('grade') ?? '유물';

    await runLostarkCommand(interaction, async () => {
      const result = await searchMarketItems(itemName, {
        itemGrade: grade,
        sort: 'CURRENT_MIN_PRICE',
        sortCondition: 'ASC'
      });
      const items = result?.Items ?? [];
      const exactName = `${grade} ${itemName} 각인서`;
      const item =
        items.find((candidate) => candidate.Name === exactName) ??
        items.find((candidate) => candidate.Name?.includes(itemName) && candidate.Grade === grade) ??
        items[0];

      if (!item) {
        await interaction.editReply('각인서를 찾지 못했습니다. 예: `/책값 item:원한 grade:유물`');
        return;
      }

      await interaction.editReply({
        embeds: [createPriceEmbed('각인서 시세', marketPriceLine(item), item.Icon)]
      });
    });
  }
};

export const expensiveRelicBooksCommand = {
  data: new SlashCommandBuilder()
    .setName('비싼유각')
    .setDescription('현재 최저가 기준으로 비싼 유물 각인서를 보여줍니다.'),

  async execute(interaction) {
    await runLostarkCommand(interaction, async () => {
      const result = await searchMarketItems('', {
        itemGrade: '유물',
        sort: 'CURRENT_MIN_PRICE',
        sortCondition: 'DESC'
      });
      const items = result?.Items ?? [];

      if (items.length === 0) {
        await interaction.editReply('유물 각인서 시세를 찾지 못했습니다.');
        return;
      }

      const description = items
        .slice(0, 10)
        .map((item, index) => `${index + 1}. ${marketPriceLine(item)}`)
        .join('\n\n');

      await interaction.editReply({
        embeds: [createPriceEmbed('비싼 유물 각인서 TOP 10', description, items[0]?.Icon)]
      });
    });
  }
};

export const gemLowestPriceCommand = {
  data: new SlashCommandBuilder()
    .setName('보석최저가')
    .setDescription('보석 최저 즉시구매가를 조회합니다.')
    .addIntegerOption((option) =>
      option.setName('level').setDescription('보석 레벨').setRequired(true).setMinValue(1).setMaxValue(10)
    )
    .addStringOption((option) =>
      option
        .setName('kind')
        .setDescription('보석 종류')
        .setRequired(true)
        .addChoices(
          { name: '겁화', value: '겁화' },
          { name: '작열', value: '작열' },
          { name: '멸화', value: '멸화' },
          { name: '홍염', value: '홍염' }
        )
    )
    .addIntegerOption((option) =>
      option.setName('tier').setDescription('티어, 비우면 4티어').setRequired(false).setMinValue(3).setMaxValue(4)
    ),

  async execute(interaction) {
    const level = interaction.options.getInteger('level', true);
    const kind = interaction.options.getString('kind', true);
    const tier = interaction.options.getInteger('tier') ?? 4;
    const name = gemItemName(level, kind);

    await runLostarkCommand(interaction, async () => {
      const result = await searchAuctionItems(name, {
        itemTier: tier,
        sort: 'BUY_PRICE',
        sortCondition: 'ASC'
      });
      const item = result?.Items?.find((candidate) => candidate.Name?.includes(name)) ?? result?.Items?.[0];

      if (!item) {
        await interaction.editReply('보석 매물을 찾지 못했습니다. 레벨/종류/티어를 다시 확인해 주세요.');
        return;
      }

      const price = gemBuyPrice(item);
      const description = [`**${item.Name}**`, `티어: ${item.Tier ?? tier}`, `최저 즉시구매가: ${formatGold(price)}`].join('\n');

      await interaction.editReply({
        embeds: [createPriceEmbed('보석 최저가', description, item.Icon)]
      });
    });
  }
};

export const gemPriceCommand = {
  data: new SlashCommandBuilder()
    .setName('보석값')
    .setDescription('7~10레벨 겁화/작열 보석 최저가를 한 번에 조회합니다.'),

  async execute(interaction) {
    await runLostarkCommand(interaction, async () => {
      const rows = [];

      for (const level of [10, 9, 8, 7]) {
        for (const [label, kind] of [
          ['겁', '겁화'],
          ['작', '작열']
        ]) {
          const result = await searchAuctionItems(gemItemName(level, kind), {
            itemTier: 4,
            sort: 'BUY_PRICE',
            sortCondition: 'ASC'
          });
          const item = result?.Items?.[0];
          rows.push(`${level}${label}: ${item ? formatPlainGold(gemBuyPrice(item)) : '-'}`);
        }

        if (level !== 7) {
          rows.push('');
        }
      }

      await interaction.editReply({
        embeds: [createPriceEmbed('보석 최저가', rows.join('\n'))]
      });
    });
  }
};

export const arkGridGemPriceCommand = {
  data: new SlashCommandBuilder()
    .setName('젬값')
    .setDescription('질서/혼돈의 젬 최저가를 조회합니다.'),

  async execute(interaction) {
    await runLostarkCommand(interaction, async () => {
      const orderItems = [
        ['불변', '질서의 젬 : 불변'],
        ['견고', '질서의 젬 : 견고'],
        ['안정', '질서의 젬 : 안정']
      ];
      const chaosItems = [
        ['왜곡', '혼돈의 젬 : 왜곡'],
        ['붕괴', '혼돈의 젬 : 붕괴'],
        ['침식', '혼돈의 젬 : 침식']
      ];

      const formatGroup = async (items) => {
        const rareLines = [];
        const heroicLines = [];

        for (const [label, itemName] of items) {
          const prices = await arkGridGemPrices(itemName);
          const rare = itemByGrade(prices, '희귀');
          const heroic = itemByGrade(prices, '영웅');

          rareLines.push(`[희귀] ${label}: ${rare ? formatPlainGold(rare.CurrentMinPrice) : '-'}`);
          heroicLines.push(`[영웅] ${label}: ${heroic ? formatPlainGold(heroic.CurrentMinPrice) : '-'}`);
        }

        return [...rareLines, '', ...heroicLines].join('\n');
      };

      const description = [
        '젬값 최저가 정보',
        '',
        '▌질서의 젬',
        await formatGroup(orderItems),
        '',
        '▌혼돈의 젬',
        await formatGroup(chaosItems)
      ].join('\n');

      await interaction.editReply({
        embeds: [createPriceEmbed('젬값', description)]
      });
    });
  }
};

export const topSingleAccessoryCommand = {
  data: new SlashCommandBuilder()
    .setName('상단일')
    .setDescription('고대 4티어 악세 상옵 단일 최저가를 조회합니다.'),

  async execute(interaction) {
    await runLostarkCommand(interaction, async () => {
      await replyAccessoryCache(interaction, 'topSingle', '상단일 악세 최저가 시세');
    });
  }
};

export const topMidQualityAccessoryCommand = {
  data: new SlashCommandBuilder()
    .setName('상중90')
    .setDescription('품질 90 이상 고대 4티어 악세 상+중 최저가를 조회합니다.'),

  async execute(interaction) {
    await runLostarkCommand(interaction, async () => {
      await replyAccessoryCache(interaction, 'topMidQuality', '상중90 악세 최저가 시세');
    });
  }
};

export const tripleTopAccessoryCommand = {
  data: new SlashCommandBuilder()
    .setName('상상상')
    .setDescription('고대 4티어 악세 상옵 3개 최저가를 조회합니다.'),

  async execute(interaction) {
    await runLostarkCommand(interaction, async () => {
      await replyAccessoryCache(interaction, 'tripleTop', '상상상 악세 최저가 시세');
    });
  }
};

export const characterInfoCommand = {
  data: new SlashCommandBuilder()
    .setName('정보')
    .setDescription('로스트아크 캐릭터 기본 정보를 조회합니다.')
    .addStringOption((option) =>
      option.setName('character').setDescription('캐릭터 이름').setRequired(true).setMaxLength(20)
    ),

  async execute(interaction) {
    const characterName = interaction.options.getString('character', true);

    await runLostarkCommand(interaction, async () => {
      const [profile, equipment, engravings, gems, cards] = await Promise.all([
        getCharacterProfile(characterName),
        getCharacterEquipment(characterName),
        getCharacterEngravings(characterName),
        getCharacterGems(characterName),
        getCharacterCards(characterName)
      ]);

      if (!profile) {
        await interaction.editReply('존재하지 않는 캐릭터입니다.');
        return;
      }

      const image = await renderCharacterCard({ profile, equipment, engravings, gems, cards });
      const attachment = new AttachmentBuilder(image, {
        name: `${profile.CharacterName ?? characterName}.png`
      });

      await interaction.editReply({ files: [attachment] });
    });
  }
};

export const siblingsCommand = {
  data: new SlashCommandBuilder()
    .setName('배럭')
    .setDescription('계정 내 캐릭터 목록을 아이템 레벨 순으로 보여줍니다.')
    .addStringOption((option) =>
      option.setName('character').setDescription('캐릭터 이름').setRequired(true).setMaxLength(20)
    ),

  async execute(interaction) {
    const characterName = interaction.options.getString('character', true);

    await runLostarkCommand(interaction, async () => {
      const siblings = await getCharacterSiblings(characterName);

      if (!siblings?.length) {
        await interaction.editReply('존재하지 않는 캐릭터이거나 배럭 정보를 찾을 수 없습니다.');
        return;
      }

      const sorted = siblings
        .toSorted((a, b) => Number.parseFloat(String(b.ItemMaxLevel).replaceAll(',', '')) - Number.parseFloat(String(a.ItemMaxLevel).replaceAll(',', '')))
        .slice(0, 6);

      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle(`배럭 목록 - ${characterName}`)
        .setDescription(sorted.map((item) => `**${item.CharacterName}** | ${item.CharacterClassName} | ${item.ItemMaxLevel}`).join('\n'));

      await interaction.editReply({ embeds: [embed] });
    });
  }
};

function equipmentLine(item) {
  return `**${item.Type}** | ${item.Grade ?? '-'} | ${item.Name ?? '-'}`;
}

export const equipmentCommand = {
  data: new SlashCommandBuilder()
    .setName('장비')
    .setDescription('캐릭터 착용 장비를 조회합니다.')
    .addStringOption((option) =>
      option.setName('character').setDescription('캐릭터 이름').setRequired(true).setMaxLength(20)
    ),

  async execute(interaction) {
    const characterName = interaction.options.getString('character', true);

    await runLostarkCommand(interaction, async () => {
      const equipment = await getCharacterEquipment(characterName);
      const gearTypes = new Set(['무기', '투구', '상의', '하의', '장갑', '어깨']);
      const items = equipment?.filter((item) => gearTypes.has(item.Type)) ?? [];

      if (items.length === 0) {
        await interaction.editReply('착용 장비 정보를 찾을 수 없습니다.');
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x95a5a6)
        .setTitle(`착용 장비 - ${characterName}`)
        .setDescription(items.map(equipmentLine).join('\n'));

      await interaction.editReply({ embeds: [embed] });
    });
  }
};

export const accessoryCommand = {
  data: new SlashCommandBuilder()
    .setName('악세')
    .setDescription('캐릭터 착용 악세서리를 조회합니다.')
    .addStringOption((option) =>
      option.setName('character').setDescription('캐릭터 이름').setRequired(true).setMaxLength(20)
    ),

  async execute(interaction) {
    const characterName = interaction.options.getString('character', true);

    await runLostarkCommand(interaction, async () => {
      const equipment = await getCharacterEquipment(characterName);
      const accessoryTypes = new Set(['목걸이', '귀걸이', '반지', '어빌리티 스톤', '팔찌']);
      const items = equipment?.filter((item) => accessoryTypes.has(item.Type)) ?? [];

      if (items.length === 0) {
        await interaction.editReply('착용 악세서리 정보를 찾을 수 없습니다.');
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0xe91e63)
        .setTitle(`착용 악세서리 - ${characterName}`)
        .setDescription(items.map(equipmentLine).join('\n'));

      await interaction.editReply({ embeds: [embed] });
    });
  }
};

export const engravingsCommand = {
  data: new SlashCommandBuilder()
    .setName('각인')
    .setDescription('캐릭터 장착 각인을 조회합니다.')
    .addStringOption((option) =>
      option.setName('character').setDescription('캐릭터 이름').setRequired(true).setMaxLength(20)
    ),

  async execute(interaction) {
    const characterName = interaction.options.getString('character', true);

    await runLostarkCommand(interaction, async () => {
      const result = await getCharacterEngravings(characterName);
      const effects = [...(result?.Effects ?? []), ...(result?.ArkPassiveEffects ?? [])];

      if (effects.length === 0) {
        await interaction.editReply('장착 각인 정보를 찾을 수 없습니다.');
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle(`장착 각인 - ${characterName}`)
        .setDescription(effects.map((effect) => effect.Name).join('\n'));

      await interaction.editReply({ embeds: [embed] });
    });
  }
};

export const gemsCommand = {
  data: new SlashCommandBuilder()
    .setName('보석')
    .setDescription('캐릭터 장착 보석을 조회합니다.')
    .addStringOption((option) =>
      option.setName('character').setDescription('캐릭터 이름').setRequired(true).setMaxLength(20)
    ),

  async execute(interaction) {
    const characterName = interaction.options.getString('character', true);

    await runLostarkCommand(interaction, async () => {
      const result = await getCharacterGems(characterName);
      const gems = result?.Gems ?? [];

      if (gems.length === 0) {
        await interaction.editReply('장착 보석 정보를 찾을 수 없습니다.');
        return;
      }

      const description = gems
        .slice(0, 20)
        .map((gem) => `**${gem.Name}**${gem.Level ? ` Lv.${gem.Level}` : ''}`)
        .join('\n');

      const embed = new EmbedBuilder()
        .setColor(0x1abc9c)
        .setTitle(`보석 정보 - ${characterName}`)
        .setDescription(description);

      await interaction.editReply({ embeds: [embed] });
    });
  }
};

export const cardsCommand = {
  data: new SlashCommandBuilder()
    .setName('카드')
    .setDescription('캐릭터 장착 카드 세트를 조회합니다.')
    .addStringOption((option) =>
      option.setName('character').setDescription('캐릭터 이름').setRequired(true).setMaxLength(20)
    ),

  async execute(interaction) {
    const characterName = interaction.options.getString('character', true);

    await runLostarkCommand(interaction, async () => {
      const result = await getCharacterCards(characterName);
      const cardEffects = result?.Effects?.flatMap((effect) => effect.Items ?? []) ?? [];

      if (cardEffects.length === 0) {
        await interaction.editReply('장착 카드 정보를 찾을 수 없습니다.');
        return;
      }

      const embed = new EmbedBuilder().setColor(0xe67e22).setTitle(`${characterName} 카드 세트`);

      for (const item of cardEffects.slice(0, 10)) {
        embed.addFields({
          name: item.Name ?? '카드 세트',
          value: item.Description ?? '-',
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed] });
    });
  }
};

export const weeklyContentsCommand = {
  data: new SlashCommandBuilder()
    .setName('주간컨텐츠')
    .setDescription('이번 주 도전 어비스 던전과 도전 가디언 토벌 정보를 조회합니다.'),

  async execute(interaction) {
    await interaction.reply({
      content: '현재 Lost Ark Open API에서 도전 어비스/가디언 주간 컨텐츠 endpoint가 제공되지 않아 이 명령은 사용할 수 없습니다.',
      ephemeral: true
    });
  }
};

export const scheduleCommand = {
  data: new SlashCommandBuilder()
    .setName('일정')
    .setDescription('필드보스, 카오스게이트, 모험섬, 항해 협동 일정을 조회합니다.')
    .addStringOption((option) =>
      option
        .setName('date')
        .setDescription('조회 날짜: YYYY-MM-DD, 비우면 오늘')
        .setRequired(false)
        .setMaxLength(10)
    ),

  async execute(interaction) {
    const inputDate = interaction.options.getString('date');

    if (inputDate && !isValidDateKey(inputDate)) {
      await interaction.reply({
        content: '날짜는 `YYYY-MM-DD` 형식으로 입력해 주세요. 예: `2026-07-12`',
        ephemeral: true
      });
      return;
    }

    await runLostarkCommand(interaction, async () => {
      const calendar = await getGameContentsCalendar();
      const targetDateKey = inputDate ?? kstDateKey();
      const image = await renderScheduleCard(calendar, targetDateKey);
      const attachment = new AttachmentBuilder(image, {
        name: `lostark-schedule-${targetDateKey}.png`
      });

      await interaction.editReply({ files: [attachment] });
    });
  }
};

export const lostarkCommands = [
  goldCommand,
  bookPriceCommand,
  gemPriceCommand,
  arkGridGemPriceCommand,
  topSingleAccessoryCommand,
  topMidQualityAccessoryCommand,
  tripleTopAccessoryCommand,
  characterInfoCommand,
  scheduleCommand
];
