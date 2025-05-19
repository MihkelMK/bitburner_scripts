export async function main(ns: NS) {
  const totalAugments = ns.args[0] as number;

  if (totalAugments < 10) {
    ns.singularity.commitCrime('Mug');
  } else {
    ns.singularity.commitCrime('Homicide');
  }

  ns.spawn('automation/botnet.js', { threads: 1, spawnDelay: 0 }, '--clear');
}
