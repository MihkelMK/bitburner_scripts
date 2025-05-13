export async function main(ns: NS) {
  const target = ns.args[0] as string;

  while (true) {
    await ns.grow(target);
    await ns.weaken(target);
  }
}
