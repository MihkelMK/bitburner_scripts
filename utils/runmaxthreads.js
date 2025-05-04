/** @param {NS} ns */
export async function main(ns) {
  const args = ns.flags([["help", false]]);
  if (args.help || args._.length < 1) {
    ns.tprint("Run script with maximum threads, optionally keep some GB free.");
    ns.tprint(`Usage: run ${ns.getScriptName()} SCRIPT KEEPFREE`);
    ns.tprint("Example:");
    ns.tprint(`> run ${ns.getScriptName()} hack.js 4`);
    return;
  }

  const server = ns.getHostname();
  const script = args._[0];
  const keepfree = args._.length > 1 ? Number(args._[1]) : 0;

  if (!ns.ls(server).find(f => f === script)) {
    ns.tprint(`Script '${script}' does not exist. Aborting.`);
    return;
  }

  ns.scriptKill(script, server)

  const threads = Math.floor((ns.getServerMaxRam(server) - ns.getServerUsedRam(server) - keepfree) / ns.getScriptRam(script));

  if (threads > 0) {
    ns.spawn(script, { threads: threads, spawnDelay: 0 });
  }
}