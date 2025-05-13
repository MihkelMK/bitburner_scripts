import { GOAL_PORT } from '../helpers/ports';

const GOALS = ['hack', 'ddos', 'share'];

/**
 * @param _data - context about the game, useful when autocompleting
 * @param args - current arguments, not including "run script.js"
 * @returns - the array of possible autocomplete options
 */
export function autocomplete(
  _data: AutocompleteData,
  args: string[]
): string[] {
  if (args[0]) {
    return GOALS.filter((goal) => goal.startsWith(args[0]));
  }

  return GOALS;
}

/** @param {NS} ns */
export async function main(ns: NS) {
  const args = ns.flags([['help', false]]);

  if (args.help || ns.args.length < 1) {
    ns.tprint('Choose between botnet functions (' + GOALS.join('/') + ')');
    ns.tprint(`Usage: run ${ns.getScriptName()} FUNCTIONS`);
    ns.tprint('Example:');
    ns.tprint(`> run ${ns.getScriptName()} share`);
    return;
  }

  const goal = args._[0].toLowerCase();

  if (!GOALS.includes(goal)) {
    ns.tprint(goal + ' is not a valid goal.');
    ns.tprint('Choose between: ' + GOALS.join(', '));
  }

  ns.clearPort(GOAL_PORT);
  ns.writePort(GOAL_PORT, goal);
}
