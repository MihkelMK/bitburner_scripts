import { findOptimalPath } from './pathtoserver';

/**
 * @param data - context about the game, useful when autocompleting
 * @param args - current arguments, not including "run script.js"
 * @returns the array of possible autocomplete options
 */
export function autocomplete(data: AutocompleteData, args: string[]): string[] {
  const servers = data.servers;

  if (args[0]) {
    const filtered = servers.filter((server) =>
      server.toLowerCase().startsWith(args[0].toLowerCase())
    );

    if (filtered.length === 1 && args[0] === filtered[0]) {
      return;
    }
    return filtered;
  }

  return servers;
}

export function connectWithHops(ns: NS, start: string, dest: string): boolean {
  const path = findOptimalPath(ns, start, dest);

  for (let i in path) {
    const server = path[i];

    if (!ns.singularity.connect(server)) {
      return false;
    }
  }

  return true;
}

export async function main(ns: NS) {
  // Check if arguments were provided
  if (ns.args.length < 1) {
    ns.tprint('Usage: run ssh [target-hostname]');
    return;
  }

  const targetHost = String(ns.args[0]);

  connectWithHops(ns, ns.getHostname(), targetHost);
}
