import { ALL_PORTS } from '../helpers/ports.js';

/**
 * @param _ - context about the game, useful when autocompleting
 * @param args - current arguments, not including "run script.js"
 * @returns the array of possible autocomplete options
 */
export function autocomplete(_: AutocompleteData, args: string[]): number[] {
  if (args[0]) {
    return ALL_PORTS.filter((port) => String(port).startsWith(args[0]));
  }

  return ALL_PORTS;
}

/** @param {NS} ns */
export async function main(ns: NS) {
  const args = ns.flags([['help', false]]);

  if (args.help || ns.args.length < 1) {
    ns.tprint('Clear the value of a PORT');
    ns.tprint(`Usage: run ${ns.getScriptName()} PORT`);
    ns.tprint('Example:');
    ns.tprint(`> run ${ns.getScriptName()} 9000`);
    return;
  }

  const port = args._[0];
  ns.clearPort(port);
}
