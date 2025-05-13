import { findOptimalPath } from '../utils/pathtoserver.js';

/**
 * @param {AutocompleteData} data - context about the game, useful when autocompleting
 * @param {string[]} args - current arguments, not including "run script.js"
 * @returns {string[]} - the array of possible autocomplete options
 */
export function autocomplete(data, args) {
  const servers = data.servers;

  if (args[0]) {
    return servers.filter((server) => server.startsWith(args[0]));
  }

  return servers;
}

/** @param {NS} ns */
export function connectWithHops(ns, start, dest) {
  const path = findOptimalPath(ns, start, dest);

  for (let i in path) {
    const server = path[i];

    if (!ns.singularity.connect(server)) {
      return false;
    }
  }

  return true;
}

/** @param {NS} ns */
export async function main(ns) {
  // Check if arguments were provided
  if (ns.args.length < 1) {
    ns.tprint('Usage: run ssh [target-hostname]');
    return;
  }

  const targetHost = ns.args[0];

  connectWithHops(ns, ns.getHostname(), targetHost);
}

