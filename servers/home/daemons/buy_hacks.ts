import { notify } from '../helpers/cli';

export async function main(ns: NS) {
  while (true) {
    if (!ns.hasTorRouter()) {
      ns.singularity.purchaseTor();
      continue;
    }

    let waiting = false;
    const available = ns.singularity.getDarkwebPrograms();

    for (let i in available) {
      const script = available[i];

      if (!ns.fileExists(script)) {
        ns.print(script);
        if (
          ns.singularity.getDarkwebProgramCost(script) <=
          ns.getServerMoneyAvailable('home')
        ) {
          waiting = waiting || !ns.singularity.purchaseProgram(script);
        } else {
          waiting = true;
        }
      }
    }

    if (!waiting) {
      notify(ns, 'All hacks available', 'bh', 'success');
      ns.exit();
    }

    await ns.sleep(1000 * 60 * 2);
  }
}
