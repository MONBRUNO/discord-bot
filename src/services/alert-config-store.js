import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = path.resolve('data');
const CONFIG_PATH = path.join(DATA_DIR, 'alert-configs.json');

async function readConfigs() {
  try {
    const content = await fs.readFile(CONFIG_PATH, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }

    throw error;
  }
}

async function writeConfigs(configs) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(configs, null, 2)}\n`);
}

export async function getAlertConfig(guildId) {
  const configs = await readConfigs();
  return configs[guildId] ?? null;
}

export async function setAlertConfig(guildId, config) {
  const configs = await readConfigs();
  configs[guildId] = {
    ...(configs[guildId] ?? {}),
    ...config
  };

  await writeConfigs(configs);
  return configs[guildId];
}

export async function getAllAlertConfigs() {
  return readConfigs();
}
