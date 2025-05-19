import { disable_logs, formatCurrency, notify } from '../helpers/cli';

export async function main(ns: NS) {
  disable_logs(ns, ['sleep', 'getServerMoneyAvailable']);

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
        if (
          ns.singularity.getDarkwebProgramCost(script) <=
          ns.getServerMoneyAvailable('home')
        ) {
          notify(
            ns,
            `Trying to buy ${script} for ${formatCurrency(ns, ns.singularity.getDarkwebProgramCost(script))}`
          );
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

    notify(ns, 'Waiting 1 minute for money');
    await ns.sleep(1000 * 60 * 1);
  }
}
