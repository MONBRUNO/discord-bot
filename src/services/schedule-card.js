import sharp from 'sharp';

const WIDTH = 1080;
const HEIGHT = 1280;

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function text(value, x, y, options = {}) {
  const {
    size = 24,
    weight = 500,
    fill = '#f4f6fb',
    anchor = 'start',
    opacity = 1
  } = options;

  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" opacity="${opacity}">${escapeXml(value)}</text>`;
}

function rect(x, y, width, height, options = {}) {
  const {
    fill = '#171a22',
    stroke = '#333845',
    strokeWidth = 1,
    radius = 16,
    opacity = 1
  } = options;

  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" />`;
}

function image(href, x, y, width, height, options = {}) {
  if (!href) {
    return rect(x, y, width, height, { fill: '#262b36', stroke: 'none', radius: 10 });
  }

  const { opacity = 1 } = options;
  return `<image href="${href}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" opacity="${opacity}" />`;
}

function startDateKey(startTime) {
  return startTime.slice(0, 10);
}

function gameDateKey(startTime) {
  const match = startTime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):/);

  if (!match) {
    return startDateKey(startTime);
  }

  const [, year, month, day, hour] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  // Lost Ark daily schedule should roll over at 06:00, not midnight.
  if (Number(hour) < 6) {
    date.setUTCDate(date.getUTCDate() - 1);
  }

  return date.toISOString().slice(0, 10);
}

function rawStartTimeLabel(startTime) {
  return startTime.slice(11, 16);
}

