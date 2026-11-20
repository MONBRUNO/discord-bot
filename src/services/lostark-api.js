import { getConfig } from '../config.js';

const BASE_URL = 'https://developer-lostark.game.onstove.com';
const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_INTERVAL_MS = 450;
const RATE_LIMIT_RETRY_MS = 15 * 1000;
const MAX_RATE_LIMIT_RETRIES = 2;
const responseCache = new Map();
let lastRequestAt = 0;
let requestQueue = Promise.resolve();

export class LostarkApiError extends Error {
  constructor(message, { status } = {}) {
    super(message);
    this.name = 'LostarkApiError';
    this.status = status;
  }
}

function getAuthHeader() {
  const { lostarkApiKey } = getConfig();

  if (!lostarkApiKey) {
    throw new LostarkApiError('LOSTARK_API_KEY is not configured.');
  }

  return lostarkApiKey.toLowerCase().startsWith('bearer ')
    ? lostarkApiKey
    : `bearer ${lostarkApiKey}`;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function queuedFetch(url, options) {
  const run = requestQueue.then(async () => {
    const waitMs = Math.max(0, lastRequestAt + REQUEST_INTERVAL_MS - Date.now());

    if (waitMs > 0) {
      await sleep(waitMs);
    }

    lastRequestAt = Date.now();
    return fetch(url, options);
  });

  requestQueue = run.catch(() => {});
  return run;
}

async function request(path, { method = 'GET', body } = {}) {
  const cacheKey = `${method}:${path}:${body ? JSON.stringify(body) : ''}`;
  const cached = responseCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  let response;

  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    response = await queuedFetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        authorization: getAuthHeader(),
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (response.status !== 429 || attempt === MAX_RATE_LIMIT_RETRIES) {
      break;
    }

    const retryAfter = Number(response.headers.get('retry-after'));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : RATE_LIMIT_RETRY_MS);
  }

  if (response.status === 404) {
    return null;
  }

  if (response.status === 429) {
    throw new LostarkApiError('로스트아크 API 요청 제한에 도달했습니다. 잠시 후 다시 시도해 주세요.', {
      status: response.status
    });
  }

  if (!response.ok) {
    throw new LostarkApiError(`로스트아크 API 요청에 실패했습니다. (${response.status})`, {
      status: response.status
    });
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (!contentType.includes('application/json')) {
    throw new LostarkApiError('현재 로스트아크 API에서 지원하지 않는 요청입니다.', {
      status: response.status
    });
  }

  const data = await response.json();
  responseCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS
  });

  return data;
}

export function getCharacterProfile(characterName) {
  return request(`/armories/characters/${encodeURIComponent(characterName)}/profiles`);
}

export function getCharacterSiblings(characterName) {
  return request(`/characters/${encodeURIComponent(characterName)}/siblings`);
}

export function getCharacterEquipment(characterName) {
  return request(`/armories/characters/${encodeURIComponent(characterName)}/equipment`);
}

export function getCharacterEngravings(characterName) {
  return request(`/armories/characters/${encodeURIComponent(characterName)}/engravings`);
}

export function getCharacterGems(characterName) {
  return request(`/armories/characters/${encodeURIComponent(characterName)}/gems`);
}

export function getCharacterCards(characterName) {
  return request(`/armories/characters/${encodeURIComponent(characterName)}/cards`);
}

export function getChallengeAbyssDungeons() {
  return request('/gamecontents/challenge-abyss-dungeons');
}

export function getChallengeGuardianRaids() {
  return request('/gamecontents/challenge-guardian-raids');
}

export function getGameContentsCalendar() {
  return request('/gamecontents/calendar');
}

export function searchMarketItems(itemName, options = {}) {
  return request('/markets/items', {
    method: 'POST',
    body: {
      Sort: options.sort ?? '',
      CategoryCode: options.categoryCode ?? 40000,
      CharacterClass: '',
      ItemTier: options.itemTier ?? 0,
      ItemGrade: options.itemGrade ?? '',
      ItemName: itemName,
      PageNo: options.pageNo ?? 1,
      SortCondition: options.sortCondition ?? 'ASC'
    }
  });
}

export function searchAuctionItems(itemName, options = {}) {
  return request('/auctions/items', {
    method: 'POST',
    body: {
      Sort: options.sort ?? 'BUY_PRICE',
      CategoryCode: options.categoryCode ?? 210000,
      CharacterClass: '',
      ItemGradeQuality: options.itemGradeQuality ?? null,
      ItemUpgradeLevel: options.itemUpgradeLevel ?? null,
      ItemTier: options.itemTier ?? 4,
      ItemGrade: options.itemGrade ?? '',
      ItemName: itemName,
      PageNo: options.pageNo ?? 1,
      SortCondition: options.sortCondition ?? 'ASC',
      EtcOptions: options.etcOptions ?? []
    }
  });
}
