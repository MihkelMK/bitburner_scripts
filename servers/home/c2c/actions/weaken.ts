export async function main(ns: NS) {
  const target = ns.args[0] as string;
  const timeout = Number(ns.args.at(1)) || 0;

  while (true) {
    await ns.weaken(target);
    await ns.sleep(timeout);
  }
}
