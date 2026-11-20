import { alertCommands } from './alerts.js';
import { command as help } from './help.js';
import { lostarkCommands } from './lostark.js';
import { command as ping } from './ping.js';
import { partyCommands } from './party.js';

export const commands = [ping, help, ...lostarkCommands, ...partyCommands, ...alertCommands];

export function createCommandCollection() {
  return new Map(commands.map((item) => [item.data.name, item]));
}
