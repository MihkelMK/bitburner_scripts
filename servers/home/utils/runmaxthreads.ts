/**
 * @param data - context about the game, useful when autocompleting
 * @param args - current arguments, not including "run script.js"
 * @returns the array of possible autocomplete options
 */
export function autocomplete(data: AutocompleteData, args: string[]): string[] {
  const scripts = data.scripts;

  if (args[0]) {
    return scripts.filter((server) => server.startsWith(args[0]));
  }

  return scripts;
}

export async function main(ns: NS) {
  const args = ns.flags([['help', false]]);
  if (args.help || ns.args.length < 1) {
    ns.tprint('Run script with maximum threads, optionally keep some GB free.');
    ns.tprint(`Usage: run ${ns.getScriptName()} SCRIPT KEEPFREE`);
    ns.tprint('Example:');
    ns.tprint(`> run ${ns.getScriptName()} hack.js 4`);
    return;
  }

  const server = ns.getHostname();
  const script = String(ns.args.at(0));
  const keepfree = ns.args.length > 1 ? Number(ns.args.at(1)) : 0;

  if (!ns.ls(server).find((f) => f === script)) {
    ns.tprint(`Script '${script}' does not exist. Aborting.`);
    return;
  }

  ns.scriptKill(script, server);

  const threads = Math.floor(
    (ns.getServerMaxRam(server) - ns.getServerUsedRam(server) - keepfree) /
      ns.getScriptRam(script)
  );

  if (threads > 0) {
    ns.spawn(script, { threads: threads, spawnDelay: 0 });
  }
}
