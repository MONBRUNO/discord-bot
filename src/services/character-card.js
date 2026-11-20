import sharp from 'sharp';

const WIDTH = 1200;
const HEIGHT = 1080;

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function text(value, x, y, options = {}) {
  const { size = 22, weight = 500, fill = '#f4f6fb', anchor = 'start', opacity = 1 } = options;
  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" opacity="${opacity}">${escapeXml(value)}</text>`;
}

function rect(x, y, width, height, options = {}) {
  const { fill = '#151821', stroke = '#2a2f3d', radius = 14, opacity = 1 } = options;
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" opacity="${opacity}" />`;
}

function image(href, x, y, width, height, options = {}) {
  if (!href) {
    return rect(x, y, width, height, { fill: '#252b36', stroke: 'none', radius: 10 });
  }

  const { opacity = 1 } = options;
  return `<image href="${href}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" opacity="${opacity}" />`;
}

function stat(profile, type) {
  return profile.Stats?.find((item) => item.Type === type)?.Value ?? '-';
}

function cleanItemName(name) {
  return String(name ?? '-').replace(/^.*?]\s*/, '').slice(0, 24);
}

function itemTypeLabel(type) {
  return type === '어빌리티 스톤' ? '어빌돌' : type;
}

function itemsByType(equipment = [], types) {
  return types.map((type) => equipment.find((item) => item.Type === type)).filter(Boolean);
}

function equipmentSummary(equipment = []) {
  return itemsByType(equipment, ['무기', '투구', '상의', '하의', '장갑', '어깨']);
}

function accessorySummary(equipment = []) {
  const types = new Set(['목걸이', '귀걸이', '반지', '어빌리티 스톤', '팔찌']);
  return equipment.filter((item) => types.has(item.Type));
}

function engravingSummary(engravings) {
  const effects = [...(engravings?.Effects ?? []), ...(engravings?.ArkPassiveEffects ?? [])];
  return effects.slice(0, 8).map((item) => {
    const level = item.Level ? ` Lv.${item.Level}` : '';
    return `${item.Name}${level}`;
  });
}

function gemSummary(gems) {
  return (gems?.Gems ?? [])
    .slice()
    .sort((a, b) => (b.Level ?? 0) - (a.Level ?? 0))
    .slice(0, 11)
    .map((item) => {
      const type = item.Name?.includes('홍염') ? '홍염' : item.Name?.includes('멸화') ? '멸화' : '보석';
      return `Lv.${item.Level ?? '?'} ${type}`;
    });
}

