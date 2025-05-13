const GOAL_PORT = 9001;
const GOALS = ["hack", "ddos", "share"];

/**
 * @param {AutocompleteData} data - context about the game, useful when autocompleting
 * @param {string[]} args - current arguments, not including "run script.js"
 * @returns {string[]} - the array of possible autocomplete options
 */
export function autocomplete(data, args) {
  if (args[0]) {
    return GOALS.filter((goal) => goal.startsWith(args[0]))
  }

  return GOALS;
}

/** @param {NS} ns */
export async function main(ns) {
  const args = ns.flags([["help", false]]);

  if (args.help || args._.length < 1) {
    ns.tprint("Choose between botnet functions (" + GOALS.join("/") + ")");
    ns.tprint(`Usage: run ${ns.getScriptName()} FUNCTIONS`);
    ns.tprint("Example:");
    ns.tprint(`> run ${ns.getScriptName()} share`);
    return;
  }

  const goal = args._[0].toLowerCase();

  if (!GOALS.includes(goal)) {
    ns.tprint(goal + " is not a valid goal.");
    ns.tprint("Choose between: " + GOALS.join(", "));
  }

  ns.clearPort(GOAL_PORT);
  ns.writePort(GOAL_PORT, goal)
}