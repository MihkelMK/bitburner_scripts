export async function main(ns: NS) {
  const totalAugments = ns.singularity.getOwnedAugmentations().length;

  ns.spawn('automation/study.js', { threads: 1, spawnDelay: 0 }, totalAugments);
}