function cardSummary(cards) {
  return (cards?.Effects ?? [])
    .flatMap((effect) => effect.Items ?? [])
    .slice(0, 4)
    .map((item) => item.Name);
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

    const contentType = response.headers.get('content-type') ?? 'image/jpeg';
    const buffer = Buffer.from(await response.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

function renderList(items, x, startY, options = {}) {
  const { gap = 29, size = 19, fill = '#d8deea', bullet = '' } = options;
  return items.map((item, index) => text(`${bullet}${item}`, x, startY + index * gap, { size, fill })).join('');
}

function renderItemRows(items, x, startY, width, options = {}) {
  const { gap = 54, iconDataUris = [] } = options;

  return items
    .map((item, index) => {
      const y = startY + index * gap;
      const icon = iconDataUris[index];

      return `
        ${rect(x, y - 36, width, 46, { fill: '#10131a', stroke: '#2d3342', radius: 10 })}
        <clipPath id="item-${x}-${y}"><rect x="${x + 12}" y="${y - 28}" width="32" height="32" rx="6"/></clipPath>
        <g clip-path="url(#item-${x}-${y})">${image(icon, x + 12, y - 28, 32, 32)}</g>
        ${text(itemTypeLabel(item.Type), x + 58, y - 7, { size: 17, fill: '#f0c86a', weight: 800 })}
        ${text(cleanItemName(item.Name), x + 124, y - 7, { size: 17 })}
        ${text(item.Quality != null ? `품질 ${item.Quality}` : item.Grade ?? '-', x + width - 16, y - 7, {
          size: 16,
          fill: '#aeb7c8',
          anchor: 'end'
        })}
      `;
    })
    .join('');
}

export async function renderCharacterCard({ profile, equipment, engravings, gems, cards }) {
  const gear = equipmentSummary(equipment);
  const accessories = accessorySummary(equipment);
  const engraveLines = engravingSummary(engravings);
  const gemLines = gemSummary(gems);
  const cardLines = cardSummary(cards);

  const [characterImage, ...itemIcons] = await Promise.all([
    imageDataUri(profile.CharacterImage),
    ...[...gear, ...accessories].map((item) => imageDataUri(item.Icon))
  ]);

  const gearIcons = itemIcons.slice(0, gear.length);
  const accessoryIcons = itemIcons.slice(gear.length);

  const bgImage = characterImage
    ? `<image href="${characterImage}" x="460" y="118" width="520" height="760" preserveAspectRatio="xMidYMid slice" opacity="0.32" />`
    : '';

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <defs>
      <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stop-color="#06080d"/>
        <stop offset="0.54" stop-color="#111522"/>
        <stop offset="1" stop-color="#070b12"/>
      </linearGradient>
      <linearGradient id="panel" x1="0" x2="1">
        <stop offset="0" stop-color="#11151f" stop-opacity="0.98"/>
        <stop offset="1" stop-color="#191d29" stop-opacity="0.9"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#000" flood-opacity="0.45"/>
      </filter>
    </defs>
    <style>
      text { font-family: "Apple SD Gothic Neo", "Noto Sans CJK KR", "Noto Sans KR", Arial, sans-serif; letter-spacing: 0; }
    </style>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)" />
    ${bgImage}
    <rect width="${WIDTH}" height="${HEIGHT}" fill="#06080d" opacity="0.38" />
    <g filter="url(#shadow)">
      ${rect(34, 34, 1132, 1012, { fill: 'url(#panel)', stroke: '#303747', radius: 24 })}
    </g>

    ${text(profile.CharacterName ?? '', 66, 96, { size: 42, weight: 900 })}
    ${text(`${profile.ServerName ?? '-'} | ${profile.CharacterClassName ?? '-'}`, 68, 136, { size: 22, fill: '#bfc8d8' })}
    ${text(profile.GuildName ? `길드 ${profile.GuildName}` : '길드 없음', 68, 168, { size: 20, fill: '#8f9bae' })}

    ${rect(650, 70, 430, 116, { fill: '#0c1018', stroke: '#303747', radius: 16, opacity: 0.9 })}
    ${text('아이템 Lv', 678, 112, { size: 20, fill: '#aeb7c8' })}
    ${text(profile.ItemAvgLevel ?? '-', 1046, 112, { size: 25, weight: 900, fill: '#ffffff', anchor: 'end' })}
    ${text('전투 Lv', 678, 152, { size: 20, fill: '#aeb7c8' })}
    ${text(profile.CharacterLevel ?? '-', 1046, 152, { size: 25, weight: 900, fill: '#ffffff', anchor: 'end' })}

    ${text('장비', 66, 220, { size: 26, weight: 900, fill: '#f2d17b' })}
    ${renderItemRows(gear, 60, 268, 470, { iconDataUris: gearIcons }) || text('장착 장비 정보 없음', 82, 246, { size: 22, fill: '#aeb7c8' })}

    ${text('악세서리', 66, 620, { size: 26, weight: 900, fill: '#f2d17b' })}
    ${renderItemRows(accessories.slice(0, 7), 60, 668, 470, { gap: 48, iconDataUris: accessoryIcons })}

    ${rect(610, 218, 230, 190, { fill: '#0c1018', stroke: '#303747', radius: 16, opacity: 0.9 })}
    ${text('특성', 634, 256, { size: 24, weight: 900, fill: '#f2d17b' })}
    ${text(`치명 ${stat(profile, '치명')}`, 636, 298, { size: 21 })}
    ${text(`특화 ${stat(profile, '특화')}`, 636, 334, { size: 21 })}
    ${text(`신속 ${stat(profile, '신속')}`, 636, 370, { size: 21 })}

    ${rect(866, 218, 230, 190, { fill: '#0c1018', stroke: '#303747', radius: 16, opacity: 0.9 })}
    ${text('전투', 890, 256, { size: 24, weight: 900, fill: '#f2d17b' })}
    ${text(`공격력 ${stat(profile, '공격력')}`, 892, 298, { size: 21 })}
    ${text(`생명력 ${stat(profile, '최대 생명력')}`, 892, 334, { size: 21 })}
    ${text(`원정대 Lv.${profile.ExpeditionLevel ?? '-'}`, 892, 370, { size: 21 })}

    ${rect(610, 440, 230, 330, { fill: '#0c1018', stroke: '#303747', radius: 16, opacity: 0.9 })}
    ${text('각인', 634, 478, { size: 24, weight: 900, fill: '#f2d17b' })}
    ${renderList(engraveLines.length ? engraveLines : ['정보 없음'], 636, 516, { gap: 28, size: 18 })}

    ${rect(866, 440, 230, 330, { fill: '#0c1018', stroke: '#303747', radius: 16, opacity: 0.9 })}
    ${text('보석', 890, 478, { size: 24, weight: 900, fill: '#f2d17b' })}
    ${renderList(gemLines.length ? gemLines : ['보석 정보 없음'], 892, 516, { gap: 24, size: 17 })}

    ${rect(610, 800, 486, 150, { fill: '#0c1018', stroke: '#303747', radius: 16, opacity: 0.9 })}
    ${text('카드', 634, 840, { size: 24, weight: 900, fill: '#f2d17b' })}
    ${renderList(cardLines.length ? cardLines : ['카드 정보 없음'], 636, 878, { gap: 25, size: 18, fill: '#d8deea' })}

    ${text('OCEANII Bot', 66, 1012, { size: 24, weight: 900, fill: '#b9ff57' })}
    ${text(`Image created ${new Date().toISOString().slice(0, 10)}`, 66, 1038, { size: 15, fill: '#7b8496' })}
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