function hourlyTimeLabel(startTime) {
  return `${startTime.slice(11, 13)}:00`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function eventTimesForDate(item, dateKey, { hourly = false } = {}) {
  const formatter = hourly ? hourlyTimeLabel : rawStartTimeLabel;
  return unique((item.StartTimes ?? []).filter((time) => gameDateKey(time) === dateKey).map(formatter));
}

function eventsByCategoryForDate(calendar, categoryName, dateKey) {
  return calendar.filter((item) => item.CategoryName === categoryName && eventTimesForDate(item, dateKey).length > 0);
}

function rewardAppliesToDate(reward, dateKey) {
  return !reward.StartTimes || reward.StartTimes.some((time) => gameDateKey(time) === dateKey);
}

function rewardNames(item, dateKey) {
  return unique(
    (item.RewardItems ?? [])
      .flatMap((reward) => reward.Items ?? [])
      .filter((reward) => rewardAppliesToDate(reward, dateKey))
      .map((reward) => reward.Name)
      .filter((name) => name && !name.includes('경험치'))
  );
}

function hasGoldReward(item, dateKey) {
  return rewardNames(item, dateKey).some((name) => name.includes('골드'));
}

function rewardLabels(item, dateKey) {
  return rewardNames(item, dateKey)
    .filter((name) => !name.includes('섬의 마음'))
    .slice(0, 3);
}

function rewardItems(item, dateKey) {
  return (item.RewardItems ?? [])
    .flatMap((reward) => reward.Items ?? [])
    .filter((reward) => rewardAppliesToDate(reward, dateKey))
    .filter((reward) => reward?.Name && !reward.Name.includes('경험치'));
}

function visibleRewardItems(item, dateKey) {
  const seen = new Set();

  return rewardItems(item, dateKey)
    .filter((reward) => {
      if (seen.has(reward.Name)) {
        return false;
      }

      seen.add(reward.Name);
      return true;
    })
    .slice(0, 6);
}

async function imageDataUri(url) {
  if (!url) {
    return null;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get('content-type') ?? 'image/png';
    const buffer = Buffer.from(await response.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

function formatKoreanDate(dateKey) {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${Number(match[2])}월 ${Number(match[3])}일` : dateKey;
}

function sectionTitle(title, x, y, color = '#f4f6fb') {
  return text(title, x, y, { size: 30, weight: 800, fill: color });
}

function timePills(times, x, y) {
  return times
    .slice(0, 5)
    .map((time, index) => {
      const pillX = x + index * 68;
      return [
        rect(pillX, y - 23, 58, 30, { fill: '#2a2e39', stroke: 'none', radius: 14 }),
        text(time, pillX + 29, y, { size: 18, anchor: 'middle', fill: '#f3f6ff' })
      ].join('');
    })
    .join('');
}

function rewardIconRow(rewardIconDataUris, x, y, size = 25) {
  return rewardIconDataUris
    .slice(0, 6)
    .map((icon, index) => {
      const iconX = x + index * (size + 10);
      return `<clipPath id="reward-${x}-${y}-${index}"><rect x="${iconX}" y="${y}" width="${size}" height="${size}" rx="6"/></clipPath>
        <g clip-path="url(#reward-${x}-${y}-${index})">${image(icon, iconX, y, size, size)}</g>`;
    })
    .join('');
}

function contentCard(item, dateKey, x, y, width, options = {}) {
  const { active = false, hourly = false, iconDataUri, rewardIconDataUris = [], goldIconDataUri } = options;
  const times = eventTimesForDate(item, dateKey, { hourly });
  const isGoldIsland = hasGoldReward(item, dateKey);
  const titleIconX = x + 104 + Math.min(item.ContentsName.length * 24, 250);

  return `
    ${rect(x, y, width, 120, {
      fill: isGoldIsland ? '#20232b' : '#191c23',
      stroke: isGoldIsland ? '#e1b640' : '#303541',
      strokeWidth: isGoldIsland ? 3 : 1,
      radius: 16
    })}
    <clipPath id="clip-${x}-${y}"><rect x="${x + 20}" y="${y + 20}" width="58" height="58" rx="10"/></clipPath>
    <g clip-path="url(#clip-${x}-${y})">${image(iconDataUri, x + 20, y + 20, 58, 58)}</g>
    ${text(item.ContentsName, x + 96, y + 43, { size: 25, weight: 700, fill: isGoldIsland ? '#ffd04d' : '#f4f6fb' })}
    ${
      isGoldIsland
        ? `<clipPath id="gold-title-${x}-${y}"><rect x="${titleIconX}" y="${y + 17}" width="26" height="26" rx="6"/></clipPath>
           <g clip-path="url(#gold-title-${x}-${y})">${image(goldIconDataUri, titleIconX, y + 17, 26, 26)}</g>`
        : ''
    }
    ${timePills(times, x + 96, y + 78)}
    ${rewardIconRow(rewardIconDataUris, x + 96, y + 91, 24)}
  `;
}

function bossCard(title, items, dateKey, x, y, width, options = {}) {
  const {
    iconDataUri,
    emptyText = '일정 없음',
    activeText = '매 시 정각 출현',
    activeColor = '#62d685',
    emptyColor = '#8f98aa'
  } = options;

  if (items.length === 0) {
    return `
      ${rect(x, y, width, 100, { fill: '#191c23', stroke: '#303541', radius: 16 })}
      <clipPath id="clip-empty-${x}-${y}"><rect x="${x + 22}" y="${y + 24}" width="54" height="54" rx="10"/></clipPath>
      <g clip-path="url(#clip-empty-${x}-${y})">${image(iconDataUri, x + 22, y + 24, 54, 54)}</g>
      ${text(title, x + 96, y + 42, { size: 26, weight: 800 })}
      ${text(emptyText, x + 96, y + 74, { size: 21, fill: emptyColor, weight: 700 })}
    `;
  }

  return `
    ${rect(x, y, width, 100, { fill: '#191c23', stroke: activeColor, strokeWidth: 3, radius: 16 })}
    <clipPath id="clip-${x}-${y}"><rect x="${x + 22}" y="${y + 24}" width="54" height="54" rx="10"/></clipPath>
    <g clip-path="url(#clip-${x}-${y})">${image(iconDataUri, x + 22, y + 24, 54, 54)}</g>
    ${text(title, x + 96, y + 42, { size: 26, weight: 800 })}
    ${text(activeText, x + 96, y + 74, { size: 21, fill: activeColor, weight: 700 })}
  `;
}

function sailingRows(items, dateKey, x, y, columnWidth) {
  return items
    .slice(0, 6)
    .map((item, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const cardX = x + col * (columnWidth + 18);
      const cardY = y + row * 62;
      const times = eventTimesForDate(item, dateKey);

      return `
        ${rect(cardX, cardY, columnWidth, 50, { fill: '#191c23', stroke: 'none', radius: 12 })}
        ${text('⚓', cardX + 20, cardY + 32, { size: 24 })}
        ${text(item.ContentsName.replace('항해 협동 : ', ''), cardX + 54, cardY + 32, { size: 22, weight: 700 })}
        ${text(times[0] ?? '-', cardX + columnWidth - 18, cardY + 32, { size: 19, anchor: 'end', fill: '#f4f6fb' })}
      `;
    })
    .join('');
}

function findRewardIcon(islands, dateKey, matcher) {
  return islands.flatMap((item) => rewardItems(item, dateKey)).find((item) => matcher(item.Name))?.Icon;
}

function rewardSummary(rows) {
  return rows
    .map(({ label, items, iconDataUri }, index) => {
      const y = 900 + index * 54;
      const value = items.length ? items.map((item) => item.ContentsName).join(' · ').slice(0, 46) : '-';
      const iconMarkup = iconDataUri
        ? `<clipPath id="summary-${index}"><rect x="50" y="${y - 26}" width="28" height="28" rx="7"/></clipPath>
           <g clip-path="url(#summary-${index})">${image(iconDataUri, 50, y - 26, 28, 28)}</g>`
        : '';

      return `
        ${iconMarkup}
        ${text(label, 92, y, { size: 23, weight: 700, fill: '#f4f6fb' })}
        ${rect(190, y - 28, Math.max(86, value.length * 13), 34, { fill: '#2a2e39', stroke: 'none', radius: 10 })}
        ${text(value, 206, y - 4, { size: 18, fill: '#bfc7d6' })}
      `;
    })
    .join('');
}

function rewardSummaryRows(islands, dateKey, iconDataUris = []) {
  const rows = [
    ['골드', (name) => name.includes('골드')],
    ['카드 팩', (name) => name.includes('카드')],
    ['주화', (name) => name.includes('주화')],
    ['실링', (name) => name.includes('실링')]
  ];

  return rows.map(([label, matcher], index) => ({
    label,
    items: islands.filter((item) => rewardNames(item, dateKey).some(matcher)),
    iconDataUri: iconDataUris[index]
  }));
}

export async function renderScheduleCard(calendar, dateKey) {
  const fieldBosses = eventsByCategoryForDate(calendar, '필드보스', dateKey);
  const chaosGates = eventsByCategoryForDate(calendar, '카오스게이트', dateKey);
  const adventureIslands = eventsByCategoryForDate(calendar, '모험 섬', dateKey);
  const fieldBossSource = fieldBosses[0] ?? calendar.find((item) => item.CategoryName === '필드보스');
  const chaosGateSource = chaosGates[0] ?? calendar.find((item) => item.CategoryName === '카오스게이트');

  const visibleIslands = adventureIslands.slice(0, 6);
  const rewardIconUrlsByIsland = visibleIslands.map((item) => visibleRewardItems(item, dateKey).map((reward) => reward.Icon));
  const summaryIconUrls = [
    findRewardIcon(adventureIslands, dateKey, (name) => name.includes('골드')),
    findRewardIcon(adventureIslands, dateKey, (name) => name.includes('카드')),
    findRewardIcon(adventureIslands, dateKey, (name) => name.includes('주화')),
    findRewardIcon(adventureIslands, dateKey, (name) => name.includes('실링'))
  ];
  const icons = await Promise.all(
    [fieldBossSource?.ContentsIcon, chaosGateSource?.ContentsIcon, ...visibleIslands.map((item) => item.ContentsIcon)]
      .concat(summaryIconUrls)
      .concat(rewardIconUrlsByIsland.flat())
      .map(imageDataUri)
  );

  const [fieldBossIcon, chaosGateIcon, ...islandIcons] = icons;
  const islandContentIcons = islandIcons.slice(0, visibleIslands.length);
  const summaryIconDataUris = islandIcons.slice(visibleIslands.length, visibleIslands.length + summaryIconUrls.length);
  const goldIconDataUri = summaryIconDataUris[0];
  const flatRewardIcons = islandIcons.slice(visibleIslands.length + summaryIconUrls.length);
  const rewardIconDataUrisByIsland = [];
  let rewardIconOffset = 0;

  for (const urls of rewardIconUrlsByIsland) {
    rewardIconDataUrisByIsland.push(flatRewardIcons.slice(rewardIconOffset, rewardIconOffset + urls.length));
    rewardIconOffset += urls.length;
  }

  const islandCards = visibleIslands
    .map((item, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      return contentCard(item, dateKey, 40 + col * 520, 330 + row * 150, 480, {
        iconDataUri: islandContentIcons[index],
        rewardIconDataUris: rewardIconDataUrisByIsland[index],
        goldIconDataUri
      });
    })
    .join('');

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <defs>
      <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stop-color="#080a0f"/>
        <stop offset="0.55" stop-color="#111520"/>
        <stop offset="1" stop-color="#07111d"/>
      </linearGradient>
      <linearGradient id="header" x1="0" x2="1">
        <stop offset="0" stop-color="#1d2028"/>
        <stop offset="1" stop-color="#242936"/>
      </linearGradient>
    </defs>
    <style>
      text { font-family: "Apple SD Gothic Neo", "Noto Sans CJK KR", "Noto Sans KR", Arial, sans-serif; letter-spacing: 0; }
    </style>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)" />
    ${rect(40, 40, 1000, 84, { fill: 'url(#header)', stroke: '#333846', radius: 20 })}
    ${text('로스트아크 일정', 64, 94, { size: 36, weight: 800 })}
    ${rect(870, 64, 136, 36, { fill: '#303541', stroke: 'none', radius: 18 })}
    ${text(formatKoreanDate(dateKey), 938, 90, { size: 24, weight: 700, anchor: 'middle' })}

    ${bossCard('필드보스', fieldBosses, dateKey, 40, 148, 480, {
      iconDataUri: fieldBossIcon,
      activeColor: '#62d685',
      emptyText: '일정 없음',
      emptyColor: '#8f98aa'
    })}
    ${bossCard('카오스게이트', chaosGates, dateKey, 560, 148, 480, {
      iconDataUri: chaosGateIcon,
      activeColor: '#5eb8ff'
    })}

    ${sectionTitle('모험 섬', 40, 300)}
    ${islandCards || text('오늘 모험 섬 일정 없음', 60, 380, { size: 24, fill: '#8f98aa' })}

    ${sectionTitle('주요 보상', 40, 860, '#ffca45')}
    ${rewardSummary(rewardSummaryRows(adventureIslands, dateKey, summaryIconDataUris))}

    ${text('OCEANII Bot', 40, 1230, { size: 30, weight: 900, fill: '#b9ff57' })}
    ${text('Data: Lost Ark OpenAPI', 1040, 1230, { size: 18, fill: '#788294', anchor: 'end' })}
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
