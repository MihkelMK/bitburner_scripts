export async function main(ns: NS) {
  const totalAugments = ns.args[0] as number;

  const hackThresh = totalAugments < 5 ? 50 : totalAugments < 10 ? 100 : 200;
  const hackLevel = ns.getHackingLevel();
  ns.singularity.universityCourse('Rothman University', 'Algorithms');

  while (hackLevel < hackThresh) {
    ns.print('Studying Algorithms for 1 minute');
    await ns.sleep(1000 * 60);
  }

  ns.run('c2c/crawler.js', 1, true); // Run once
  ns.spawn('automation/train.js', { threads: 1, spawnDelay: 0 }, totalAugments);
}
