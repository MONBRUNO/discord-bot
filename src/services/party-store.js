import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = path.resolve('data');
const PARTIES_PATH = path.join(DATA_DIR, 'parties.json');

async function readData() {
  try {
    const content = await fs.readFile(PARTIES_PATH, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }

    throw error;
  }
}

async function writeData(data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(PARTIES_PATH, JSON.stringify(data, null, 2) + '\n');
}

function guildBucket(data, guildId) {
  if (!data[guildId]) {
    data[guildId] = { parties: [] };
  }

  if (!Array.isArray(data[guildId].parties)) {
    data[guildId].parties = [];
  }

  return data[guildId];
}

function normalizeParty(party) {
  const participantIds = Array.from(new Set((party.participantIds ?? []).filter(Boolean)));

  return {
    ...party,
    participantIds,
    status: party.status ?? 'open'
  };
}

export async function createParty({ guildId, channelId, title, capacity, leaderId }) {
  const data = await readData();
  const bucket = guildBucket(data, guildId);
  const now = new Date().toISOString();
  const party = normalizeParty({
    id: crypto.randomUUID().slice(0, 8),
    guildId,
    channelId,
    messageId: null,
    title,
    capacity,
    leaderId,
    participantIds: [leaderId],
    status: 'open',
    createdAt: now,
    updatedAt: now,
    bumpedAt: null,
    closedAt: null
  });

  bucket.parties.push(party);
  await writeData(data);
  return party;
}

export async function getParty(guildId, partyId) {
  const data = await readData();
  const bucket = guildBucket(data, guildId);
  const party = bucket.parties.find((item) => item.id === partyId);
  return party ? normalizeParty(party) : null;
}

export async function getParties(guildId) {
  const data = await readData();
  const bucket = guildBucket(data, guildId);

  return bucket.parties
    .map(normalizeParty)
    .sort((a, b) => String(b.bumpedAt ?? b.updatedAt ?? b.createdAt).localeCompare(String(a.bumpedAt ?? a.updatedAt ?? a.createdAt)));
}

export async function getOpenParties(guildId) {
  const parties = await getParties(guildId);
  return parties.filter((party) => party.status === 'open');
}

export async function updateParty(guildId, partyId, updater) {
  const data = await readData();
  const bucket = guildBucket(data, guildId);
  const index = bucket.parties.findIndex((item) => item.id === partyId);

  if (index === -1) {
    return null;
  }

  const current = normalizeParty(bucket.parties[index]);
  const next = normalizeParty(updater({ ...current, participantIds: [...current.participantIds] }) ?? current);
  bucket.parties[index] = {
    ...next,
    updatedAt: new Date().toISOString()
  };

  await writeData(data);
  return bucket.parties[index];
}

export async function joinPartyAsMember(guildId, partyId, userId) {
  const data = await readData();
  const bucket = guildBucket(data, guildId);
  const index = bucket.parties.findIndex((item) => item.id === partyId);

  if (index === -1) {
    return { ok: false, reason: 'not_found' };
  }

  const party = normalizeParty(bucket.parties[index]);

  if (party.status !== 'open') {
    return { ok: false, reason: 'closed', party };
  }

  if (party.participantIds.includes(userId)) {
    return { ok: false, reason: 'already_joined', party };
  }

  if (party.participantIds.length >= party.capacity) {
    return { ok: false, reason: 'full', party };
  }

  party.participantIds.push(userId);

  if (party.participantIds.length >= party.capacity) {
    party.status = 'closed';
    party.completedAt = new Date().toISOString();
    party.closedAt = party.completedAt;
  }

  party.updatedAt = new Date().toISOString();
  bucket.parties[index] = party;
  await writeData(data);
  return { ok: true, party, completed: Boolean(party.completedAt) };
}

export async function leavePartyAsMember(guildId, partyId, userId) {
  const data = await readData();
  const bucket = guildBucket(data, guildId);
  const index = bucket.parties.findIndex((item) => item.id === partyId);

  if (index === -1) {
    return { ok: false, reason: 'not_found' };
  }

  const party = normalizeParty(bucket.parties[index]);

  if (!party.participantIds.includes(userId)) {
    return { ok: false, reason: 'not_participant', party };
  }

  const wasCompleted = party.status !== 'open' && Boolean(party.completedAt);
  const isLeader = party.leaderId === userId;
  party.participantIds = party.participantIds.filter((id) => id !== userId);

  if (isLeader) {
    party.status = 'closed';
    party.closedAt = new Date().toISOString();
    party.leaderCancelledAt = party.closedAt;
  } else if (wasCompleted && party.participantIds.length < party.capacity) {
    party.status = 'open';
    party.completedAt = null;
    party.closedAt = null;
  }

  party.updatedAt = new Date().toISOString();
  bucket.parties[index] = party;
  await writeData(data);

  return {
    ok: true,
    party,
    leaderCancelled: isLeader,
    reopened: !isLeader && wasCompleted && party.status === 'open'
  };
}

export async function closeParty(guildId, partyId) {
  return updateParty(guildId, partyId, (party) => ({
    ...party,
    status: 'closed',
    closedAt: new Date().toISOString()
  }));
}
