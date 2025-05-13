/** @param {NS} ns */
export async function main(ns) {
  const args = ns.flags([['help', false]]);

  const target = args._[0];
  const timeout = Number(args._.at(1)) || 0;

  while (true) {
    await ns.hack(target);
    await ns.sleep(timeout);
  }
}

