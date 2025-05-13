export async function main(ns: NS) {
  let total_hacks = 0;

  while (total_hacks < 5) {
    if (!ns.hasTorRouter()) {
      ns.singularity.purchaseTor();
      continue;
    }

    let hacks_dict = {
      brute: ns.fileExists('BruteSSH.exe'),
      ftp: ns.fileExists('FTPCrack.exe'),
      http: ns.fileExists('HTTPWorm.exe'),
      sql: ns.fileExists('SQLInject.exe'),
      smtp: ns.fileExists('relaySMTP.exe'),
    };

    const available = ns.singularity.getDarkwebPrograms();

    for (let i in available) {
      const script = available[i];

      if (script && hacks_dict[script]) continue;

      if (
        ns.singularity.getDarkwebProgramCost(script) <=
        ns.getServerMoneyAvailable('home')
      ) {
        ns.singularity.purchaseProgram(script);
      }
    }

    total_hacks = Object.entries(hacks_dict).filter(
      ([, exists]) => exists
    ).length;
    await ns.sleep(1000 * 60 * 2);
  }
}
