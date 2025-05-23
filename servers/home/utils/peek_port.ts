import { ALL_PORTS } from '../helpers/ports.js';

/**
 * @param data - context about the game, useful when autocompleting
 * @param args - current arguments, not including "run script.js"
 * @returns the array of possible autocomplete options
 */
export function autocomplete(_: AutocompleteData, args: string[]): number[] {
  if (args[0]) {
    return ALL_PORTS.filter((port) => String(port).startsWith(args[0]));
  }

  return ALL_PORTS;
}

export function prettifyPortData(value: string) {
  // Pretty print if JSON data
  try {
    const json = JSON.parse(value);
    return JSON.stringify(json, null, 1);
  } catch {
    return value;
  }
}

export async function main(ns: NS) {
  const args = ns.flags([['help', false]]);
  ns.print(args);

  if (args.help || ns.args.length < 1) {
    ns.tprint('Peek the value of a PORT');
    ns.tprint(`Usage: run ${ns.getScriptName()} PORT`);
    ns.tprint('Example:');
    ns.tprint(`> run ${ns.getScriptName()} 9000`);
    return;
  }

  const port = args._[0];
  const value = ns.peek(port);

  const prettyValue = prettifyPortData(value);
  ns.tprint(prettyValue);
}
